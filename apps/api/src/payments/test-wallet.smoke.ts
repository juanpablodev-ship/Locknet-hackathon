import { createAuthenticatedClient, isFinalizedGrantWithAccessToken } from '@interledger/open-payments'
import { amountDifference, assertNoSmokeState, createSmokeState, inspectStoredPayment, readSmokeState,
  requireCompleteSmokeState, saveSmokeState, smokeStateFile } from './smoke-state'
import type { SmokeAmount, SmokeInspection, SmokeState } from './smoke-state'

// Script aislado: no importar desde el servidor ni ejecutar sin autorización expresa.
// Cargar .env local con el comando existente `npm run op -- ... --execute-smoke` SOLO
// después de aprobar un pago de prueba. Este archivo no carga ni registra secretos.
// Guarda solo IDs, fecha, montos y estado en `.env.r2-smoke-state.json`,
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

function formatAmount(amount: SmokeAmount): string {
  const negative = amount.value.startsWith('-')
  const digits = (negative ? amount.value.slice(1) : amount.value).padStart(amount.assetScale + 1, '0')
  const split = amount.assetScale ? `${digits.slice(0, -amount.assetScale)}.${digits.slice(-amount.assetScale)}` : digits
  return `${amount.assetCode} ${negative ? '-' : ''}${split}`
}

function reportAmounts(state: SmokeState, result: SmokeInspection): void {
  console.log(`Solicitado como receiveAmount: ${formatAmount(state.receiveAmount)}`)
  console.log(`DebitAmount de la quote: ${state.quoteDebitAmount ? formatAmount(state.quoteDebitAmount) : 'no registrado'}`)
  console.log(`DebitAmount observado del outgoing: ${formatAmount(result.outgoingDebitAmount)}`)
  console.log(`SentAmount observado del outgoing: ${formatAmount(result.outgoingSentAmount)}`)
  console.log(`ReceivedAmount observado del incoming: ${result.incomingReceivedAmount ? formatAmount(result.incomingReceivedAmount) : 'no disponible'}`)
  if (result.incomingReceivedAmount) {
    const difference = amountDifference(result.outgoingDebitAmount, result.incomingReceivedAmount)
    console.log(`Diferencia débito menos recepción: ${difference ? formatAmount(difference) : 'no comparable (moneda o escala distinta)'}`)
  }
  if (result.reason) console.log(`Motivo sanitizado: ${result.reason}`)
  console.log(`Estado de conciliación: ${result.status}`)
}

function observedState(state: SmokeState, result: SmokeInspection): SmokeState {
  return { ...state, status: result.status, outgoingDebitAmount: result.outgoingDebitAmount,
    outgoingSentAmount: result.outgoingSentAmount, outgoingReceiveAmount: result.outgoingReceiveAmount,
    ...(result.incomingReceivedAmount ? { incomingReceivedAmount: result.incomingReceivedAmount } : {}) }
}

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
    const result = await inspectStoredPayment(state,
      (id) => client.outgoingPayment.get({ url: id, accessToken: process.env.OUTGOING_PAYMENT_ACCESS_TOKEN! }),
      (id) => {
        step = 'consulta del incoming payment'
        const incomingToken = process.env.INCOMING_PAYMENT_ACCESS_TOKEN
        if (!incomingToken) {
          console.error('FALTA: INCOMING_PAYMENT_ACCESS_TOKEN')
          return Promise.resolve({ completed: false })
        }
        return client.incomingPayment.get({ url: id, accessToken: incomingToken })
      },
    )
    step = 'persistencia del estado consultado'
    await saveSmokeState(smokeStateFile, observedState(state, result))
    reportAmounts(state, result)
    if (result.status !== 'amount-matched') process.exitCode = 1
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
    state = { ...state, quoteId: quote.id, quoteDebitAmount: quote.debitAmount, status: 'quote-created' }
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
    state = { ...state, outgoingPaymentId: outgoing.id, status: 'outgoing-created',
      outgoingDebitAmount: outgoing.debitAmount, outgoingSentAmount: outgoing.sentAmount,
      outgoingReceiveAmount: outgoing.receiveAmount }
    await saveSmokeState(smokeStateFile, state)

    step = 'consulta del outgoing payment; el token debe incluir permiso read'
    const result = await inspectStoredPayment(state,
      (id) => client.outgoingPayment.get({ url: id, accessToken: env.OUTGOING_PAYMENT_ACCESS_TOKEN }),
      (id) => {
        step = 'consulta del incoming payment'
        return client.incomingPayment.get({ url: id, accessToken: incomingGrant.access_token.value }).then((payment) => {
          if (!payment.completed && Date.now() >= Date.parse(payment.expiresAt ?? expiresAt)) {
            step = 'incoming payment vencido'
            throw new Error('incoming payment vencido')
          }
          return payment
        })
      },
    )
    step = 'persistencia y conciliación de montos observados'
    state = observedState(state, result)
    await saveSmokeState(smokeStateFile, state)
    reportAmounts(state, result)
    if (result.status !== 'amount-matched') {
      step = `conciliación: ${result.status}`
      throw new Error('conciliación incompleta')
    }
    await saveSmokeState(smokeStateFile, { ...state, status: 'reconciled' })
    console.log('Smoke verificado: recepción esperada confirmada; débito informado por separado.')
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
