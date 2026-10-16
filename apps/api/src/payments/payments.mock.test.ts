import { describe, expect, it } from 'vitest'
import type { Money } from '../../../../contracts'
import { createPaymentsMock } from '../../../../mocks/payments.mock'

const cop = (value: string): Money => ({ value, assetCode: 'COP', assetScale: 2 })

describe('simulado R2', () => {
  it('suma dos aportes parciales en un mismo cobro una sola vez', async () => {
    const payments = createPaymentsMock()
    const { incomingPaymentUrl } = await payments.createIncoming('https://farmacia.example', cop('12000000'))
    for (const memberId of ['bogota', 'medellin']) {
      const { quoteId } = await payments.quoteShare(memberId, incomingPaymentUrl, cop('6000000'))
      const { outgoingId } = await payments.payShare(memberId, quoteId)
      expect(await payments.track(outgoingId)).toBe('completed')
      expect(await payments.track(outgoingId)).toBe('completed')
    }
    expect(await payments.received(incomingPaymentUrl)).toEqual(cop('12000000'))
  })

  it('rechaza una cotización de otro miembro y no acredita el cobro', async () => {
    const payments = createPaymentsMock()
    const { incomingPaymentUrl } = await payments.createIncoming('https://farmacia.example', cop('12000000'))
    const { quoteId } = await payments.quoteShare('bogota', incomingPaymentUrl, cop('6000000'))
    await expect(payments.payShare('medellin', quoteId)).rejects.toThrow('Cotización no encontrada')
    expect(await payments.received(incomingPaymentUrl)).toEqual(cop('0'))
  })

  it('expone el motivo del aporte fallido sin acreditar dinero', async () => {
    const payments = createPaymentsMock({ failMember: { madrid: 'permiso revocado' } })
    const { incomingPaymentUrl } = await payments.createIncoming('https://farmacia.example', cop('4000000'))
    const { quoteId } = await payments.quoteShare('madrid', incomingPaymentUrl, cop('4000000'))
    await expect(payments.payShare('madrid', quoteId)).rejects.toThrow('permiso revocado')
    expect(await payments.received(incomingPaymentUrl)).toEqual(cop('0'))
  })
})
