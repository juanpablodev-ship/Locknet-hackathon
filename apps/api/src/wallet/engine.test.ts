import { beforeEach, describe, expect, it } from 'vitest'
import type { Guardian, Money, Verdict, WalletEvent } from '../../../../contracts'
import { cuidadoDeMama } from '../../../../contracts/ejemplo'
import { createEngine, type Engine } from './engine'

const cop = (pesos: number): Money => ({ value: String(pesos * 100), assetCode: 'COP', assetScale: 2 })
const farmacia = { name: 'Farmacia Medellín', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medellin' }
const falsa = { name: 'Farmacia (cuenta nueva)', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medel1in' }
const sinHttps = { name: 'Raro', walletAddress: 'http://ilp.interledger-test.dev/raro' }

// Guardián falso, solo para estas pruebas. Se reemplaza por /mocks/guardian.mock.ts (R5) o el real.
const verdict = (status: Verdict['status'], riskPoints: number, userMessage: string): Verdict =>
  ({ check: 'destination', status, riskPoints, userMessage, reasons: [] })
const fakeGuardian = {
  checkDestination: ({ walletAddress, known }) => {
    if (!walletAddress.startsWith('https://')) return verdict('block', 100, 'Destino sin HTTPS.')
    if (known.some((k) => k.walletAddress === walletAddress)) return verdict('pass', 0, 'Destino conocido.')
    if (walletAddress.endsWith('medel1in')) return verdict('warn', 94, 'Se parece a la farmacia, pero no es la misma.')
    return verdict('warn', 20, 'Destino nuevo.')
  },
  riskScore: (vs) => (vs.some((v) => v.status === 'block') ? 100 : Math.min(100, vs.reduce((n, v) => n + v.riskPoints, 0))),
} as Pick<Guardian, 'checkDestination' | 'riskScore'> as Guardian

let engine: Engine
let events: WalletEvent[]

beforeEach(() => {
  events = []
  engine = createEngine({ guardian: fakeGuardian, emit: (e) => events.push(e), now: () => 1 })
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

describe('castApproval: aprobación del grupo (2 de 3)', () => {
  it('dos sí → approved', () => {
    const { id } = engine.requestSpend('w-mama', falsa, cop(120_000))
    engine.castApproval(id, 'm-bogota', true)
    expect(engine.getSpend(id).status).toBe('awaiting-approval')
    expect(engine.castApproval(id, 'm-madrid', true).status).toBe('approved')
  })

  it('dos no → rejected (ya no se alcanzan 2 sí)', () => {
    const { id } = engine.requestSpend('w-mama', falsa, cop(120_000))
    engine.castApproval(id, 'm-bogota', false)
    expect(engine.castApproval(id, 'm-medellin', false).status).toBe('rejected')
    expect(events.at(-1)!.type).toBe('spend-rejected')
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
