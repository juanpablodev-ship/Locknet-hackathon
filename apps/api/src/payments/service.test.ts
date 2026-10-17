import { describe, expect, it, vi } from 'vitest'
import { OpenPaymentsClientError, type AuthenticatedClient } from '@interledger/open-payments'
import type { Money } from '../../../../contracts'
import { createPaymentsService } from './service'

const cop = (value: string): Money => ({ value, assetCode: 'COP', assetScale: 2 })

function setup() {
  const walletAddress = { authServer: 'https://auth.example', resourceServer: 'https://resources.example', assetCode: 'COP', assetScale: 2 }
  const grant = { access_token: { value: '[REDACTADO]' } }
  const incoming = { id: 'https://resources.example/incoming/1', receivedAmount: cop('0') }
  const quote = { id: 'https://resources.example/quote/1', receiveAmount: cop('4000000'), debitAmount: cop('4000000') }
  const outgoing = { id: 'https://resources.example/outgoing/1', failed: false, sentAmount: cop('0'), debitAmount: cop('4000000') }
  const client = {
    walletAddress: { get: vi.fn().mockResolvedValue(walletAddress) },
    grant: { request: vi.fn().mockResolvedValue(grant) },
    incomingPayment: { create: vi.fn().mockResolvedValue(incoming), get: vi.fn().mockResolvedValue(incoming) },
    quote: { create: vi.fn().mockResolvedValue(quote) },
    outgoingPayment: { create: vi.fn().mockResolvedValue(outgoing), get: vi.fn().mockResolvedValue(outgoing) },
  }
  const memberWalletAddress = vi.fn().mockResolvedValue('https://payer.example')
  const memberToken = vi.fn().mockResolvedValue('[REDACTADO]')
  const service = createPaymentsService({ client: client as unknown as AuthenticatedClient, memberWalletAddress, memberToken })
  return { service, client, walletAddress, incoming, quote, outgoing, memberToken }
}

describe('PaymentsService con SDK oficial', () => {
  it('un diario bloqueado impide cobros y cotizaciones antes de llamar al proveedor', async () => {
    const f = setup()
    const service = createPaymentsService({ client: f.client as unknown as AuthenticatedClient,
      memberWalletAddress: vi.fn(), memberToken: f.memberToken, journal: { blocked: true, record: vi.fn() } })
    await expect(service.createIncoming('https://pharmacy.example', cop('4000000'))).rejects.toMatchObject({ outcome: 'not-created' })
    await expect(service.quoteShare('member', f.incoming.id, cop('4000000'))).rejects.toMatchObject({ outcome: 'not-created' })
    expect(f.client.walletAddress.get).not.toHaveBeenCalled()
    expect(f.client.grant.request).not.toHaveBeenCalled()
    expect(f.client.incomingPayment.create).not.toHaveBeenCalled()
    expect(f.client.quote.create).not.toHaveBeenCalled()
    expect(f.client.outgoingPayment.create).not.toHaveBeenCalled()
  })
  it('respuesta perdida al crear un outgoing no permite reenviar la misma quote', async () => {
    const f = setup(); await f.service.createIncoming('https://pharmacy.example', cop('4000000'))
    const q = await f.service.quoteShare('bogota', f.incoming.id, cop('4000000'))
    f.client.outgoingPayment.create.mockRejectedValue(new Error('synthetic private provider detail'))
    await expect(f.service.payShare('bogota', q.quoteId)).rejects.toMatchObject({ outcome: 'unknown' })
    await expect(f.service.payShare('bogota', q.quoteId)).rejects.toMatchObject({ outcome: 'not-created' })
    expect(f.client.outgoingPayment.create).toHaveBeenCalledOnce()
  })
  it('crea un cobro con permiso limitado y lo consulta por el monto recibido', async () => {
    const { service, client, incoming } = setup()
    const created = await service.createIncoming('https://farmacia.example', cop('12000000'))
    expect(created.incomingPaymentUrl).toBe(incoming.id)
    expect(client.grant.request).toHaveBeenCalledWith(
      { url: 'https://auth.example' },
      { access_token: { access: [{ type: 'incoming-payment', actions: ['create', 'read'] }] } },
    )
    incoming.receivedAmount = cop('8000000')
    expect(await service.received(incoming.id)).toEqual(cop('8000000'))
  })

  it('rechaza cobro de moneda distinta y cobro desconocido', async () => {
    const { service } = setup()
    await expect(service.createIncoming('https://farmacia.example', { value: '1', assetCode: 'EUR', assetScale: 2 }))
      .rejects.toThrow()
    await expect(service.received('https://resources.example/incoming/unknown')).rejects.toThrow()
  })

  it('cotiza receiveAmount, paga con el permiso del miembro y distingue pendiente de completado', async () => {
    const { service, client, quote, outgoing, memberToken, incoming } = setup()
    await service.createIncoming('https://pharmacy.example', cop('4000000'))
    const q = await service.quoteShare('bogota', 'https://resources.example/incoming/1', cop('4000000'))
    expect(q).toEqual({ quoteId: quote.id, debitAmount: cop('4000000'), receiveAmount: cop('4000000') })
    expect(client.quote.create).toHaveBeenCalledWith(
      { url: 'https://resources.example', accessToken: '[REDACTADO]' },
      { method: 'ilp', walletAddress: 'https://payer.example', receiver: 'https://resources.example/incoming/1', receiveAmount: cop('4000000') },
    )
    const paid = await service.payShare('bogota', q.quoteId)
    expect(memberToken).toHaveBeenCalledWith('bogota')
    expect(paid.outgoingId).toBe(outgoing.id)
    expect(await service.track(outgoing.id)).toBe('pending')
    outgoing.sentAmount = cop('123') // no se compara con el debito
    incoming.receivedAmount = cop('4000000')
    expect(await service.track(outgoing.id)).toBe('completed')
  })

  it('rechaza cotización incompleta y pago con otro miembro', async () => {
    const { service, quote, memberToken } = setup()
    quote.receiveAmount = cop('3999999')
    await expect(service.quoteShare('bogota', 'https://resources.example/incoming/1', cop('4000000')))
      .rejects.toThrow()
    quote.receiveAmount = cop('4000000')
    const { quoteId } = await service.quoteShare('bogota', 'https://resources.example/incoming/1', cop('4000000'))
    await expect(service.payShare('madrid', quoteId)).rejects.toThrow()
    expect(memberToken).not.toHaveBeenCalled()
  })

  it('trata un pago fallido como fallido y rechaza identificadores desconocidos', async () => {
    const { service, outgoing } = setup()
    await service.createIncoming('https://pharmacy.example', cop('4000000'))
    const { quoteId } = await service.quoteShare('bogota', 'https://resources.example/incoming/1', cop('4000000'))
    await service.payShare('bogota', quoteId)
    outgoing.failed = true
    expect(await service.track(outgoing.id)).toBe('failed')
    await expect(service.track('https://resources.example/outgoing/unknown')).rejects.toThrow()
  })

  it('permite dos cotizaciones locales para aportes parciales al mismo cobro', async () => {
    const { service, client, quote } = setup()
    const partialQuote = { ...quote, receiveAmount: cop('2000000'), debitAmount: cop('2000000') }
    const secondQuote = { ...partialQuote, id: 'https://resources.example/quote/2' }
    vi.mocked(client.quote.create).mockResolvedValueOnce(partialQuote).mockResolvedValueOnce(secondQuote)

    const first = await service.quoteShare('hermano_1', 'https://resources.example/incoming/1', cop('2000000'))
    const second = await service.quoteShare('hermano_2', 'https://resources.example/incoming/1', cop('2000000'))

    expect(first.quoteId).toBe(quote.id)
    expect(second.quoteId).toBe(secondQuote.id)
    expect(client.quote.create).toHaveBeenCalledTimes(2)
    expect(client.quote.create).toHaveBeenNthCalledWith(2,
      { url: 'https://resources.example', accessToken: '[REDACTADO]' },
      { method: 'ilp', walletAddress: 'https://payer.example', receiver: 'https://resources.example/incoming/1', receiveAmount: cop('2000000') },
    )
  })

  it('rechaza un segundo pago secuencial de la misma cotización', async () => {
    const { service, quote, client } = setup()
    await service.createIncoming('https://pharmacy.example', cop('4000000'))
    await service.quoteShare('hermano_1', 'https://resources.example/incoming/1', cop('4000000'))
    await service.payShare('hermano_1', quote.id)

    await expect(service.payShare('hermano_1', quote.id)).rejects.toMatchObject({ outcome: 'not-created' })
    expect(client.outgoingPayment.create).toHaveBeenCalledOnce()
  })

  it('lee del cobro la acumulación de aportes en lugar de acumularla localmente', async () => {
    const { service, incoming } = setup()
    await service.createIncoming('https://farmacia.example', cop('4000000'))
    incoming.receivedAmount = cop('2000000')
    expect(await service.received(incoming.id)).toEqual(cop('2000000'))
    incoming.receivedAmount = cop('4000000')
    expect(await service.received(incoming.id)).toEqual(cop('4000000'))
  })
})

describe('vencimientos y lectura independiente del permiso de pago', () => {
  it('no crea un outgoing contra un cobro vencido', async () => {
    const f = setup()
    await f.service.createIncoming('https://pharmacy.example', cop('4000000'))
    const q = await f.service.quoteShare('bogota', f.incoming.id, cop('4000000'))
    Object.assign(f.incoming, { expiresAt: '2000-01-01T00:00:00Z' })
    await expect(f.service.payShare('bogota', q.quoteId)).rejects.toThrow('cobro ya está cerrado o vencido')
    expect(f.client.outgoingPayment.create).not.toHaveBeenCalled()
  })
  it('no crea un outgoing con una quote vencida', async () => {
    const f = setup()
    await f.service.createIncoming('https://pharmacy.example', cop('4000000'))
    Object.assign(f.quote, { expiresAt: '2000-01-01T00:00:00Z' })
    const q = await f.service.quoteShare('bogota', f.incoming.id, cop('4000000'))
    await expect(f.service.payShare('bogota', q.quoteId)).rejects.toThrow('cotización venció')
    expect(f.client.outgoingPayment.create).not.toHaveBeenCalled()
  })
  it('un cobro vencido con outgoing no fallido no se transforma en fallo confirmado', async () => {
    const f = setup()
    await f.service.createIncoming('https://pharmacy.example', cop('4000000'))
    const q = await f.service.quoteShare('bogota', f.incoming.id, cop('4000000'))
    await f.service.payShare('bogota', q.quoteId)
    Object.assign(f.incoming, { expiresAt: '2000-01-01T00:00:00Z' })
    expect(await f.service.track(f.outgoing.id)).toBe('pending')
  })
  it('renueva solo lectura para consultar un incoming cuyo token devolvió 401', async () => {
    const f = setup()
    f.incoming.id = 'https://resources.example/incoming-payments/1'
    await f.service.createIncoming('https://pharmacy.example', cop('4000000'))
    f.client.incomingPayment.get.mockRejectedValueOnce(new OpenPaymentsClientError('private-detail', { code: 'invalid_token', status: 401, description: 'synthetic-detail' }))
    expect(await f.service.received(f.incoming.id)).toEqual(cop('0'))
    expect(f.client.grant.request).toHaveBeenLastCalledWith(
      { url: 'https://auth.example' }, { access_token: { access: [{ type: 'incoming-payment', actions: ['read'] }] } },
    )
    expect(f.client.outgoingPayment.create).not.toHaveBeenCalled()
    expect(f.memberToken).not.toHaveBeenCalled()
  })
})
