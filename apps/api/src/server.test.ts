import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WalletEvent } from '../../../contracts'
import { cuidadoDeMama } from '../../../contracts/ejemplo'
import { createApp, createEventBus } from './server'
import { createEngine } from './wallet/engine'
import { cop, fakeGuardian, fakePayments } from './wallet/test-fakes'

const farmacia = { name: 'Farmacia Medellín', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medellin' }
const falsa = { name: 'Farmacia (cuenta nueva)', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medel1in' }

let server: Server
let base: string

beforeEach(async () => {
  const bus = createEventBus()
  const engine = createEngine({
    guardian: fakeGuardian, payments: fakePayments().svc, emit: bus.emit,
    pollMs: 0, sleep: async () => {},
  })
  engine.addWallet(structuredClone(cuidadoDeMama))
  server = createApp({ engine, bus }).listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
})

const post = (path: string, body: unknown) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// Lee eventos SSE hasta que llegue uno del tipo pedido.
async function readEventsUntil(res: Response, type: WalletEvent['type']): Promise<WalletEvent[]> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  const events: WalletEvent[] = []
  let buffer = ''
  while (!events.some((e) => e.type === type)) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop()!
    for (const b of blocks) if (b.startsWith('data: ')) events.push(JSON.parse(b.slice(6)))
  }
  await reader.cancel()
  return events
}

describe('API REST', () => {
  it('GET de la billetera devuelve el cupo autorizado', async () => {
    const res = await fetch(`${base}/api/wallets/w-mama`)
    expect(res.status).toBe(200)
    expect((await res.json()).authorizedCapacity).toEqual(cop(300_000))
  })

  it('pedir la medicina → 201 approved', async () => {
    const res = await post('/api/wallets/w-mama/spends', { destination: farmacia, amount: cop(120_000) })
    expect(res.status).toBe(201)
    expect((await res.json()).status).toBe('approved')
  })

  it('farmacia-medel1in + dos votos sí → approved', async () => {
    const spend = await (await post('/api/wallets/w-mama/spends', { destination: falsa, amount: cop(120_000) })).json()
    expect(spend.status).toBe('awaiting-approval')
    await post(`/api/spends/${spend.id}/approvals`, { memberId: 'm-bogota', yes: true })
    const res = await post(`/api/spends/${spend.id}/approvals`, { memberId: 'm-medellin', yes: true })
    expect((await res.json()).status).toBe('approved')
  })

  it('GET /api/wallets lista las billeteras (selector de R4)', async () => {
    const res = await fetch(`${base}/api/wallets`)
    expect(res.status).toBe(200)
    expect((await res.json()).map((w: { id: string }) => w.id)).toEqual(['w-mama'])
  })

  it('GET /api/spends/:id devuelve el gasto con su estado', async () => {
    const spend = await (await post('/api/wallets/w-mama/spends', { destination: falsa, amount: cop(120_000) })).json()
    const res = await fetch(`${base}/api/spends/${spend.id}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: spend.id, status: 'awaiting-approval', risk: 94 })
  })

  it('GET /api/spends/:id inexistente → 404', async () => {
    const res = await fetch(`${base}/api/spends/no-existe`)
    expect(res.status).toBe(404)
    expect((await res.json()).error).toMatch(/no encontrado/)
  })

  it('billetera inexistente → 404', async () => {
    const res = await fetch(`${base}/api/wallets/no-existe`)
    expect(res.status).toBe(404)
    expect((await res.json()).error).toMatch(/no encontrada/)
  })

  it('cuerpo mal formado → 400', async () => {
    const res = await post('/api/wallets/w-mama/spends', { destination: farmacia, amount: 120000 })
    expect(res.status).toBe(400)
  })

  it('ejecutar un gasto en aprobación → 409', async () => {
    const spend = await (await post('/api/wallets/w-mama/spends', { destination: falsa, amount: cop(120_000) })).json()
    const res = await post(`/api/spends/${spend.id}/execute`, {})
    expect(res.status).toBe(409)
  })

  it('votar dos veces → 409', async () => {
    const spend = await (await post('/api/wallets/w-mama/spends', { destination: falsa, amount: cop(120_000) })).json()
    await post(`/api/spends/${spend.id}/approvals`, { memberId: 'm-bogota', yes: true })
    const res = await post(`/api/spends/${spend.id}/approvals`, { memberId: 'm-bogota', yes: true })
    expect(res.status).toBe(409)
  })
})

describe('SSE', () => {
  it('execute → 202 y por SSE llegan 3 share-paid y spend-paid', async () => {
    const stream = await fetch(`${base}/api/wallets/w-mama/events`)
    expect(stream.headers.get('content-type')).toMatch(/text\/event-stream/)
    const spend = await (await post('/api/wallets/w-mama/spends', { destination: farmacia, amount: cop(120_000) })).json()
    const exec = await post(`/api/spends/${spend.id}/execute`, {})
    expect(exec.status).toBe(202)

    const events = await readEventsUntil(stream, 'spend-paid')
    expect(events.filter((e) => e.type === 'share-paid').map((e) => e.message))
      .toEqual(['1 de 3 aportes confirmados', '2 de 3 aportes confirmados', '3 de 3 aportes confirmados'])
    expect(events.at(-1)).toMatchObject({ type: 'spend-paid', walletId: 'w-mama', message: 'Gasto verificado' })
  })

  it('SSE de una billetera inexistente → 404', async () => {
    expect((await fetch(`${base}/api/wallets/no-existe/events`)).status).toBe(404)
  })
})
