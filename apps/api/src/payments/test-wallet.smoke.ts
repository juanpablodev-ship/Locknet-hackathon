import { createAuthenticatedClient, isFinalizedGrantWithAccessToken } from '@interledger/open-payments'

// Script aislado: no importar desde el servidor ni ejecutar sin autorización expresa.
// Cargar .env local con el comando existente `npm run op -- ... --execute-smoke` SOLO
// después de aprobar un pago de prueba. Este archivo no carga ni registra secretos.
// Fuentes del SDK:
// https://openpayments.dev/sdk/incoming-create/
// https://openpayments.dev/sdk/quote-create/
// https://openpayments.dev/sdk/grant-create-incoming/
// https://openpayments.dev/sdk/grant-create-quote/
// https://openpayments.dev/es/sdk/outgoing-create/
// https://openpayments.dev/sdk/outgoing-get/
// https://openpayments.dev/sdk/incoming-get/
// El token saliente debe ser del pagador configurado y proceder de un grant
// finalizado. El grant saliente exige consentimiento interactivo en la wallet:
// https://openpayments.dev/sdk/grant-create-outgoing/
// https://openpayments.dev/sdk/grant-continue/
// Este script no solicita ni continúa ese grant y no puede saltarse la interacción.

const required = [
  'WALLET_ADDRESS', 'KEY_ID', 'PRIVATE_KEY_PATH',
  'PAYER_WALLET_ADDRESS', 'RECEIVER_WALLET_ADDRESS',
  'OUTGOING_PAYMENT_ACCESS_TOKEN', 'SMOKE_RECEIVE_AMOUNT',
  'SMOKE_ASSET_CODE', 'SMOKE_ASSET_SCALE',
] as const

async function main(): Promise<void> {
  if (!process.argv.includes('--execute-smoke')) {
    console.error('Smoke desactivado: falta autorización explícita de ejecución.')
    process.exitCode = 1
    return
  }

  const missing = required.filter((name) => !process.env[name]?.trim())
  if (missing.length) {
    for (const name of missing) console.error(name)
    process.exitCode = 1
    return
  }
  const env = process.env as Record<(typeof required)[number], string>
  if (!/^\d+$/.test(env.SMOKE_RECEIVE_AMOUNT) || BigInt(env.SMOKE_RECEIVE_AMOUNT) <= 0n) {
    console.error('SMOKE_RECEIVE_AMOUNT')
    process.exitCode = 1
    return
  }
  const scale = Number(env.SMOKE_ASSET_SCALE)
  if (!Number.isInteger(scale) || scale < 0) {
    console.error('SMOKE_ASSET_SCALE')
    process.exitCode = 1
    return
  }

  const amount = { value: env.SMOKE_RECEIVE_AMOUNT, assetCode: env.SMOKE_ASSET_CODE, assetScale: scale }
  let step = 'inicialización del cliente autenticado'
  try {
    const client = await createAuthenticatedClient({
      walletAddressUrl: env.WALLET_ADDRESS,
      privateKey: env.PRIVATE_KEY_PATH,
      keyId: env.KEY_ID,
    })

    // walletAddress.get: ejemplos oficiales de incoming-create y quote-create.
    step = 'resolución de la wallet receptora; verifica que exista'
    const receiver = await client.walletAddress.get({ url: env.RECEIVER_WALLET_ADDRESS })
    if (receiver.assetCode !== amount.assetCode || receiver.assetScale !== amount.assetScale) {
      step = 'validación de moneda o escala de la wallet receptora'
      throw new Error('moneda o escala receptora distinta de SMOKE_ASSET_CODE/SMOKE_ASSET_SCALE')
    }
    step = 'resolución de la wallet pagadora; verifica que exista'
    const payer = await client.walletAddress.get({ url: env.PAYER_WALLET_ADDRESS })

    step = 'grant entrante; si requiere interacción, debe finalizarse antes de continuar'
    const incomingGrant = await client.grant.request(
      { url: receiver.authServer },
      { access_token: { access: [{ type: 'incoming-payment', actions: ['create', 'read'] }] } },
    )
    if (!isFinalizedGrantWithAccessToken(incomingGrant)) {
      step = 'grant entrante pendiente; falta consentimiento o continuación'
      throw new Error('grant entrante pendiente')
    }

    step = 'creación del incoming payment'
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
    const incoming = await client.incomingPayment.create(
      { url: receiver.resourceServer, accessToken: incomingGrant.access_token.value },
      { walletAddress: env.RECEIVER_WALLET_ADDRESS, incomingAmount: amount, expiresAt },
    )

    step = 'grant de cotización; si requiere interacción, debe finalizarse antes de continuar'
    const quoteGrant = await client.grant.request(
      { url: payer.authServer },
      { access_token: { access: [{ type: 'quote', actions: ['create'] }] } },
    )
    if (!isFinalizedGrantWithAccessToken(quoteGrant)) {
      step = 'grant de cotización pendiente; falta consentimiento o continuación'
      throw new Error('grant de cotización pendiente')
    }

    step = 'cotización con receiveAmount; la Test Wallet puede rechazar esta combinación'
    const quote = await client.quote.create(
      { url: payer.resourceServer, accessToken: quoteGrant.access_token.value },
      { method: 'ilp', walletAddress: env.PAYER_WALLET_ADDRESS, receiver: incoming.id, receiveAmount: amount },
    )
    if (quote.receiveAmount.value !== amount.value || quote.receiveAmount.assetCode !== amount.assetCode ||
        quote.receiveAmount.assetScale !== amount.assetScale) {
      step = 'validación de receiveAmount de la quote'
      throw new Error('la quote no acepta receiveAmount solicitado')
    }
    if (Date.now() >= Date.parse(incoming.expiresAt ?? expiresAt)) {
      step = 'incoming payment vencido antes del pago'
      throw new Error('incoming payment vencido')
    }

    // El token en .env debe proceder del grant saliente interactivo FINALIZADO del
    // pagador, con permisos create/read y cupo suficiente. Si está pendiente o vencido,
    // este script no llama grant.continue ni reintenta: se debe completar en la wallet.
    step = 'pago saliente; verifica autorización del token y continuación del grant saliente'
    const outgoing = await client.outgoingPayment.create(
      { url: payer.resourceServer, accessToken: env.OUTGOING_PAYMENT_ACCESS_TOKEN },
      { walletAddress: env.PAYER_WALLET_ADDRESS, quoteId: quote.id },
    )

    step = 'consulta del outgoing payment; el token debe incluir permiso read'
    const outgoingState = await client.outgoingPayment.get({
      url: outgoing.id, accessToken: env.OUTGOING_PAYMENT_ACCESS_TOKEN,
    })
    if (outgoingState.failed) {
      step = 'outgoing payment fallido'
      throw new Error('outgoing payment fallido')
    }
    if (outgoingState.sentAmount.assetCode !== outgoingState.debitAmount.assetCode ||
        outgoingState.sentAmount.assetScale !== outgoingState.debitAmount.assetScale ||
        BigInt(outgoingState.sentAmount.value) < BigInt(outgoingState.debitAmount.value)) {
      step = 'outgoing payment pendiente; no se reintenta automáticamente'
      throw new Error('outgoing payment pendiente; no se reintenta automáticamente')
    }

    step = 'consulta del incoming payment'
    const incomingState = await client.incomingPayment.get({
      url: incoming.id, accessToken: incomingGrant.access_token.value,
    })
    if (Date.now() >= Date.parse(incomingState.expiresAt ?? expiresAt)) {
      step = 'incoming payment vencido'
      throw new Error('incoming payment vencido')
    }
    if (!incomingState.completed) {
      step = 'incoming payment pendiente de completarse'
      throw new Error('incoming payment pendiente')
    }
    if (incomingState.receivedAmount.value !== amount.value ||
        incomingState.receivedAmount.assetCode !== amount.assetCode ||
        incomingState.receivedAmount.assetScale !== amount.assetScale) {
      step = 'conciliación; monto recibido distinto del esperado'
      throw new Error('monto recibido distinto del esperado')
    }

    // No se muestran IDs, URLs, respuestas del SDK ni detalles del grant.
    console.log('Smoke verificado: pago saliente confirmado y monto recibido coincidente.')
  } catch {
    // Los errores del SDK pueden incluir URLs o cabeceras: jamás se imprimen aquí.
    console.error(`Smoke falló en: ${step}. Revisa el paso indicado; sin reintentos automáticos.`)
    process.exitCode = 1
  }
}

// Importar este módulo nunca inicia el smoke, incluso si el proceso tiene
// --execute-smoke. main() conserva su segunda barrera de autorización explícita.
// El tsconfig actual emite CommonJS; require.main identifica el módulo principal.
if (typeof require !== 'undefined' && require.main === module) {
  void main()
}
