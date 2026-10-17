import { isPendingGrant, OpenPaymentsClientError, type AuthenticatedClient } from '@interledger/open-payments'
import { PaymentError, safePaymentError } from './errors'
import { createPaymentReader } from './reader'
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
  const incomingWallets = new Map<string, string>()
  const reader = createPaymentReader(client)
  const quotes = new Map<string, { memberId: string; walletAddress: string; resourceServer: string; receiver: string; receive: Money; expiresAt?: string; paying?: boolean }>()
  const outgoingTokens = new Map<string, { token: string; receiver: string; expected: Money; quoteId: string; walletAddress: string }>()

  async function readIncoming(url: string) {
    const token = incomingTokens.get(url)
    const wallet = incomingWallets.get(url)
    if (!token || !wallet) throw new PaymentError('No se conserva la identidad del cobro; utiliza la recuperación del diario.', 'unknown')
    try { return await client.incomingPayment.get({ url, accessToken: token }) }
    catch (error) {
      if (!(error instanceof OpenPaymentsClientError) || ![401, 403].includes(error.status ?? 0)) throw error
      // La lectura de un cobro no depende del cupo ni del token de pago del miembro.
      return reader.incoming(url, wallet)
    }
  }
  const service: PaymentsService = {
    async createIncoming(walletAddress, amount) {
      if (deps.journal?.blocked) throw new PaymentError('Hay intentos previos sin resolver en el diario local. No se creó un cobro ni se envió un pago; completa la recuperación.', 'not-created')
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
      incomingWallets.set(payment.id, walletAddress)
      return { incomingPaymentUrl: payment.id }
    },

    async quoteShare(memberId, incomingPaymentUrl, share) {
      if (deps.journal?.blocked) throw new PaymentError('Hay intentos previos sin resolver en el diario local. No se creó una cotización ni se envió un pago; completa la recuperación.', 'not-created')
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
      quotes.set(quote.id, { memberId, walletAddress, resourceServer: wallet.resourceServer, receiver: incomingPaymentUrl, receive: share, expiresAt: quote.expiresAt })
      return { quoteId: quote.id, debitAmount: quote.debitAmount, receiveAmount: quote.receiveAmount }
    },

    async payShare(memberId, quoteId) {
      if (deps.journal?.blocked) throw new PaymentError('Hay intentos previos sin resolver en el diario local; revisa la wallet antes de pagar.', 'not-created')
      const quote = quotes.get(quoteId)
      if (!quote || quote.memberId !== memberId || quote.paying) throw new PaymentError('Cotizacion no utilizable.', 'not-created')
      quote.paying = true
      let token: string
      let before: Money
      try { token = await deps.memberToken(memberId) }
      catch (error) {
        quote.paying = false
        const exhausted = error instanceof Error && error.message === 'Cupo autorizado agotado'
        throw new PaymentError(exhausted ? 'Cupo autorizado agotado; no se envió un pago.' : 'El permiso del miembro no está disponible. Renueva su autorización; no se envió un pago.', 'not-created')
      }
      try {
        const incoming = await readIncoming(quote.receiver)
        if (incoming.completed || (incoming.expiresAt && Date.parse(incoming.expiresAt) <= Date.now())) {
          throw new PaymentError('El cobro ya está cerrado o vencido. No se envió un pago; el reintento debe crear un cobro nuevo.', 'not-created')
        }
        if (quote.expiresAt && Date.parse(quote.expiresAt) <= Date.now()) {
          throw new PaymentError('La cotización venció. No se envió un pago; solicita una cotización nueva.', 'not-created')
        }
        before = incoming.receivedAmount
        if (before.assetCode !== quote.receive.assetCode || before.assetScale !== quote.receive.assetScale) throw new Error('Unidad distinta')
      } catch (error) {
        quote.paying = false
        if (error instanceof PaymentError && error.outcome === 'not-created') throw error
        throw new PaymentError('No se pudo leer el cobro para conciliar. No se envió un pago; consulta el intento existente.', 'not-created')
      }
      await deps.journal?.record(quoteId, { incomingPaymentUrl: quote.receiver, quoteId, status: 'unknown' })
      try {
        const payment = await client.outgoingPayment.create(
          { url: quote.resourceServer, accessToken: token }, { walletAddress: quote.walletAddress, quoteId })
        outgoingTokens.set(payment.id, { token, receiver: quote.receiver, quoteId,
          walletAddress: quote.walletAddress, expected: { ...quote.receive, value: (BigInt(before.value) + BigInt(quote.receive.value)).toString() } })
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
      let payment
      try { payment = await client.outgoingPayment.get({ url: outgoingId, accessToken: entry.token }) }
      catch (error) {
        if (!(error instanceof OpenPaymentsClientError) || ![401, 403].includes(error.status ?? 0)) throw error
        payment = await reader.outgoing(outgoingId, entry.walletAddress)
      }
      // Un cobro EXPIRED no implica por sí solo que el outgoing haya fallado.
      const received = (await readIncoming(entry.receiver)).receivedAmount
      if (received.assetCode !== entry.expected.assetCode || received.assetScale !== entry.expected.assetScale) throw new PaymentError('Unidad de recepcion no comparable.', 'unknown')
      const status = BigInt(received.value) >= BigInt(entry.expected.value) ? 'completed' : payment.failed ? 'failed' : 'pending'
      await deps.journal?.record(entry.quoteId, { incomingPaymentUrl: entry.receiver, quoteId: entry.quoteId, outgoingId, status })
      return status
    },

    async received(incomingPaymentUrl): Promise<Money> {
      const payment = await readIncoming(incomingPaymentUrl)

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
