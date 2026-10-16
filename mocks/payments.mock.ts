import type { Money, PaymentsService } from '../contracts'

// Simulado de R2 para que el motor pruebe cobros con varios pagadores sin usar la red.
export function createPaymentsMock(options: { failMember?: Record<string, string> } = {}): PaymentsService {
  const incoming = new Map<string, { expected: Money; received: bigint }>()
  const quotes = new Map<string, { memberId: string; url: string; share: Money }>()
  const outgoing = new Map<string, { quoteId: string; completed: boolean }>()
  let nextId = 0

  return {
    async createIncoming(_walletAddress, amount) {
      if (BigInt(amount.value) <= 0n) throw new Error('El cobro debe ser positivo')
      const incomingPaymentUrl = `https://mock.example/incoming/${++nextId}`
      incoming.set(incomingPaymentUrl, { expected: amount, received: 0n })
      return { incomingPaymentUrl }
    },
    async quoteShare(memberId, incomingPaymentUrl, share) {
      const payment = incoming.get(incomingPaymentUrl)
      if (!payment) throw new Error('Cobro no encontrado')
      if (BigInt(share.value) <= 0n || share.assetCode !== payment.expected.assetCode || share.assetScale !== payment.expected.assetScale)
        throw new Error('Aporte inválido para el cobro')
      const quoteId = `quote-${++nextId}`
      quotes.set(quoteId, { memberId, url: incomingPaymentUrl, share })
      return { quoteId, debitAmount: share, receiveAmount: share }
    },
    async payShare(memberId, quoteId) {
      const quote = quotes.get(quoteId)
      if (!quote || quote.memberId !== memberId) throw new Error('Cotización no encontrada para el miembro')
      if (options.failMember?.[memberId]) throw new Error(options.failMember[memberId])
      const outgoingId = `outgoing-${++nextId}`
      outgoing.set(outgoingId, { quoteId, completed: false })
      return { outgoingId }
    },
    async track(outgoingId) {
      const payment = outgoing.get(outgoingId)
      if (!payment) throw new Error('Pago saliente no encontrado')
      if (!payment.completed) {
        const quote = quotes.get(payment.quoteId)!
        incoming.get(quote.url)!.received += BigInt(quote.share.value)
        payment.completed = true
      }
      return 'completed'
    },
    async received(incomingPaymentUrl) {
      const payment = incoming.get(incomingPaymentUrl)
      if (!payment) throw new Error('Cobro no encontrado')
      return { ...payment.expected, value: payment.received.toString() }
    },
    async distributeReturn() {
      throw new Error('Retorno de inversión fuera del alcance P0/P1')
    },
  }
}
