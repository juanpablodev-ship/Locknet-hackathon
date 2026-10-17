import { isPendingGrant, type AuthenticatedClient } from '@interledger/open-payments'
import { PaymentError, safePaymentError } from './errors'
import type { Money, PaymentAttempt, PaymentsService } from '../../../../contracts'

// SDK: openpayments.dev/es/sdk/{grant-create-incoming,incoming-create,grant-create-quote,
// quote-create,outgoing-create,outgoing-get,incoming-get}/
export function createPaymentsService(deps: {
  client: AuthenticatedClient
  memberWalletAddress: (memberId: string) => Promise<string>
  memberToken: (memberId: string) => Promise<string>
  journal?: { blocked: boolean; record(key: string, attempt: PaymentAttempt): Promise<void> }
}): PaymentsService {
  const { client } = deps
  const incomingTokens = new Map<string, string>()
  const quotes = new Map<string, { memberId: string; walletAddress: string; resourceServer: string; receiver: string; receive: Money; paying?: boolean }>()
  const outgoingTokens = new Map<string, { token: string; receiver: string; expected: Money; quoteId: string }>()

  const service: PaymentsService = {
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
      quotes.set(quote.id, { memberId, walletAddress, resourceServer: wallet.resourceServer, receiver: incomingPaymentUrl, receive: share })
      return { quoteId: quote.id, debitAmount: quote.debitAmount, receiveAmount: quote.receiveAmount }
    },

    async payShare(memberId, quoteId) {
      if (deps.journal?.blocked) throw new PaymentError('Hay intentos previos sin resolver en el diario local; revisa la wallet antes de pagar.', 'not-created')
      const quote = quotes.get(quoteId)
      if (!quote || quote.memberId !== memberId || quote.paying) throw new PaymentError('Cotizacion no utilizable.', 'not-created')
      quote.paying = true
      let token: string
      let before: Money
      try {
        token = await deps.memberToken(memberId)
        const incomingToken = incomingTokens.get(quote.receiver)
        if (!incomingToken) throw new Error('Cobro no gestionado')
        before = (await client.incomingPayment.get({ url: quote.receiver, accessToken: incomingToken })).receivedAmount
        if (before.assetCode !== quote.receive.assetCode || before.assetScale !== quote.receive.assetScale) throw new Error('Unidad distinta')
      } catch (error) {
        quote.paying = false
        const exhausted = error instanceof Error && error.message === 'Cupo autorizado agotado'
        throw new PaymentError(exhausted ? 'Cupo autorizado agotado; no se envio un pago.' : 'Permiso o consulta del cobro no utilizable; no se envio un pago. Confirma si el permiso vencio o fue revocado.', 'not-created')
      }
      await deps.journal?.record(quoteId, { incomingPaymentUrl: quote.receiver, quoteId, status: 'unknown' })
      try {
        const payment = await client.outgoingPayment.create(
          { url: quote.resourceServer, accessToken: token }, { walletAddress: quote.walletAddress, quoteId })
        outgoingTokens.set(payment.id, { token, receiver: quote.receiver, quoteId,
          expected: { ...quote.receive, value: (BigInt(before.value) + BigInt(quote.receive.value)).toString() } })
        await deps.journal?.record(quoteId, { incomingPaymentUrl: quote.receiver, quoteId, outgoingId: payment.id, status: 'pending' })
        quotes.delete(quoteId)
        return { outgoingId: payment.id }
      } catch (error) {
        const safe = safePaymentError(error, true)
        // Un resultado desconocido nunca libera esta quote para volver a crear un pago.
        if (safe.outcome === 'not-created') { quotes.delete(quoteId); await deps.journal?.record(quoteId, { incomingPaymentUrl: quote.receiver, quoteId, status: 'failed' }) }
        throw safe
      }
    },

    async track(outgoingId) {
      const entry = outgoingTokens.get(outgoingId)
      if (!entry) throw new PaymentError('Intento no encontrado en este proceso.', 'unknown')
      const payment = await client.outgoingPayment.get({ url: outgoingId, accessToken: entry.token })
      const token = incomingTokens.get(entry.receiver)
      if (!token) throw new PaymentError('No se puede consultar el cobro del intento.', 'unknown')
      // Fuente: outgoing-get + incoming-get. sentAmount NO se compara con debitAmount.
      const received = (await client.incomingPayment.get({ url: entry.receiver, accessToken: token })).receivedAmount
      if (received.assetCode !== entry.expected.assetCode || received.assetScale !== entry.expected.assetScale) throw new PaymentError('Unidad de recepcion no comparable.', 'unknown')
      const status = BigInt(received.value) >= BigInt(entry.expected.value) ? 'completed' : payment.failed ? 'failed' : 'pending'
      await deps.journal?.record(entry.quoteId, { incomingPaymentUrl: entry.receiver, quoteId: entry.quoteId, outgoingId, status })
      return status
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
  return Object.fromEntries(Object.entries(service).map(([name, fn]) => [name, async (...args: unknown[]) => {
    try { return await (fn as (...a: unknown[]) => Promise<unknown>)(...args) }
    catch (error) { throw safePaymentError(error) }
  }])) as unknown as PaymentsService
}
