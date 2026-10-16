import { createAuthenticatedClient, isFinalizedGrantWithAccessToken } from '@interledger/open-payments'
import { assertNoSmokeState, createSmokeState, inspectStoredPayment, readSmokeState,
  requireCompleteSmokeState, saveSmokeState, smokeStateFile } from './smoke-state'

// Script aislado: no importar desde el servidor ni ejecutar sin autorización expresa.
// Cargar .env local con el comando existente `npm run op -- ... --execute-smoke` SOLO
// después de aprobar un pago de prueba. Este archivo no carga ni registra secretos.
// Guarda solo IDs, fecha, monto esperado y estado en `.env.r2-smoke-state.json`,
// ignorado por la regla `.env.*` de Git. Si ya existe, no inicia otro smoke.
// `--status-only` nunca crea recursos; para leer el incoming autenticado tras
// el outgoing se necesita INCOMING_PAYMENT_ACCESS_TOKEN en el entorno local.
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

// Fuentes oficiales para la ruta de solo lectura:
// https://openpayments.dev/sdk/outgoing-get/
// https://openpayments.dev/sdk/incoming-get/ (lectura autenticada por ID)
async function statusOnly(): Promise<void> {
  let step = 'lectura del estado local'
  try {
    const state = await readSmokeState(smokeStateFile)
    requireCompleteSmokeState(state) // Ninguna llamada de red si falta un ID exacto.
    const needed = ['WALLET_ADDRESS', 'KEY_ID', 'PRIVATE_KEY_PATH', 'OUTGOING_PAYMENT_ACCESS_TOKEN'] as const
    const missing = needed.filter((name) => !process.env[name]?.trim())
    if (missing.length) {
      for (const name of missing) console.error(`FALTA: ${name}`)
      process.exitCode = 1
      return
    }
    step = 'cliente autenticado'
    const client = await createAuthenticatedClient({
      walletAddressUrl: process.env.WALLET_ADDRESS!,
      privateKey: process.env.PRIVATE_KEY_PATH!,
      keyId: process.env.KEY_ID!,
    })
    step = 'consulta del outgoing payment'
    const status = await inspectStoredPayment(state,
      (id) => client.outgoingPayment.get({ url: id, accessToken: process.env.OUTGOING_PAYMENT_ACCESS_TOKEN! }),
      (id) => {
        step = 'consulta del incoming payment'
        const incomingToken = process.env.INCOMING_PAYMENT_ACCESS_TOKEN
        if (!incomingToken) {
          console.error('FALTA: INCOMING_PAYMENT_ACCESS_TOKEN')
          return Promise.resolve({})
        }
        return client.incomingPayment.get({ url: id, accessToken: incomingToken })
      },
    )
    step = 'persistencia del estado consultado'
    await saveSmokeState(smokeStateFile, { ...state, status })
    console.log(`Estado conocido: ${status}`)
    if (status !== 'amount-matched') process.exitCode = 1
  } catch (error) {
    const safe = error instanceof Error && ['Estado local ausente', 'Estado local inválido', 'Faltan IDs exactos'].includes(error.message)
      ? error.message : `Falló en: ${step}`
    console.error(`Estado no verificado: ${safe}`)
    process.exitCode = 1
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--status-only')) {
    if (process.argv.includes('--execute-smoke')) {
      console.error('Modos incompatibles.')
      process.exitCode = 1
      return
    }
    await statusOnly()
    return
  }
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
  let state = createSmokeState(amount)
  let step = 'inicialización del cliente autenticado'
  try {
    step = 'comprobación del estado local previo'
    await assertNoSmokeState(smokeStateFile)
    step = 'inicialización del cliente autenticado'
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
    step = 'persistencia del incoming payment'
    state = { ...state, incomingPaymentId: incoming.id, status: 'incoming-created' }
    await saveSmokeState(smokeStateFile, state)

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
    step = 'persistencia de la quote'
    state = { ...state, quoteId: quote.id, status: 'quote-created' }
    await saveSmokeState(smokeStateFile, state)
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
    step = 'persistencia del outgoing payment'
    state = { ...state, outgoingPaymentId: outgoing.id, status: 'outgoing-created' }
    await saveSmokeState(smokeStateFile, state)

    step = 'consulta del outgoing payment; el token debe incluir permiso read'
    const outgoingState = await client.outgoingPayment.get({
      url: outgoing.id, accessToken: env.OUTGOING_PAYMENT_ACCESS_TOKEN,
    })
    if (outgoingState.failed) {
      step = 'outgoing payment fallido'
      await saveSmokeState(smokeStateFile, { ...state, status: 'outgoing-failed' })
      throw new Error('outgoing payment fallido')
    }
    if (outgoingState.sentAmount.assetCode !== outgoingState.debitAmount.assetCode ||
        outgoingState.sentAmount.assetScale !== outgoingState.debitAmount.assetScale ||
        BigInt(outgoingState.sentAmount.value) < BigInt(outgoingState.debitAmount.value)) {
      step = 'outgoing payment pendiente; no se reintenta automáticamente'
      await saveSmokeState(smokeStateFile, { ...state, status: 'outgoing-pending' })
      throw new Error('outgoing payment pendiente; no se reintenta automáticamente')
    }
    await saveSmokeState(smokeStateFile, { ...state, status: 'outgoing-sent' })

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
      await saveSmokeState(smokeStateFile, { ...state, status: 'incoming-unavailable' })
      throw new Error('incoming payment pendiente')
    }
    if (incomingState.receivedAmount.value !== amount.value ||
        incomingState.receivedAmount.assetCode !== amount.assetCode ||
        incomingState.receivedAmount.assetScale !== amount.assetScale) {
      step = 'conciliación; monto recibido distinto del esperado'
      await saveSmokeState(smokeStateFile, { ...state, status: 'amount-mismatch' })
      throw new Error('monto recibido distinto del esperado')
    }
    await saveSmokeState(smokeStateFile, { ...state, status: 'reconciled' })

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
