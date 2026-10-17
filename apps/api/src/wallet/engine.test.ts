import { beforeEach, describe, expect, it } from 'vitest'
import type { WalletEvent } from '../../../../contracts'
import { cuidadoDeMama } from '../../../../contracts/ejemplo'
import { createEngine, type Engine } from './engine'
import { cop, fakeGuardian, fakePayments } from './test-fakes'

const farmacia = { name: 'Farmacia Medellín', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medellin' }
const falsa = { name: 'Farmacia (cuenta nueva)', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medel1in' }
const sinHttps = { name: 'Raro', walletAddress: 'http://ilp.interledger-test.dev/raro' }

let engine: Engine
let events: WalletEvent[]

beforeEach(() => {
  events = []
  engine = createEngine({ guardian: fakeGuardian, payments: fakePayments().svc, emit: (e) => events.push(e), now: () => 1 })
  engine.addWallet(structuredClone(cuidadoDeMama))
})

describe('requestSpend: revisión con el guardián', () => {
  it('escenario 2: medicina a la farmacia conocida → approved', () => {
    const s = engine.requestSpend('w-mama', farmacia, cop(120_000))
    expect(s.status).toBe('approved')
    expect(s.risk).toBe(0)
    expect(events.map((e) => e.type)).toEqual(['spend-requested', 'spend-reviewed', 'spend-approved'])
  })

  it('escenario 3: farmacia-medel1in → awaiting-approval, NO blocked', () => {
    const s = engine.requestSpend('w-mama', falsa, cop(120_000))
    expect(s.status).toBe('awaiting-approval')
    expect(s.risk).toBe(94)
  })

  it('monto mayor a $200.000 → awaiting-approval aunque el destino sea conocido', () => {
    expect(engine.requestSpend('w-mama', farmacia, cop(250_000)).status).toBe('awaiting-approval')
  })

  it('bloqueo duro del guardián → blocked', () => {
    const s = engine.requestSpend('w-mama', sinHttps, cop(10_000))
    expect(s.status).toBe('blocked')
    expect(events.at(-1)!.type).toBe('spend-blocked')
  })

  it('falla con una billetera que no existe', () => {
    expect(() => engine.requestSpend('no-existe', farmacia, cop(1))).toThrow(/no encontrada/)
  })
})

describe('addMember: unirse sin depositar', () => {
  const vacia = () => ({ ...structuredClone(cuidadoDeMama), id: 'w-vacia', members: [], authorizedCapacity: cop(0) })
  const nuevo = (id: string, assetCode = 'COP') => ({
    id, name: `Hermano ${id}`, walletAddress: `https://ilp.interledger-test.dev/${id}`, assetCode,
    cap: { value: '10000000', assetCode, assetScale: 2 }, interval: 'R12/2026-10-16T00:00:00Z/P1M', status: 'active' as const,
  })

  it('agrega al miembro, emite member-active y sube el cupo del grupo', () => {
    engine.addWallet(vacia())
    engine.addMember('w-vacia', nuevo('a'))
    const w = engine.addMember('w-vacia', nuevo('b'))
    expect(w.members.map((m) => m.id)).toEqual(['a', 'b'])
    expect(w.authorizedCapacity).toEqual(cop(0))
    expect(events.filter((e) => e.walletId === 'w-vacia').map((e) => e.type))
      .toEqual(['member-active', 'capacity-updated', 'member-active', 'capacity-updated'])
  })

  it('un miembro en EUR se agrega pero no suma al cupo en COP (falta conversión)', () => {
    engine.addWallet(vacia())
    expect(engine.addMember('w-vacia', nuevo('madrid', 'EUR')).authorizedCapacity).toEqual(cop(0))
  })

  it('rechaza duplicados, miembros no activos y billeteras inexistentes', () => {
    engine.addWallet(vacia())
    engine.addMember('w-vacia', nuevo('a'))
    expect(() => engine.addMember('w-vacia', nuevo('a'))).toThrow(/Ya es miembro/)
    expect(() => engine.addMember('w-vacia', { ...nuevo('c'), status: 'revoked' })).toThrow(/activos/)
    expect(() => engine.addMember('no-existe', nuevo('d'))).toThrow(/no encontrada/)
  })
})

describe('refreshCapacity: cupo real con available()', () => {
  it('usa lo que le queda a cada miembro y emite capacity-updated', async () => {
    const quedan: Record<string, number> = { 'm-bogota': 60_000, 'm-medellin': 100_000 }
    const w = await engine.refreshCapacity('w-mama', async (id) =>
      id === 'm-madrid' ? { value: '2200', assetCode: 'EUR', assetScale: 2 } : cop(quedan[id]))
    expect(w.members.map((m) => m.available?.value)).toEqual(['6000000', '10000000', '2200'])
    expect(w.authorizedCapacity).toEqual(cop(160_000))   // EUR no se suma sin conversión
    expect(events.at(-1)).toMatchObject({ type: 'capacity-updated', amount: cop(160_000) })
  })

  it('si available() falla excluye ese importe y declara cupo incompleto, sin mezclar EUR', async () => {
    const w = await engine.refreshCapacity('w-mama', async (id) => {
      if (id === 'm-bogota') throw new Error('No se pudo consultar el cupo autorizado')
      return id === 'm-madrid' ? { value: '2200', assetCode: 'EUR', assetScale: 2 } : cop(10_000)
    })
    expect(w.members[0].available).toBeUndefined()
    expect(w.capacityStale).toBe(true)
    expect(w.authorizedCapacity).toEqual(cop(10_000))
    expect(w.capacityByAsset).toEqual([cop(10_000), { value: '2200', assetCode: 'EUR', assetScale: 2 }])
  })
})

describe('reset: reinicio de demo', () => {
  it('reemplaza las billeteras y borra los gastos', () => {
    engine.requestSpend('w-mama', farmacia, cop(120_000))
    engine.reset([{ ...structuredClone(cuidadoDeMama), members: [] }])
    expect(engine.listSpends('w-mama')).toEqual([])
    expect(engine.getWallet('w-mama').members).toEqual([])
  })

  it('se niega con un pago en curso', async () => {
    const lento = createEngine({
      guardian: fakeGuardian, emit: () => {}, pollMs: 0, maxPolls: 1000, sleep: () => new Promise((r) => setTimeout(r, 5)),
      payments: fakePayments({ trackAs: { 'm-bogota': 'pending' } }).svc,
    })
    lento.addWallet(structuredClone(cuidadoDeMama))
    const { id } = lento.requestSpend('w-mama', farmacia, cop(120_000))
    void lento.executeSpend(id)
    await new Promise((r) => setTimeout(r, 10))
    expect(lento.getSpend(id).status).toBe('paying')
    expect(() => lento.reset([])).toThrow(/pago en curso/)
  })
})

describe('castApproval: aprobación del grupo (2 de 3)', () => {
  it('dos sí → approved', () => {
    const { id } = engine.requestSpend('w-mama', falsa, cop(120_000))
    engine.castApproval(id, 'm-bogota', true)
    expect(engine.getSpend(id).status).toBe('awaiting-approval')
    expect(engine.castApproval(id, 'm-madrid', true).status).toBe('approved')
  })

  it('destino falso (riesgo alto): un solo no → rejected', () => {
    const { id } = engine.requestSpend('w-mama', falsa, cop(120_000))
    expect(engine.castApproval(id, 'm-bogota', false).status).toBe('rejected')
    expect(events.at(-1)).toMatchObject({ type: 'spend-rejected', message: 'Un miembro del grupo rechazó un pago riesgoso.' })
  })

  it('destino falso: un solo sí no basta, sigue en awaiting-approval', () => {
    const { id } = engine.requestSpend('w-mama', falsa, cop(120_000))
    expect(engine.castApproval(id, 'm-bogota', true).status).toBe('awaiting-approval')
  })

  it('aprobación solo por monto (riesgo bajo): un no no rechaza, dos no sí', () => {
    const { id, risk } = engine.requestSpend('w-mama', farmacia, cop(250_000))
    expect(risk).toBe(0)
    expect(engine.castApproval(id, 'm-bogota', false).status).toBe('awaiting-approval')
    expect(engine.castApproval(id, 'm-medellin', false).status).toBe('rejected')
    expect(events.at(-1)).toMatchObject({ type: 'spend-rejected', message: 'El grupo rechazó el gasto.' })
  })

  it('no deja votar dos veces ni a quien no es miembro', () => {
    const { id } = engine.requestSpend('w-mama', falsa, cop(120_000))
    engine.castApproval(id, 'm-bogota', true)
    expect(() => engine.castApproval(id, 'm-bogota', true)).toThrow(/Ya votó/)
    expect(() => engine.castApproval(id, 'intruso', true)).toThrow(/No es miembro/)
  })

  it('no acepta votos en un gasto que no espera aprobación', () => {
    const { id } = engine.requestSpend('w-mama', farmacia, cop(120_000))
    expect(() => engine.castApproval(id, 'm-bogota', true)).toThrow(/no está esperando/)
  })
})
