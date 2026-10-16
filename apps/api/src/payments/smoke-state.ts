import { randomUUID } from 'node:crypto'
import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'

export type SmokeAmount = { value: string; assetCode: string; assetScale: number }
export type SmokeStatus = 'incoming-created' | 'quote-created' | 'outgoing-created' |
  'outgoing-pending' | 'outgoing-failed' | 'outgoing-sent' | 'incoming-unavailable' |
  'amount-mismatch' | 'debit-mismatch' | 'amount-matched' | 'reconciled'
export type SmokeState = {
  version: 1
  startedAt: string
  status: SmokeStatus
  receiveAmount: SmokeAmount
  incomingPaymentId?: string
  quoteId?: string
  outgoingPaymentId?: string
  quoteDebitAmount?: SmokeAmount
  outgoingDebitAmount?: SmokeAmount
  outgoingSentAmount?: SmokeAmount
  outgoingReceiveAmount?: SmokeAmount
  incomingReceivedAmount?: SmokeAmount
}
export type SmokeInspection = {
  status: SmokeStatus
  outgoingDebitAmount: SmokeAmount
  outgoingSentAmount: SmokeAmount
  outgoingReceiveAmount: SmokeAmount
  incomingReceivedAmount?: SmokeAmount
  reason?: 'outgoing-failed' | 'quote-debit-mismatch'
}

export const smokeStateFile = '.env.r2-smoke-state.json'
const statuses: SmokeStatus[] = [
  'incoming-created', 'quote-created', 'outgoing-created', 'outgoing-pending',
  'outgoing-failed', 'outgoing-sent', 'incoming-unavailable', 'amount-mismatch',
  'amount-matched', 'debit-mismatch', 'reconciled',
]
const keys = new Set(['version', 'startedAt', 'status', 'receiveAmount',
  'incomingPaymentId', 'quoteId', 'outgoingPaymentId', 'quoteDebitAmount',
  'outgoingDebitAmount', 'outgoingSentAmount', 'outgoingReceiveAmount', 'incomingReceivedAmount'])
const amountKeys = ['quoteDebitAmount', 'outgoingDebitAmount', 'outgoingSentAmount',
  'outgoingReceiveAmount', 'incomingReceivedAmount'] as const

function isAmount(value: unknown): value is SmokeAmount {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const amount = value as Record<string, unknown>
  return Object.keys(amount).every((key) => ['value', 'assetCode', 'assetScale'].includes(key)) &&
    typeof amount.value === 'string' && /^\d+$/.test(amount.value) &&
    typeof amount.assetCode === 'string' && /^[A-Z]{3}$/.test(amount.assetCode) &&
    typeof amount.assetScale === 'number' && Number.isInteger(amount.assetScale) && amount.assetScale >= 0
}

function isResourceId(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
  } catch { return false }
}

function validState(value: unknown): value is SmokeState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const state = value as Record<string, unknown>
  if (!Object.keys(state).every((key) => keys.has(key)) || state.version !== 1 ||
      typeof state.startedAt !== 'string' || !Number.isFinite(Date.parse(state.startedAt)) ||
      !statuses.includes(state.status as SmokeStatus) || !isAmount(state.receiveAmount)) return false
  for (const key of ['incomingPaymentId', 'quoteId', 'outgoingPaymentId']) {
    if (state[key] !== undefined && !isResourceId(state[key])) return false
  }
  for (const key of amountKeys) {
    if (state[key] !== undefined && !isAmount(state[key])) return false
  }
  return true
}

export function createSmokeState(receiveAmount: SmokeAmount, startedAt = new Date().toISOString()): SmokeState {
  return { version: 1, startedAt, status: 'incoming-created', receiveAmount }
}

export async function saveSmokeState(path: string, state: SmokeState): Promise<void> {
  // Lista blanca: incluso si el llamador añade propiedades en tiempo de ejecución,
  // nunca se serializan tokens, llaves, cabeceras ni respuestas del SDK.
  const payload: SmokeState = {
    version: 1,
    startedAt: state.startedAt,
    status: state.status,
    receiveAmount: { value: state.receiveAmount.value, assetCode: state.receiveAmount.assetCode,
      assetScale: state.receiveAmount.assetScale },
    ...(state.incomingPaymentId ? { incomingPaymentId: state.incomingPaymentId } : {}),
    ...(state.quoteId ? { quoteId: state.quoteId } : {}),
    ...(state.outgoingPaymentId ? { outgoingPaymentId: state.outgoingPaymentId } : {}),
    ...Object.fromEntries(amountKeys.filter((key) => state[key] !== undefined).map((key) => {
      const amount = state[key]!
      return [key, { value: amount.value, assetCode: amount.assetCode, assetScale: amount.assetScale }]
    })),
  }
  if (!validState(payload)) throw new Error('Estado local inválido')
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    await rename(temporary, path)
  } catch {
    await unlink(temporary).catch(() => undefined)
    throw new Error('No se pudo guardar el estado local')
  }
}

export async function readSmokeState(path: string): Promise<SmokeState> {
  let raw: string
  try { raw = await readFile(path, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Estado local ausente')
    throw new Error('No se pudo leer el estado local')
  }
  try {
    const state: unknown = JSON.parse(raw)
    if (validState(state)) return state
  } catch { /* Se informa solo una causa sanitizada. */ }
  throw new Error('Estado local inválido')
}

export async function assertNoSmokeState(path: string): Promise<void> {
  try { await stat(path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw new Error('No se pudo comprobar el estado local')
  }
  throw new Error('Ya existe estado local; no se inicia otro smoke')
}

export function requireCompleteSmokeState(state: SmokeState): asserts state is SmokeState & {
  incomingPaymentId: string; quoteId: string; outgoingPaymentId: string
} {
  if (!state.incomingPaymentId || !state.quoteId || !state.outgoingPaymentId) throw new Error('Faltan IDs exactos')
}

export async function inspectStoredPayment(
  state: SmokeState,
  getOutgoing: (id: string) => Promise<{ failed: boolean; sentAmount: SmokeAmount; debitAmount: SmokeAmount; receiveAmount: SmokeAmount }>,
  getIncoming: (id: string) => Promise<{ completed: boolean; receivedAmount?: SmokeAmount }>,
): Promise<SmokeInspection> {
  requireCompleteSmokeState(state)
  const outgoing = await getOutgoing(state.outgoingPaymentId)
  if (!isAmount(outgoing.sentAmount) || !isAmount(outgoing.debitAmount) || !isAmount(outgoing.receiveAmount)) {
    throw new Error('Estado saliente inválido')
  }
  const observation = { outgoingDebitAmount: outgoing.debitAmount,
    outgoingSentAmount: outgoing.sentAmount, outgoingReceiveAmount: outgoing.receiveAmount }
  if (outgoing.failed) return { ...observation, status: 'outgoing-failed', reason: 'outgoing-failed' }
  if (state.quoteDebitAmount && !sameAmount(state.quoteDebitAmount, outgoing.debitAmount)) {
    return { ...observation, status: 'debit-mismatch', reason: 'quote-debit-mismatch' }
  }
  // sentAmount no es un indicador de finalización: su unidad puede diferir de
  // receiveAmount y debitAmount. La confirmación se basa en el incoming leído.
  const incoming = await getIncoming(state.incomingPaymentId)
  if (!incoming.receivedAmount) return { ...observation, status: 'incoming-unavailable' }
  if (!isAmount(incoming.receivedAmount)) throw new Error('Estado entrante inválido')
  return { ...observation, incomingReceivedAmount: incoming.receivedAmount,
    status: incoming.completed && sameAmount(incoming.receivedAmount, state.receiveAmount)
      ? 'amount-matched' : incoming.completed ? 'amount-mismatch' : 'incoming-unavailable' }
}

function sameAmount(left: SmokeAmount, right: SmokeAmount): boolean {
  return left.value === right.value && left.assetCode === right.assetCode && left.assetScale === right.assetScale
}

export function amountDifference(debit: SmokeAmount, received: SmokeAmount): SmokeAmount | undefined {
  if (debit.assetCode !== received.assetCode || debit.assetScale !== received.assetScale) return undefined
  const difference = BigInt(debit.value) - BigInt(received.value)
  return { value: difference.toString(), assetCode: debit.assetCode, assetScale: debit.assetScale }
}
