import { isPendingGrant, OpenPaymentsClientError, type AuthenticatedClient } from '@interledger/open-payments'
import { PaymentError } from './errors'

/** Recuperación de recursos ya creados. Nunca solicita create ni crea pagos/cobros. */
export function createPaymentReader(client: AuthenticatedClient, authorizedOutgoing: ReadonlyMap<string, string> = new Map()) {
  const tokens = new Map<string, string>()
  async function token(type: 'incoming-payment' | 'outgoing-payment', walletAddress: string) {
    const key = `${type}:${walletAddress}`
    if (type === 'outgoing-payment' && authorizedOutgoing.has(walletAddress)) return authorizedOutgoing.get(walletAddress)!
    const cached = tokens.get(key)
    if (cached) return cached
    const wallet = await client.walletAddress.get({ url: walletAddress })
    const access = type === 'incoming-payment'
      ? { type, actions: ['read' as const] }
      : { type, identifier: wallet.id, actions: ['read' as const] }
    // Fuentes: SDK grant-create-incoming, grant-create-outgoing y esquema oficial access-*.
    const grant = await client.grant.request({ url: wallet.authServer }, { access_token: { access: [access] } })
    if (isPendingGrant(grant) || !grant.access_token?.value) {
      throw new PaymentError('El proveedor requiere autorización de lectura; no se envió ningún pago.', 'unknown')
    }
    tokens.set(key, grant.access_token.value)
    return grant.access_token.value
  }
  async function read<T>(type: 'incoming-payment' | 'outgoing-payment', walletAddress: string, url: string,
    get: (token: string) => Promise<T>): Promise<T> {
    const address = new URL(url)
    if (address.protocol !== 'https:' || address.username || address.password || address.search || address.hash ||
        !address.pathname.includes(type === 'incoming-payment' ? '/incoming-payments/' : '/outgoing-payments/')) {
      throw new PaymentError('Identificador de recuperación inválido.', 'unknown')
    }
    const wallet = await client.walletAddress.get({ url: walletAddress })
    if (address.origin !== new URL(wallet.resourceServer).origin) throw new PaymentError('Recurso fuera del proveedor configurado.', 'unknown')
    try { return await get(await token(type, walletAddress)) }
    catch (error) {
      if (!(error instanceof OpenPaymentsClientError) || ![401, 403].includes(error.status ?? 0)) throw error
      tokens.delete(`${type}:${walletAddress}`)
      return get(await token(type, walletAddress))
    }
  }
  return {
    incoming(url: string, walletAddress: string) {
      return read('incoming-payment', walletAddress, url, accessToken => client.incomingPayment.get({ url, accessToken }))
    },
    outgoing(url: string, walletAddress: string) {
      return read('outgoing-payment', walletAddress, url, accessToken => client.outgoingPayment.get({ url, accessToken }))
    },
    invalidate(type: 'incoming-payment' | 'outgoing-payment', walletAddress: string) { tokens.delete(`${type}:${walletAddress}`) },
  }
}
