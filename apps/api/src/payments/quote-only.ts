import { isFinalizedGrantWithAccessToken, type AuthenticatedClient } from '@interledger/open-payments'

// Fuentes: ../open-payments-snippets/{grant/grant-incoming-payment.ts,
// grant/grant-quote.ts,incoming-payment/incoming-payment-create.ts,
// quote/quote-create-receive-amount.ts} y https://openpayments.dev/es/guides/onetime-remittance-fixed-receive/
type QuoteClient = Pick<AuthenticatedClient, 'walletAddress' | 'grant' | 'incomingPayment' | 'quote'>
type Amount = { value: string; assetCode: string; assetScale: number }

export type QuoteOnlyConfig = {
  memberId: string
  payerWalletAddress: string
  receiverWalletAddress: string
}

export function quoteOnlyConfig(env: NodeJS.ProcessEnv): QuoteOnlyConfig {
  const names = ['QUOTE_ONLY_MEMBER_ID', 'QUOTE_ONLY_PAYER_WALLET_ADDRESS', 'QUOTE_ONLY_RECEIVER_WALLET_ADDRESS'] as const
  const missing = names.filter(name => !env[name]?.trim())
  if (missing.length) throw new Error(`Configuración ausente: ${missing.join(', ')}`)
  const memberId = env.QUOTE_ONLY_MEMBER_ID!
  if (memberId !== 'hermano_1' && memberId !== 'hermano_2') throw new Error('QUOTE_ONLY_MEMBER_ID debe ser hermano_1 o hermano_2')
  for (const name of names.slice(1)) {
    try { if (new URL(env[name]!).protocol !== 'https:') throw new Error() }
    catch { throw new Error(`Dirección inválida: ${name}`) }
  }
  if (new URL(env.QUOTE_ONLY_PAYER_WALLET_ADDRESS!).pathname.split('/').filter(Boolean).at(-1) !== memberId)
    throw new Error('QUOTE_ONLY_PAYER_WALLET_ADDRESS no corresponde al hermano indicado')
  if (new URL(env.QUOTE_ONLY_RECEIVER_WALLET_ADDRESS!).pathname.split('/').filter(Boolean).at(-1) !== 'farmacia-medellin')
    throw new Error('QUOTE_ONLY_RECEIVER_WALLET_ADDRESS no corresponde a farmacia-medellin')
  return { memberId, payerWalletAddress: env.QUOTE_ONLY_PAYER_WALLET_ADDRESS!, receiverWalletAddress: env.QUOTE_ONLY_RECEIVER_WALLET_ADDRESS! }
}

export function copReceiveAmount(scale: number): Amount {
  if (scale !== 2) throw new Error('Escala de farmacia-medellin distinta de 2; no se creó quote')
  return { value: '4000000', assetCode: 'COP', assetScale: 2 }
}

export function quoteCost(receive: Amount, debit: Amount): { difference: string; percent: string; exceedsFivePercent: boolean } | null {
  if (receive.assetCode !== debit.assetCode) return null
  if (!/^\d+$/.test(receive.value) || !/^\d+$/.test(debit.value) || BigInt(receive.value) <= 0n ||
      !Number.isInteger(receive.assetScale) || !Number.isInteger(debit.assetScale) ||
      receive.assetScale < 0 || debit.assetScale < 0) throw new Error('Montos de quote inválidos')
  const scale = Math.max(receive.assetScale, debit.assetScale)
  const normalizedReceive = BigInt(receive.value) * 10n ** BigInt(scale - receive.assetScale)
  const normalizedDebit = BigInt(debit.value) * 10n ** BigInt(scale - debit.assetScale)
  const difference = normalizedDebit - normalizedReceive
  const abs = difference < 0n ? -difference : difference
  const whole = abs / 10n ** BigInt(scale)
  const fraction = scale ? `.${String(abs % 10n ** BigInt(scale)).padStart(scale, '0')}` : ''
  const basisPoints = difference * 10000n / normalizedReceive
  const percentage = `${basisPoints < 0n ? '-' : ''}${(basisPoints < 0n ? -basisPoints : basisPoints) / 100n}.${String((basisPoints < 0n ? -basisPoints : basisPoints) % 100n).padStart(2, '0')}`
  return { difference: `${difference < 0n ? '-' : ''}${whole}${fraction} ${receive.assetCode}`,
    percent: percentage, exceedsFivePercent: difference * 100n > normalizedReceive * 5n }
}

export async function runQuoteOnly(client: QuoteClient, config: QuoteOnlyConfig, report: (line: string) => void): Promise<void> {
  let stage = 'walletAddress.get receptora'
  try {
    const receiver = await client.walletAddress.get({ url: config.receiverWalletAddress })
    stage = 'walletAddress.get pagadora'
    const payer = await client.walletAddress.get({ url: config.payerWalletAddress })
    stage = 'validación de metadatos de wallets'
    if (![receiver, payer].every(wallet => /^[A-Z]{3}$/.test(wallet.assetCode) &&
        Number.isInteger(wallet.assetScale) && wallet.assetScale >= 0 && wallet.assetScale <= 20))
      throw new Error('Metadatos de wallet inválidos')
    report(`Pagador: ${payer.assetCode}, escala ${payer.assetScale}`)
    report(`Farmacia: ${receiver.assetCode}, escala ${receiver.assetScale}`)
    stage = 'validación de wallets COP y escala'
    if (receiver.assetCode !== 'COP' || payer.assetCode !== 'COP') throw new Error('Wallet COP requerida')
    const amount = copReceiveAmount(receiver.assetScale)
    stage = 'grant.request incoming-payment'
    const incomingGrant = await client.grant.request({ url: receiver.authServer },
      { access_token: { access: [{ type: 'incoming-payment', actions: ['create'] }] } })
    if (!isFinalizedGrantWithAccessToken(incomingGrant)) throw new Error('Grant entrante no finalizado')
    stage = 'grant.request quote'
    const quoteGrant = await client.grant.request({ url: payer.authServer },
      { access_token: { access: [{ type: 'quote', actions: ['create'] }] } })
    if (!isFinalizedGrantWithAccessToken(quoteGrant)) throw new Error('Grant quote no finalizado')
    stage = 'incomingPayment.create'
    const incoming = await client.incomingPayment.create(
      { url: receiver.resourceServer, accessToken: incomingGrant.access_token.value },
      { walletAddress: config.receiverWalletAddress, incomingAmount: amount, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() },
    )
    stage = 'quote.create'
    const quote = await client.quote.create(
      { url: payer.resourceServer, accessToken: quoteGrant.access_token.value },
      { method: 'ilp', walletAddress: config.payerWalletAddress, receiver: incoming.id, receiveAmount: amount },
    )
    stage = 'validación de quote'
    if (quote.receiveAmount.value !== amount.value || quote.receiveAmount.assetCode !== amount.assetCode ||
        quote.receiveAmount.assetScale !== amount.assetScale) throw new Error('Quote no respetó receiveAmount')
    if (!/^\d+$/.test(quote.debitAmount.value) || !/^[A-Z]{3}$/.test(quote.debitAmount.assetCode) ||
        !Number.isInteger(quote.debitAmount.assetScale) || quote.debitAmount.assetScale < 0 || quote.debitAmount.assetScale > 20)
      throw new Error('DebitAmount inválido')
    const cost = quoteCost(quote.receiveAmount, quote.debitAmount)
    report('Quote: creada')
    report(`ReceiveAmount: ${quote.receiveAmount.value} ${quote.receiveAmount.assetCode} escala ${quote.receiveAmount.assetScale}`)
    report(`DebitAmount: ${quote.debitAmount.value} ${quote.debitAmount.assetCode} escala ${quote.debitAmount.assetScale}`)
    if (cost) {
      report(`Diferencia: ${cost.difference}`)
      report(`Costo: ${cost.percent}%`)
      report(`Supera 5 %: ${cost.exceedsFivePercent ? 'sí' : 'no'}`)
    } else report('Comparación directa y límite del 5 %: no aplican; assets distintos')
  } catch {
    // Los errores del SDK pueden contener URLs, respuestas y secretos: no se propagan ni imprimen.
    throw new Error(`Fallo en ${stage}; detalle reservado`)
  }
}
