import { isPendingGrant, type AuthenticatedClient } from '@interledger/open-payments'
import type { Money, PaymentsService } from '../../../../contracts'

// SDK: openpayments.dev/es/sdk/{grant-create-incoming,incoming-create,grant-create-quote,
// quote-create,outgoing-create,outgoing-get,incoming-get}/
export function createPaymentsService(deps: {
  client: AuthenticatedClient
  memberWalletAddress: (memberId: string) => Promise<string>
  memberToken: (memberId: string) => Promise<string>
}): PaymentsService {
  const { client } = deps
  const incomingTokens = new Map<string, string>()
  const quotes = new Map<string, { memberId: string; walletAddress: string; resourceServer: string }>()
  const outgoingTokens = new Map<string, string>()

  return {
    async createIncoming(walletAddress, amount) {
      if (BigInt(amount.value) <= 0n) throw new Error('El cobro debe ser positivo')
      const wallet = await client.walletAddress.get({ url: walletAddress })
      if (wallet.assetCode !== amount.assetCode || wallet.assetScale !== amount.assetScale)
        throw new Error('La moneda del cobro no coincide con la del destino')
      const grant = await client.grant.request(
        { url: wallet.authServer },
        { access_token: { access: [{ type: 'incoming-payment', actions: ['create', 'read'] }] } },
      )
      if (isPendingGrant(grant) || !grant.access_token) throw new Error('No se obtuvo permiso para crear el cobro')
      const token = grant.access_token.value
      const payment = await client.incomingPayment.create(
        { url: wallet.resourceServer, accessToken: token },
        { walletAddress, incomingAmount: amount, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() },
      )
      incomingTokens.set(payment.id, token)
      return { incomingPaymentUrl: payment.id }
    },

    async quoteShare(memberId, incomingPaymentUrl, share) {
      if (BigInt(share.value) <= 0n) throw new Error('El aporte debe ser positivo')
      const walletAddress = await deps.memberWalletAddress(memberId)
      const wallet = await client.walletAddress.get({ url: walletAddress })
      const grant = await client.grant.request(
        { url: wallet.authServer },
        { access_token: { access: [{ type: 'quote', actions: ['create'] }] } },
      )
      if (isPendingGrant(grant) || !grant.access_token) throw new Error('No se obtuvo permiso para cotizar')
      const quote = await client.quote.create(
        { url: wallet.resourceServer, accessToken: grant.access_token.value },
        { method: 'ilp', walletAddress, receiver: incomingPaymentUrl, receiveAmount: share },
      )
      if (quote.receiveAmount.value !== share.value || quote.receiveAmount.assetCode !== share.assetCode ||
          quote.receiveAmount.assetScale !== share.assetScale) throw new Error('La cotización no cubre el aporte solicitado')
      quotes.set(quote.id, { memberId, walletAddress, resourceServer: wallet.resourceServer })
      return { quoteId: quote.id, debitAmount: quote.debitAmount, receiveAmount: quote.receiveAmount }
    },

    async payShare(memberId, quoteId) {
      const quote = quotes.get(quoteId)
      if (!quote || quote.memberId !== memberId) throw new Error('Cotización no encontrada para el miembro')
      const token = await deps.memberToken(memberId)
      const payment = await client.outgoingPayment.create(
        { url: quote.resourceServer, accessToken: token },
        { walletAddress: quote.walletAddress, quoteId },
      )
      outgoingTokens.set(payment.id, token)
      quotes.delete(quoteId)
      return { outgoingId: payment.id }
    },

    async track(outgoingId) {
      const token = outgoingTokens.get(outgoingId)
      if (!token) throw new Error('Pago saliente no encontrado')
      const payment = await client.outgoingPayment.get({ url: outgoingId, accessToken: token })
      if (payment.failed) return 'failed'
      if (payment.sentAmount.assetCode === payment.debitAmount.assetCode &&
          payment.sentAmount.assetScale === payment.debitAmount.assetScale &&
          BigInt(payment.sentAmount.value) >= BigInt(payment.debitAmount.value)) return 'completed'
      return 'pending'
    },

    async received(incomingPaymentUrl): Promise<Money> {
      const token = incomingTokens.get(incomingPaymentUrl)
      if (!token) throw new Error('Cobro no encontrado')
      const payment = await client.incomingPayment.get({ url: incomingPaymentUrl, accessToken: token })
      return payment.receivedAmount
    },

    async distributeReturn() {
      throw new Error('Retorno de inversión fuera del alcance P0/P1')
    },
  }
}
