import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { cuidadoDeMama } from '../../../contracts/ejemplo'
import { createApp, createEventBus } from './server'
import { createEngine } from './wallet/engine'
import { cop, fakeGuardian, fakePayments } from './wallet/test-fakes'

let server: Server | undefined
afterEach(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined }
})

describe('POST recheck: consulta sin nuevos pagos', () => {
  it.each(['completed', 'pending'] as const)('espera y devuelve el estado consultado %s', async result => {
    const payments = fakePayments({ trackAs: { 'm-madrid': 'pending' } })
    const bus = createEventBus()
    const engine = createEngine({ guardian: fakeGuardian, payments: payments.svc, emit: bus.emit, incomingPerShare: true, maxPolls: 1 })
    engine.addWallet(structuredClone(cuidadoDeMama))
    const spend = engine.requestSpend('w-mama', cuidadoDeMama.knownDestinations[0], cop(120_000))
    await engine.executeSpend(spend.id)
    const before = payments.calls.payShare
    payments.opts.trackAs!['m-madrid'] = result
    server = createApp({ engine, bus, security: false }).listen(0, '127.0.0.1')
    await new Promise(resolve => server!.once('listening', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const response = await fetch(`${base}/api/spends/${spend.id}/recheck`, { method: 'POST' })
    expect(response.status).toBe(200)
    const updated = await response.json()
    expect(updated.status).toBe(result === 'completed' ? 'paid' : 'incomplete')
    expect(updated.shares[2].status).toBe(result === 'completed' ? 'paid' : 'pending')
    expect(payments.calls.payShare).toBe(before)
    expect(payments.calls.createIncoming).toHaveLength(3)
  })
})

it('responde 409, no 202, si un gasto anterior impide crear pagos nuevos', async () => {
  const payments = fakePayments({ trackAs: { 'm-madrid': 'pending' } })
  const bus = createEventBus()
  const engine = createEngine({ guardian: fakeGuardian, payments: payments.svc, emit: bus.emit, incomingPerShare: true, maxPolls: 1 })
  engine.addWallet(structuredClone(cuidadoDeMama))
  const previous = engine.requestSpend('w-mama', cuidadoDeMama.knownDestinations[0], cop(120_000), 'anterior')
  await engine.executeSpend(previous.id)
  const next = engine.requestSpend('w-mama', cuidadoDeMama.knownDestinations[0], cop(120_000), 'nuevo')
  const before = payments.calls.payShare
  server = createApp({ engine, bus, security: false }).listen(0, '127.0.0.1')
  await new Promise(resolve => server!.once('listening', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const response = await fetch(`${base}/api/spends/${next.id}/execute`, { method: 'POST' })
  expect(response.status).toBe(409)
  expect((await response.json()).error).toContain('pago pendiente o desconocido')
  expect(engine.getSpend(next.id).status).toBe('approved')
  expect(payments.calls.payShare).toBe(before)
})
