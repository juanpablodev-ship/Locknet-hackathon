import { describe, expect, it } from 'vitest'
import { OpenPaymentsClientError } from '@interledger/open-payments'
import { outgoingFromQuotePayload, quoteReceivePayload, sanitizeOutgoingCreateError } from './test-wallet.smoke'

describe('payload del smoke R2', () => {
  it('solicita EUR 1,00 como receiveAmount de la quote', () => {
    const amount = { value: '100', assetCode: 'EUR', assetScale: 2 }
    expect(quoteReceivePayload('payer', 'incoming', amount)).toEqual({
      method: 'ilp', walletAddress: 'payer', receiver: 'incoming', receiveAmount: amount,
    })
  })

  it('usa solo walletAddress y el quoteId exacto para crear el outgoing', () => {
    const payload = outgoingFromQuotePayload('payer', 'quote-exacta')
    expect(payload).toEqual({ walletAddress: 'payer', quoteId: 'quote-exacta' })
    expect(Object.keys(payload)).toEqual(['walletAddress', 'quoteId'])
  })
})

describe('diagnóstico seguro de outgoingPayment.create', () => {
  it('conserva solo HTTP, código público, tipo y título fijo; nunca detalles sensibles', () => {
    const error = new OpenPaymentsClientError('SENTINEL_TOKEN https://private.test', {
      description: 'SENTINEL_HEADER', status: 403, code: 'invalid_token',
      details: { accessToken: 'SENTINEL_TOKEN', privateKey: 'SENTINEL_KEY' },
    })
    const safe = sanitizeOutgoingCreateError(error)
    expect(safe).toEqual({ httpStatus: 403, code: 'invalid_token',
      type: 'OpenPaymentsClientError', title: 'Solicitud de outgoing rechazada' })
    expect(JSON.stringify(safe)).not.toMatch(/SENTINEL|private\.test/)
  })

  it('descarta código y estado no fiables sin convertir el fallo en éxito', () => {
    const error = { status: 999, code: 'SENTINEL_TOKEN', message: 'SENTINEL_KEY',
      response: { headers: { Authorization: 'SENTINEL_HEADER' } } }
    const safe = sanitizeOutgoingCreateError(error)
    expect(safe).toEqual({ httpStatus: null, code: 'no disponible', type: 'no verificado',
      title: 'Solicitud de outgoing rechazada' })
    expect(JSON.stringify(safe)).not.toContain('SENTINEL')
  })
})
