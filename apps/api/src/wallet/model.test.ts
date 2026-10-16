import { describe, expect, it } from 'vitest'
import type { Money } from '../../../../contracts'
import { cuidadoDeMama } from '../../../../contracts/ejemplo'
import { groupCapacity, newSpend, splitEqual } from './model'

const cop = (pesos: number): Money => ({ value: String(pesos * 100), assetCode: 'COP', assetScale: 2 })

describe('splitEqual', () => {
  it('$120.000 entre 3 = $40.000 cada uno', () => {
    expect(splitEqual(cop(120_000), 3).map((m) => m.value)).toEqual(['4000000', '4000000', '4000000'])
  })

  it('reparte el residuo sin perder ni un centavo', () => {
    const parts = splitEqual({ value: '100', assetCode: 'COP', assetScale: 2 }, 3)
    expect(parts.map((m) => m.value)).toEqual(['34', '33', '33'])
  })

  it('falla si no hay miembros', () => {
    expect(() => splitEqual(cop(1), 0)).toThrow()
  })
})

describe('groupCapacity', () => {
  const available = async (id: string) =>
    cuidadoDeMama.members.find((m) => m.id === id)!.available!
  const eurToCop = (m: Money): Money => ({ value: String(BigInt(m.value) * 4545n), assetCode: 'COP', assetScale: 2 })

  it('suma el cupo de los 3 hermanos (uno en EUR) ≈ $300.000', async () => {
    const total = await groupCapacity(cuidadoDeMama, available, eurToCop)
    expect(total.assetCode).toBe('COP')
    expect(total.value).toBe(String(2 * 10_000_000 + 2200 * 4545)) // 200.000 + 99.990 COP
  })

  it('no cuenta a quien revocó', async () => {
    const w = structuredClone(cuidadoDeMama)
    w.members[2].status = 'revoked'
    expect((await groupCapacity(w, available, eurToCop)).value).toBe('20000000')
  })

  it('falla si el conversor no devuelve la moneda de la billetera', async () => {
    const malo = (m: Money) => m
    await expect(groupCapacity(cuidadoDeMama, available, malo)).rejects.toThrow(/no comparables/)
  })
})

describe('newSpend', () => {
  it('crea el gasto en requested con 0 de 3 aportes', () => {
    const s = newSpend({ wallet: cuidadoDeMama, destination: cuidadoDeMama.knownDestinations[0], amount: cop(120_000) })
    expect(s.status).toBe('requested')
    expect(s.progress).toEqual({ confirmed: 0, total: 3 })
    expect(s.shares.every((sh) => sh.status === 'pending' && sh.share.value === '4000000')).toBe(true)
  })
})
