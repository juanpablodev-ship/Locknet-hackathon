import { describe, expect, it } from 'vitest'
import { createEngine } from './engine'
import { fakeGuardian, fakePayments, cop } from './test-fakes'
import { cuidadoDeMama } from '../../../../contracts/ejemplo'

function setup(options: Parameters<typeof fakePayments>[0] = {}) {
  const fake = fakePayments(options)
  const engine = createEngine({ guardian: fakeGuardian, payments: fake.svc, emit: () => {}, incomingPerShare: true, maxPolls: 1 })
  engine.addWallet(structuredClone(cuidadoDeMama))
  const spend = engine.requestSpend('w-mama', cuidadoDeMama.knownDestinations[0], cop(120000))
  return { engine, fake, spend }
}
describe('recuperacion sin repetir pagos', () => {
  it('crear otro gasto no evita el bloqueo por un resultado anterior desconocido', async () => {
    const f = setup({ trackAs: { 'm-madrid': 'pending' } })
    await f.engine.executeSpend(f.spend.id)
    const next = f.engine.requestSpend('w-mama', cuidadoDeMama.knownDestinations[0], cop(120000))
    await expect(f.engine.executeSpend(next.id)).rejects.toThrow('Otro gasto')
    expect(f.fake.calls.payShare).toBe(3)
    f.fake.opts.trackAs!['m-madrid'] = 'completed'
    await f.engine.recheckSpend(f.spend.id)
    await expect(f.engine.executeSpend(next.id)).resolves.toMatchObject({ status: 'paid' })
    expect(f.fake.calls.payShare).toBe(6)
  })
  it('pending conserva IDs, bloquea reintento/reset y reconsulta sin crear otro pago', async () => {
    const f = setup({ trackAs: { 'm-madrid': 'pending' } })
    await f.engine.executeSpend(f.spend.id)
    expect(f.spend.shares[2].attempts?.[0].outgoingId).toBeTruthy()
    expect(f.spend.shares[2].status).toBe('pending')
    await expect(f.engine.retryShare(f.spend.id)).rejects.toThrow('desconocidos')
    expect(() => f.engine.reset([])).toThrow()
    f.fake.opts.trackAs!['m-madrid'] = 'completed'
    await f.engine.recheckSpend(f.spend.id)
    expect(f.spend.status).toBe('paid'); expect(f.fake.calls.payShare).toBe(3)
  })
  it('si falla recepcion conserva el estado y consulta despues sin volver a pagar', async () => {
    const f = setup({ receivedFails: true }); await f.engine.executeSpend(f.spend.id)
    expect(f.spend.status).toBe('incomplete')
    f.fake.opts.receivedFails = false
    await f.engine.recheckSpend(f.spend.id)
    expect(f.spend.status).toBe('paid'); expect(f.fake.calls.payShare).toBe(3)
  })
  it('sin fondos confirmado conserva 2 aportes y reintenta solo el faltante', async () => {
    const f = setup({ failMember: { 'm-madrid': 'fondos insuficientes confirmados' } }); await f.engine.executeSpend(f.spend.id)
    expect(f.spend.progress.confirmed).toBe(2); expect(f.spend.shares[2].status).toBe('failed')
    delete f.fake.opts.failMember!['m-madrid']; await f.engine.retryShare(f.spend.id)
    expect(f.spend.status).toBe('paid'); expect(f.fake.calls.payShare).toBe(4)
  })
  it('una respuesta perdida al crear outgoing queda desconocida y nunca se reenvia', async () => {
    const f = setup(); f.fake.svc.payShare = async () => { throw new Error('synthetic network loss') }
    await f.engine.executeSpend(f.spend.id)
    expect(f.spend.shares.every(s => s.status === 'pending')).toBe(true)
    expect(f.spend.shares[0].attempts?.[0].status).toBe('unknown')
    await expect(f.engine.retryShare(f.spend.id)).rejects.toThrow()
  })
})
