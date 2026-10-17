import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MembersService } from '../../../contracts'
import { cuidadoDeMama } from '../../../contracts/ejemplo'
import { createApp, createEventBus } from './server'
import { createEngine } from './wallet/engine'
import { cop, fakeGuardian, fakePayments } from './wallet/test-fakes'

const started: unknown[] = []
const fakeMembers = (): MembersService => ({
  async startJoin(_walletId: string, member: unknown) {
    started.push(member)
    return { redirectUrl: 'https://wallet.example/consent', grantWarning: { check: 'grant', status: 'pass', riskPoints: 0, userMessage: 'ok', reasons: [] } }
  },
} as unknown as MembersService)

let server: Server
let base: string

beforeEach(async () => {
  started.length = 0
  const bus = createEventBus()
  const engine = createEngine({ guardian: fakeGuardian, payments: fakePayments().svc, emit: bus.emit })
  engine.addWallet({ ...structuredClone(cuidadoDeMama), members: [], authorizedCapacity: cop(0) })
  server = createApp({ engine, bus, security: false, join: { webUrl: 'http://localhost:5173', createService: () => fakeMembers() } }).listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
})

const post = (path: string, body: unknown) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

const grupo = (extra: object = {}) => ({
  name: 'Medicinas de mamá', currency: 'COP', approvalsRequired: 2, aboveAmount: cop(200_000),
  knownDestinations: [{ name: 'Farmacia', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medellin' }],
  memberCap: { cap: cop(40_000) }, ...extra,
})

async function crear(extra: object = {}) {
  const res = await post('/api/wallets', grupo(extra))
  return { res, wallet: await res.json() }
}

const miembro = (cap: object, interval: string) => ({ name: 'ana', walletAddress: 'https://ilp.interledger-test.dev/ana', cap, interval })

describe('POST /api/wallets con memberCap', () => {
  it('guarda el tope y arma el intervalo en el servidor (hoy, UTC)', async () => {
    const { res, wallet } = await crear()
    expect(res.status).toBe(201)
    const hoy = new Date().toISOString().slice(0, 10)
    expect(wallet.rules.memberCap).toEqual({ cap: cop(40_000), interval: `R12/${hoy}T00:00:00Z/P1M` })
  })

  it('ignora un intervalo enviado por el cliente', async () => {
    const { wallet } = await crear({ memberCap: { cap: cop(40_000), interval: 'R1/2020-01-01T00:00:00Z/P1D' } })
    expect(wallet.rules.memberCap.interval).toMatch(/^R12\/\d{4}-\d{2}-\d{2}T00:00:00Z\/P1M$/)
  })

  it('sin memberCap el grupo se crea igual, sin ese campo', async () => {
    const { memberCap: _omitido, ...sinTope } = grupo()
    const res = await post('/api/wallets', sinTope)
    expect(res.status).toBe(201)
    expect((await res.json()).rules).not.toHaveProperty('memberCap')
  })

  const invalidos: [string, unknown][] = [
    ['no es Money', 'cuarenta mil'],
    ['en otra moneda', { cap: { ...cop(40_000), assetCode: 'EUR' } }],
    ['en escala distinta de 2', { cap: { value: '40000', assetCode: 'COP', assetScale: 0 } }],
    ['en 0', { cap: cop(0) }],
    ['sin cap', {}],
  ]
  it.each(invalidos)('400 si el tope por persona %s', async (_caso, memberCap) => {
    const { res } = await crear({ memberCap })
    expect(res.status).toBe(400)
    expect(await (await fetch(`${base}/api/wallets`)).json()).toHaveLength(1)   // solo la semilla
  })
})

describe('POST /api/wallets/:id/join con memberCap', () => {
  it('acepta el tope y la periodicidad iguales a los del contrato', async () => {
    const { wallet } = await crear()
    const res = await post(`/api/wallets/${wallet.id}/join`, miembro(wallet.rules.memberCap.cap, wallet.rules.memberCap.interval))
    expect(res.status).toBe(200)
    expect(started).toHaveLength(1)
  })

  it.each([
    ['otro tope', (c: { cap: object; interval: string }) => miembro(cop(50_000), c.interval)],
    ['otra periodicidad', (c: { cap: object; interval: string }) => miembro(c.cap, 'R12/2026-01-01T00:00:00Z/P1W')],
  ])('400 si el miembro manda %s en la moneda del grupo', async (_caso, armar) => {
    const { wallet } = await crear()
    const res = await post(`/api/wallets/${wallet.id}/join`, armar(wallet.rules.memberCap))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('El tope y la periodicidad los fija el contrato del grupo.')
    expect(started).toHaveLength(0)
  })

  it('en otra moneda acepta el tope propio del miembro', async () => {
    const { wallet } = await crear()
    const eur = { value: '2200', assetCode: 'EUR', assetScale: 2 }
    const res = await post(`/api/wallets/${wallet.id}/join`, miembro(eur, 'R12/2026-10-16T00:00:00Z/P1M'))
    expect(res.status).toBe(200)
    expect(started).toEqual([expect.objectContaining({ cap: eur })])
  })

  it('un grupo de las semillas (sin memberCap) se une igual que antes', async () => {
    const res = await post('/api/wallets/w-mama/join', miembro(cop(100_000), 'R12/2026-10-16T00:00:00Z/P1M'))
    expect(res.status).toBe(200)
    expect(started).toEqual([expect.objectContaining({ cap: cop(100_000) })])
  })
})
