import { describe, expect, it } from 'vitest'
import type { WalletEvent } from '../../../../contracts'
import { cuidadoDeMama } from '../../../../contracts/ejemplo'
import { createEngine } from './engine'
import { cop, fakeGuardian, fakePayments } from './test-fakes'

const farmacia = { name: 'Farmacia Medellín', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medellin' }

function setup(opts: Parameters<typeof fakePayments>[0] = {}) {
  const events: WalletEvent[] = []
  const payments = fakePayments(opts)
  const engine = createEngine({
    guardian: fakeGuardian, payments: payments.svc, emit: (e) => events.push(e),
    now: () => 1, pollMs: 0, maxPolls: 3, sleep: async () => {},
  })
  engine.addWallet(structuredClone(cuidadoDeMama))
  const { id } = engine.requestSpend('w-mama', farmacia, cop(120_000))
  return { engine, events, payments, id }
}

describe('executeSpend: pagos por aporte', () => {
  it('escenario 2: 3 de 3 aportes y reconcile ok → paid ("Gasto verificado")', async () => {
    const { engine, events, payments, id } = setup()
    const s = await engine.executeSpend(id)
    expect(s.status).toBe('paid')
    expect(s.progress).toEqual({ confirmed: 3, total: 3 })
    expect(payments.calls.createIncoming).toEqual([cop(120_000)])
    expect(events.filter((e) => e.type === 'share-paid').map((e) => e.message))
      .toEqual(['1 de 3 aportes confirmados', '2 de 3 aportes confirmados', '3 de 3 aportes confirmados'])
    expect(events.at(-1)).toMatchObject({ type: 'spend-paid', message: 'Gasto verificado' })
    expect(s.verdicts.find((v) => v.check === 'reconcile')!.status).toBe('pass')
  })

  it('escenario 3b: Madrid sin cupo → incomplete, 2 de 3, con motivo', async () => {
    const { engine, events, id } = setup({ failMember: { 'm-madrid': 'cupo insuficiente' } })
    const s = await engine.executeSpend(id)
    expect(s.status).toBe('incomplete')
    expect(s.progress).toEqual({ confirmed: 2, total: 3 })
    expect(s.shares.find((sh) => sh.memberId === 'm-madrid')).toMatchObject({ status: 'failed', failReason: 'cupo insuficiente' })
    expect(events.some((e) => e.type === 'spend-paid')).toBe(false)
  })

  it('reintento: cobro nuevo solo por lo que falta → 3 de 3 → paid', async () => {
    const { engine, payments, id } = setup({ failMember: { 'm-madrid': 'cupo insuficiente' } })
    await engine.executeSpend(id)
    delete payments.opts.failMember!['m-madrid']   // Madrid recargó su cupo
    const s = await engine.retryShare(id)
    expect(payments.calls.createIncoming).toEqual([cop(120_000), cop(40_000)])
    expect(s.status).toBe('paid')
    expect(s.progress).toEqual({ confirmed: 3, total: 3 })
  })

  it('nunca "pagado" si llegó menos de lo esperado, aunque los 3 digan completed', async () => {
    const { engine, id } = setup({ shortReceive: true })
    const s = await engine.executeSpend(id)
    expect(s.progress.confirmed).toBe(3)
    expect(s.status).toBe('incomplete')
    expect(s.verdicts.find((v) => v.check === 'reconcile')!.status).toBe('warn')
  })

  it('cotización anormal → ese aporte falla con el mensaje del guardián', async () => {
    const { engine, id } = setup({ feePercent: { 'm-bogota': 23 } })
    const s = await engine.executeSpend(id)
    expect(s.status).toBe('incomplete')
    expect(s.shares[0]).toMatchObject({ status: 'failed', failReason: expect.stringContaining('Gasto detenido') })
  })

  it('aporte que se queda en pending → falla al agotar los intentos', async () => {
    const { engine, id } = setup({ trackAs: { 'm-medellin': 'pending' } })
    const s = await engine.executeSpend(id)
    expect(s.shares[1]).toMatchObject({ status: 'failed', failReason: 'El pago no se confirmó a tiempo' })
  })

  it('no ejecuta un gasto que espera aprobación del grupo', async () => {
    const { engine } = setup()
    const falsa = { name: 'Falsa', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medel1in' }
    const { id } = engine.requestSpend('w-mama', falsa, cop(120_000))
    await expect(engine.executeSpend(id)).rejects.toThrow(/awaiting-approval → paying/)
  })

  it('no reintenta un gasto que ya está pagado', async () => {
    const { engine, id } = setup()
    await engine.executeSpend(id)
    await expect(engine.retryShare(id)).rejects.toThrow(/paid → paying/)
  })
})
