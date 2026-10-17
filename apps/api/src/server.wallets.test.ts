import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { guardian } from '../../../packages/guardian/src/index.js'
import { cuidadoDeMama } from '../../../contracts/ejemplo'
import { createApp, createEventBus } from './server'
import { createEngine } from './wallet/engine'
import { cop, fakePayments } from './wallet/test-fakes'

const valid = () => ({
  name: 'Medicinas de mamá', currency: 'COP', approvalsRequired: 2, aboveAmount: cop(100_000),
  knownDestinations: [{ name: 'Farmacia Medellín', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medellin' }],
})

let server: Server
let engine: ReturnType<typeof createEngine>
let base: string

beforeEach(async () => {
  const bus = createEventBus()
  engine = createEngine({ guardian, payments: fakePayments().svc, emit: bus.emit, pollMs: 0, sleep: async () => {} })
  server = createApp({ engine, bus, security: false }).listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
})

const post = (path: string, body: unknown) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('POST /api/wallets', () => {
  it('crea un grupo válido y aparece en GET /api/wallets', async () => {
    const res = await post('/api/wallets', valid())
    expect(res.status).toBe(201)
    const w = await res.json()
    expect(w.id).toMatch(/^w-medicinas-de-mama-[a-z0-9]{6}$/)
    expect(w).toMatchObject({ kind: 'care', members: [], authorizedCapacity: { value: '0', assetCode: 'COP', assetScale: 2 } })
    expect(w.rules).toEqual({ split: 'equal', groupApproval: { aboveAmount: cop(100_000), approvalsRequired: 2, riskThreshold: 60, confirmInWallet: false } })
    const list = await (await fetch(`${base}/api/wallets`)).json()
    expect(list.map((x: { id: string }) => x.id)).toContain(w.id)
  })

  it('riskThreshold por defecto es 60 y se respeta si viene', async () => {
    expect((await (await post('/api/wallets', valid())).json()).rules.groupApproval.riskThreshold).toBe(60)
    const w = await (await post('/api/wallets', { ...valid(), riskThreshold: 80 })).json()
    expect(w.rules.groupApproval.riskThreshold).toBe(80)
  })

  it('dos grupos con el mismo nombre tienen ids distintos', async () => {
    const a = await (await post('/api/wallets', valid())).json()
    const b = await (await post('/api/wallets', valid())).json()
    expect(a.id).not.toBe(b.id)
  })

  const dest = (walletAddress: string) => [{ name: 'X', walletAddress }]
  const invalid: [string, object][] = [
    ['nombre vacío', { name: '' }],
    ['nombre con espacios al borde', { name: ' Mamá' }],
    ['nombre de más de 60', { name: 'a'.repeat(61) }],
    ['nombre que no es texto', { name: 5 }],
    ['moneda no permitida', { currency: 'MXN', aboveAmount: { ...cop(1), assetCode: 'MXN' } }],
    ['aprobaciones 0', { approvalsRequired: 0 }],
    ['aprobaciones 6', { approvalsRequired: 6 }],
    ['aprobaciones decimal', { approvalsRequired: 1.5 }],
    ['aboveAmount no es Money', { aboveAmount: 'cien' }],
    ['aboveAmount en otra moneda', { aboveAmount: { ...cop(1000), assetCode: 'EUR' } }],
    ['aboveAmount en escala distinta de 2', { aboveAmount: { value: '1000', assetCode: 'COP', assetScale: 0 } }],
    ['aboveAmount en 0', { aboveAmount: cop(0) }],
    ['riskThreshold 0', { riskThreshold: 0 }],
    ['riskThreshold 101', { riskThreshold: 101 }],
    ['riskThreshold decimal', { riskThreshold: 50.5 }],
    ['sin destinos', { knownDestinations: [] }],
    ['más de 5 destinos', { knownDestinations: Array.from({ length: 6 }, () => dest('https://a.dev/x')[0]) }],
    ['destino sin nombre', { knownDestinations: [{ name: '', walletAddress: 'https://a.dev/x' }] }],
    ['dirección http://', { knownDestinations: dest('http://a.dev/x') }],
    ['dirección sin esquema', { knownDestinations: dest('farmacia') }],
    ['dirección https:// sin host', { knownDestinations: dest('https://') }],
  ]
  it.each(invalid)('400 si %s', async (_caso, cambio) => {
    const res = await post('/api/wallets', { ...valid(), ...cambio })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/\S/)
    expect((await (await fetch(`${base}/api/wallets`)).json())).toEqual([])
  })

  it('acepta direcciones con $', async () => {
    const res = await post('/api/wallets', { ...valid(), knownDestinations: dest('$ilp.interledger-test.dev/farmacia') })
    expect(res.status).toBe(201)
  })

  it('de punta a punta: un destino parecido al de confianza da riesgo 94', async () => {
    const w = await (await post('/api/wallets', valid())).json()
    engine.addMember(w.id, structuredClone(cuidadoDeMama.members[0]))   // un grupo nuevo no tiene miembros; sin ellos no hay a quién repartir el gasto
    const res = await post(`/api/wallets/${w.id}/spends`, {
      destination: { name: 'Farmacia (cuenta nueva)', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medel1in' },
      amount: cop(50_000),
    })
    expect(res.status).toBe(201)
    expect((await res.json()).risk).toBe(94)
  })
})
