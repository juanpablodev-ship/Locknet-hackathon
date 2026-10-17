import { describe, expect, it, vi } from 'vitest'
import { OpenPaymentsClientError, type AuthenticatedClient } from '@interledger/open-payments'
import type { SharedWallet, Spend } from '../contracts'
import { cuidadoDeMama, medicina } from '../contracts/ejemplo'
import { recoverExisting } from './recover-existing-payments'

function setup(failed = true, received = '0') {
  const payer = 'https://provider.example/payer', pharmacy = 'https://provider.example/pharmacy'
  const incomingId = 'https://provider.example/incoming-payments/old'
  const outgoingId = 'https://provider.example/outgoing-payments/old'
  const wallet: SharedWallet = structuredClone(cuidadoDeMama)
  wallet.members = [ { ...wallet.members[0], walletAddress: payer } ]
  const spend: Spend = { ...structuredClone(medicina), status: 'incomplete', destination: { name: 'Farmacia', walletAddress: pharmacy },
    shares: [{ memberId: wallet.members[0].id, status: 'pending', share: { value: '6000000', assetCode: 'COP', assetScale: 2 },
      attempts: [{ incomingPaymentUrl: incomingId, outgoingId, quoteId: 'quote-old', status: 'unknown' }] }] }
  const client = {
    walletAddress: { get: vi.fn(async ({ url }: {url:string}) => ({ id: url, authServer: 'https://auth.example', resourceServer: 'https://provider.example', assetCode: 'COP', assetScale: 2 })) },
    grant: { request: vi.fn().mockResolvedValue({ access_token: { value: '[REDACTADO]' } }) },
    outgoingPayment: { get: vi.fn().mockResolvedValue({ id: outgoingId, walletAddress: payer, receiver: incomingId, failed, receiveAmount: spend.shares[0].share }), create: vi.fn() },
    incomingPayment: { get: vi.fn().mockResolvedValue({ id: incomingId, walletAddress: pharmacy, receivedAmount: { ...spend.shares[0].share, value: received }, expiresAt: '2000-01-01T00:00:00Z' }), create: vi.fn() },
    quote: { create: vi.fn() },
  }
  const journal = { blocked: false, entries: () => ({}), record: vi.fn().mockResolvedValue(undefined) }
  return { snapshot: { capturedAt: '2026-10-17', wallets: [wallet], spends: [spend] }, client, journal, tokens: new Map([[payer, '[REDACTADO]']]) }
}

describe('recuperación: nunca confunde solicitado, vencido y recibido', () => {
  it('confirma fallo solo con outgoing failed y recepción consultada; no crea nada financiero', async () => {
    const f = setup()
    const result = await recoverExisting(f.client as unknown as AuthenticatedClient, f.snapshot, f.journal, true, f.tokens)
    expect(result.blocked).toBe(false)
    expect(result.report[0]).toMatchObject({ status: 'failed', received: { value: '0' }, expired: true })
    expect(f.journal.record).toHaveBeenCalledWith('quote-old', expect.objectContaining({ status: 'failed' }))
    expect(f.client.outgoingPayment.create).not.toHaveBeenCalled()
    expect(f.client.incomingPayment.create).not.toHaveBeenCalled()
    expect(f.client.quote.create).not.toHaveBeenCalled()
    expect(f.client.grant.request).toHaveBeenCalledWith({ url: 'https://auth.example' }, { access_token: { access: [{ type: 'incoming-payment', actions: ['read'] }] } })
  })
  it('recupera un outgoing terminal con cero enviado aunque el cobro ya no sea legible', async () => {
    const f = setup()
    f.client.outgoingPayment.get.mockResolvedValueOnce({ ...(await f.client.outgoingPayment.get()), sentAmount: { value: '0', assetCode: 'COP', assetScale: 2 }, debitAmount: f.snapshot.spends[0].shares[0].share } as any)
    f.client.incomingPayment.get.mockRejectedValue(new Error('unreadable'))
    const result = await recoverExisting(f.client as unknown as AuthenticatedClient, f.snapshot, f.journal, true, f.tokens)
    expect(result.blocked).toBe(false)
    expect(result.report[0]).toMatchObject({ status: 'failed', zeroSent: true })
    expect(result.report[0].received).toBeUndefined()
    expect(f.client.incomingPayment.get).not.toHaveBeenCalled()
    expect(f.journal.record).toHaveBeenCalledWith('quote-old', expect.objectContaining({ status: 'failed' }))
    expect(f.client.outgoingPayment.create).not.toHaveBeenCalled()
  })
  it.each([
    { failed: false, sent: '0', currency: 'COP' },
    { failed: true, sent: '1', currency: 'COP' },
    { failed: true, sent: '0', currency: 'EUR' },
  ])('no deduce fallo sin movimiento con %j', async ({ failed, sent, currency }) => {
    const f = setup()
    f.client.outgoingPayment.get.mockResolvedValueOnce({ ...(await f.client.outgoingPayment.get()), failed, sentAmount: { value: sent, assetCode: currency, assetScale: 2 }, debitAmount: f.snapshot.spends[0].shares[0].share } as any)
    f.client.incomingPayment.get.mockRejectedValue(new Error('unreadable'))
    const result = await recoverExisting(f.client as unknown as AuthenticatedClient, f.snapshot, f.journal, true, f.tokens)
    expect(result.blocked).toBe(true)
    expect(result.report[0].status).toBe('unknown')
  })
  it('rechaza un recurso saliente que no corresponde al ID solicitado', async () => {
    const f = setup()
    f.client.outgoingPayment.get.mockResolvedValueOnce({ ...(await f.client.outgoingPayment.get()), id: 'https://provider.example/outgoing-payments/another' })
    const result = await recoverExisting(f.client as unknown as AuthenticatedClient, f.snapshot, f.journal, true, f.tokens)
    expect(result.blocked).toBe(true)
    expect(result.report[0].status).toBe('unknown')
  })
  it('EXPIRED sin outgoing fallido mantiene el bloqueo y el intento pendiente', async () => {
    const f = setup(false)
    const result = await recoverExisting(f.client as unknown as AuthenticatedClient, f.snapshot, f.journal, true, f.tokens)
    expect(result.blocked).toBe(true)
    expect(result.report[0].status).toBe('pending')
    expect(f.journal.record).toHaveBeenCalledWith('quote-old', expect.objectContaining({ status: 'pending' }))
  })
  it('solo confirma completado cuando receivedAmount cubre lo esperado', async () => {
    const f = setup(false, '6000000')
    const result = await recoverExisting(f.client as unknown as AuthenticatedClient, f.snapshot, f.journal, false, f.tokens)
    expect(result.report[0].status).toBe('completed')
    expect(f.journal.record).not.toHaveBeenCalled()
  })
  it('un importe esperado de cero no demuestra recepción del aporte', async () => {
    const f = setup(false)
    f.client.outgoingPayment.get.mockResolvedValueOnce({ ...(await f.client.outgoingPayment.get()), receiveAmount: { value: '0', assetCode: 'COP', assetScale: 2 } })
    const result = await recoverExisting(f.client as unknown as AuthenticatedClient, f.snapshot, f.journal, true, f.tokens)
    expect(result.blocked).toBe(true)
    expect(result.report[0].status).not.toBe('completed')
  })
  it('un ID perdido conserva un bloqueo durable', async () => {
    const f = setup()
    delete f.snapshot.spends[0].shares[0].attempts![0].outgoingId
    const result = await recoverExisting(f.client as unknown as AuthenticatedClient, f.snapshot, f.journal, true, f.tokens)
    expect(result.blocked).toBe(true)
    expect(f.journal.record).toHaveBeenCalledWith('quote-old', expect.objectContaining({ status: 'unknown' }))
    expect(f.client.outgoingPayment.get).not.toHaveBeenCalled()
  })
  it('identifica un 401 del cobro sin culpar al permiso del miembro', async () => {
    const f = setup()
    f.client.incomingPayment.get.mockRejectedValue(new OpenPaymentsClientError('private', { status: 401, description: 'private' }))
    const result = await recoverExisting(f.client as unknown as AuthenticatedClient, f.snapshot, f.journal, true, f.tokens)
    expect(result.report[0]).toMatchObject({ status: 'unknown', stage: 'incoming' })
    expect(result.report[0].reason).toContain('cobro de la farmacia')
    expect(result.report[0].reason).not.toContain('private')
    expect(result.blocked).toBe(true)
    expect(f.client.outgoingPayment.create).not.toHaveBeenCalled()
  })
  it('una consulta rechazada nunca borra el bloqueo ni declara fallo definitivo', async () => {
    const f = setup()
    f.client.outgoingPayment.get.mockRejectedValue(new Error('private-detail'))
    const result = await recoverExisting(f.client as unknown as AuthenticatedClient, f.snapshot, f.journal, true, f.tokens)
    expect(result.blocked).toBe(true)
    expect(result.report[0]).toMatchObject({ status: 'unknown', stage: 'outgoing' })
    expect(JSON.stringify(result)).not.toContain('private-detail')
    expect(f.journal.record).toHaveBeenCalledWith('quote-old', expect.objectContaining({ status: 'unknown' }))
  })
})
