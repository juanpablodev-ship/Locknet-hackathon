import { describe, expect, it } from 'vitest'
import { getSpends, getWallet, getWallets, resetMock } from './api.mock.js'

describe('getWallets', () => {
  it('devuelve las tres billeteras con sus kinds', () => {
    const wallets = getWallets()
    expect(wallets).toHaveLength(3)
    expect(wallets.map((w) => w.kind).sort()).toEqual(['care', 'goal', 'investment'])
  })

  it('tiene ids únicos', () => {
    const ids = getWallets().map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('getWallet', () => {
  it('w-mama tiene authorizedCapacity.value "30000000"', () => {
    expect(getWallet('w-mama').authorizedCapacity.value).toBe('30000000')
  })

  it('lanza error si la billetera no existe', () => {
    expect(() => getWallet('nada')).toThrow('Billetera no encontrada')
  })

  it('mutar el resultado no afecta una segunda llamada', () => {
    const primera = getWallet('w-mama')
    primera.name = 'cambiado'
    primera.members.pop()

    const segunda = getWallet('w-mama')
    expect(segunda.name).toBe('Cuidado de mamá')
    expect(segunda.members).toHaveLength(3)
  })
})

describe('getSpends', () => {
  it('w-mama trae la medicina y w-parque no tiene gastos', () => {
    expect(getSpends('w-mama')).toHaveLength(1)
    expect(getSpends('w-mama')[0].id).toBe('s-medicina')
    expect(getSpends('w-parque')).toEqual([])
  })

  it('mutar el resultado no afecta una segunda llamada', () => {
    const primera = getSpends('w-mama')
    primera.pop()

    const segunda = getSpends('w-mama')
    expect(segunda).toHaveLength(1)
  })
})

describe('resetMock', () => {
  it('restaura los datos iniciales después de mutarlos', () => {
    const wallet = getWallet('w-mama')
    wallet.name = 'cambiado'

    const spendsMama = getSpends('w-mama')
    spendsMama.pop()

    resetMock()

    expect(getWallet('w-mama').name).toBe('Cuidado de mamá')
    expect(getSpends('w-mama')).toHaveLength(1)
  })
})
