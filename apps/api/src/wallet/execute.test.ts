import { describe, expect, it, vi } from 'vitest'
import type { WalletEvent } from '../../../../contracts'
import { cuidadoDeMama } from '../../../../contracts/ejemplo'
import { createEngine } from './engine'
import { cop, fakeGuardian, fakePayments } from './test-fakes'

const farmacia = { name: 'Farmacia Medellín', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medellin' }

function setup(opts: Parameters<typeof fakePayments>[0] = {}, incomingPerShare = false) {
  const events: WalletEvent[] = []
  const payments = fakePayments(opts)
  const engine = createEngine({
    guardian: fakeGuardian, payments: payments.svc, emit: (e) => events.push(e),
    now: () => 1, pollMs: 0, maxPolls: 3, sleep: async () => {}, incomingPerShare,
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
    expect(s.shares[1]).toMatchObject({ status: 'pending', failReason: expect.stringContaining('Resultado pendiente') })
  })

  it('no ejecuta un gasto que espera aprobación del grupo', async () => {
    const { engine } = setup()
    const falsa = { name: 'Falsa', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medel1in' }
    const { id } = engine.requestSpend('w-mama', falsa, cop(120_000))
    await expect(engine.executeSpend(id)).rejects.toThrow(/awaiting-approval → paying/)
  })

  it('plan B: un cobro de $40.000 por aporte → 3 de 3 → paid', async () => {
    const { engine, payments, id } = setup({}, true)
    const s = await engine.executeSpend(id)
    expect(payments.calls.createIncoming).toEqual([cop(40_000), cop(40_000), cop(40_000)])
    expect(s.status).toBe('paid')
    expect(s.verdicts.find((v) => v.check === 'reconcile')!.status).toBe('pass')
  })

  it('plan B: reintento crea un cobro solo para el aporte que falló', async () => {
    const { engine, payments, id } = setup({ failMember: { 'm-madrid': 'cupo insuficiente' } }, true)
    expect((await engine.executeSpend(id)).status).toBe('incomplete')
    delete payments.opts.failMember!['m-madrid']
    const s = await engine.retryShare(id)
    expect(payments.calls.createIncoming).toEqual([cop(40_000), cop(40_000), cop(40_000), cop(40_000)])
    expect(s.status).toBe('paid')
  })

  it('plan B pagado: cada aporte muestra lo que llegó de ese miembro ($40.000)', async () => {
    const { engine, id } = setup({}, true)
    const s = await engine.executeSpend(id)
    expect(s.status).toBe('paid')
    expect(s.shares.map((sh) => sh.received)).toEqual([cop(40_000), cop(40_000), cop(40_000)])
  })

  it('plan B: si llega 1 unidad menos por aporte, cada aporte lo refleja y el gasto queda incompleto', async () => {
    const { engine, id } = setup({ shortReceive: true }, true)
    const s = await engine.executeSpend(id)
    expect(s.status).toBe('incomplete')
    expect(s.shares.map((sh) => sh.received?.value)).toEqual(['3999999', '3999999', '3999999'])
  })

  it('plan B: el aporte que falló muestra $0 y el reintento lo reemplaza por lo que llegó', async () => {
    const { engine, payments, id } = setup({ failMember: { 'm-madrid': 'cupo insuficiente' } }, true)
    const first = await engine.executeSpend(id)
    expect(first.shares[2]).toMatchObject({ status: 'failed', received: cop(0) })
    expect(first.shares[0].received).toEqual(cop(40_000))
    delete payments.opts.failMember!['m-madrid']
    const s = await engine.retryShare(id)
    expect(s.shares[2]).toMatchObject({ status: 'paid', received: cop(40_000) })
    expect(s.status).toBe('paid')
  })

  it('plan A (cobro compartido): no se atribuye por miembro, received queda vacío', async () => {
    const { engine, id } = setup({}, false)
    const s = await engine.executeSpend(id)
    expect(s.status).toBe('paid')
    expect(s.shares.every((sh) => sh.received === undefined)).toBe(true)
  })

  it('si la consulta de lo recibido no responde: incompleto (nunca pagado) y no se queda en "pagando"', async () => {
    const { engine, id } = setup({ receivedFails: true }, true)
    const s = await engine.executeSpend(id)
    expect(s.status).toBe('incomplete')
    expect(s.shares.every((sh) => sh.received === undefined)).toBe(true)
  })

  it('3b: en cada forma de fallar un aporte hay un motivo claro y no se filtra el error original', async () => {
    const secreto = 'boom https://ilp.privado/token=abc123'
    const casos: Array<[string, Parameters<typeof fakePayments>[0], RegExp]> = [
      ['pago rechazado por el proveedor', { failMember: { 'm-madrid': 'El proveedor confirmó fondos insuficientes.' } }, /fondos insuficientes/],
      ['respuesta perdida al pagar (resultado desconocido)', { failWith: { 'm-madrid': new Error(secreto) } }, /Resultado desconocido/],
      ['no se pudo crear el cobro', { incomingFails: new Error(secreto) }, /Error temporal del proveedor/],
      ['el proveedor confirma que el pago falló', { trackAs: { 'm-madrid': 'failed' } }, /confirmo que el pago fallo/],
    ]
    for (const [nombre, opts, esperado] of casos) {
      const { engine, id } = setup(opts, true)
      const s = await engine.executeSpend(id)
      const afectados = s.shares.filter((sh) => sh.status !== 'paid')
      expect(afectados.length, nombre).toBeGreaterThan(0)
      for (const sh of afectados) {
        expect(sh.failReason?.trim(), `${nombre}: motivo vacío`).toBeTruthy()
        expect(sh.failReason, nombre).toMatch(esperado)
        expect(sh.failReason, `${nombre}: filtró el error original`).not.toMatch(/boom|token|abc123|privado/)
      }
      expect(s.status, nombre).toBe('incomplete')
    }
  })

  it('no reintenta un gasto que ya está pagado', async () => {
    const { engine, id } = setup()
    await engine.executeSpend(id)
    await expect(engine.retryShare(id)).rejects.toThrow(/paid → paying/)
  })
})

describe('recheckSpend: historial de intentos', () => {
  async function historicalAttempt() {
    const result = setup({ trackAs: { 'm-madrid': 'failed' } }, true)
    await result.engine.executeSpend(result.id)
    result.payments.opts.failMember = { 'm-madrid': 'Permiso no utilizable' }
    await result.engine.retryShare(result.id)
    const share = result.engine.getSpend(result.id).shares[2]
    expect(share.attempts).toHaveLength(2)
    expect(share.attempts![0].outgoingId).toBeDefined()
    expect(share.attempts![1].outgoingId).toBeUndefined()
    return { ...result, share }
  }

  it('consulta el outgoing anterior aunque el último intento no creó pago, sin crear otro', async () => {
    const { engine, payments, id, share } = await historicalAttempt()
    payments.opts.trackAs!['m-madrid'] = 'pending'
    const track = vi.spyOn(payments.svc, 'track')
    const previousCalls = payments.calls.payShare
    await engine.recheckSpend(id)
    expect(track).toHaveBeenCalledWith(share.attempts![0].outgoingId)
    expect(share.status).toBe('pending')
    expect(share.attempts![0].status).toBe('pending')
    expect(payments.calls.payShare).toBe(previousCalls)
    await expect(engine.retryShare(id)).rejects.toThrow(/desconocidos/)
  })

  it('confirma el aporte histórico completado y concilia sin volver a pagar', async () => {
    const { engine, payments, id } = await historicalAttempt()
    payments.opts.trackAs!['m-madrid'] = 'completed'
    const previousCalls = payments.calls.payShare
    const spend = await engine.recheckSpend(id)
    expect(spend.status).toBe('paid')
    expect(spend.progress.confirmed).toBe(3)
    expect(spend.shares[2].received).toEqual(cop(40_000))
    expect(payments.calls.payShare).toBe(previousCalls)
  })

  it('una consulta fallida conserva el intento desconocido y bloquea reintentos', async () => {
    const { engine, payments, id, share } = await historicalAttempt()
    vi.spyOn(payments.svc, 'track').mockRejectedValue(new Error('timeout'))
    await engine.recheckSpend(id)
    expect(share.status).toBe('pending')
    expect(share.attempts![0].status).toBe('unknown')
    await expect(engine.retryShare(id)).rejects.toThrow(/desconocidos/)
  })
})
