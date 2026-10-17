import { createAuthenticatedClient, OpenPaymentsClientError, type AuthenticatedClient } from '@interledger/open-payments'
import { readFile, writeFile } from 'node:fs/promises'
import type { PaymentAttempt, SharedWallet, Spend, Money } from '../contracts'
import { createPaymentReader } from '../apps/api/src/payments/reader'
import { PaymentError } from '../apps/api/src/payments/errors'
import { openAttemptJournal } from '../apps/api/src/payments/journal'

type Snapshot = { capturedAt: string; wallets: SharedWallet[]; spends: Spend[] }
type Journal = Awaited<ReturnType<typeof openAttemptJournal>>
const validMoney = (m: Money) => m && /^\d+$/.test(m.value) && Number.isInteger(m.assetScale) && m.assetScale >= 0 && m.assetScale <= 255 && /^[A-Z0-9]{1,12}$/.test(m.assetCode)
const enough = (received: Money, expected: Money) => validMoney(received) && validMoney(expected) &&
  BigInt(expected.value) > 0n && received.assetCode === expected.assetCode && received.assetScale === expected.assetScale && BigInt(received.value) >= BigInt(expected.value)

/** Solo grant read y GET de IDs existentes. No contiene create de pagos, quotes ni cobros. */
export async function recoverExisting(client: AuthenticatedClient, snapshot: Snapshot, journal: Journal, apply: boolean, readTokens: ReadonlyMap<string, string> = new Map()) {
  const reader = createPaymentReader(client, readTokens)
  const report: { spendId: string; memberName: string; status: PaymentAttempt['status']; stage?: 'outgoing' | 'incoming' | 'validation'; received?: Money; expired?: boolean; reason: string }[] = []
  const checked = new Map<string, { status: PaymentAttempt['status']; received: Money; expired: boolean }>()
  for (const spend of snapshot.spends) {
    const wallet = snapshot.wallets.find(w => w.id === spend.walletId)
    if (!wallet) throw new Error('El archivo de recuperación no identifica el grupo.')
    for (const share of spend.shares) {
      const member = wallet.members.find(m => m.id === share.memberId)
      if (!member) throw new Error('El archivo de recuperación no identifica al miembro.')
      for (const attempt of share.attempts ?? []) {
        if (!attempt.outgoingId) {
          if (apply && attempt.quoteId && ['prepared', 'pending', 'unknown'].includes(attempt.status)) {
            await journal.record(attempt.quoteId, { ...attempt, status: 'unknown' })
          }
          report.push({ spendId: spend.id, memberName: member.name, status: attempt.status,
            reason: attempt.status === 'failed' ? 'Este intento no creó un pago.' : 'No se conserva un ID saliente; no se puede desbloquear automáticamente.' })
          continue
        }
        let stage: 'outgoing' | 'incoming' | 'validation' = 'outgoing'
        try {
          let result = checked.get(attempt.outgoingId)
          if (!result) {
            const outgoing = await reader.outgoing(attempt.outgoingId, member.walletAddress)
            if (outgoing.walletAddress !== member.walletAddress || outgoing.receiver !== attempt.incomingPaymentUrl) throw new Error('Recurso no corresponde al intento')
            stage = 'incoming'
            const incoming = await reader.incoming(attempt.incomingPaymentUrl, spend.destination.walletAddress)
            stage = 'validation'
            if (incoming.walletAddress !== spend.destination.walletAddress || !validMoney(incoming.receivedAmount)) throw new Error('Cobro no corresponde al destino')
            const received = incoming.receivedAmount
            const status = enough(received, outgoing.receiveAmount) ? 'completed' : outgoing.failed ? 'failed' : 'pending'
            result = { status, received, expired: !!incoming.expiresAt && Date.parse(incoming.expiresAt) <= Date.now() }
            checked.set(attempt.outgoingId, result)
          }
          report.push({ spendId: spend.id, memberName: member.name, ...result,
            reason: result.status === 'completed' ? 'Recepción confirmada por el proveedor.' : result.status === 'failed' ? 'Outgoing fallido confirmado; recepción consultada.' : 'El proveedor aún no confirma un estado terminal; vencer el cobro no demuestra fallo.' })
          if (apply) {
            attempt.status = result.status
            if (attempt.quoteId) await journal.record(attempt.quoteId, { ...attempt, status: result.status })
          }
        } catch (error) {
          if (apply) attempt.status = 'unknown'
          if (apply && attempt.quoteId) await journal.record(attempt.quoteId, { ...attempt, status: 'unknown' })
          const hint = error instanceof PaymentError ? error.message : error instanceof OpenPaymentsClientError ? 'Consulta rechazada HTTP ' + error.status + ' (' + (/^[a-z_]{1,60}$/.test(error.code ?? '') ? error.code : 'sin codigo') + ').' : 'Respuesta incompatible con el intento guardado.'
          report.push({ spendId: spend.id, memberName: member.name, status: 'unknown', stage, reason: (stage === 'outgoing' ? 'Lectura del pago saliente: ' : stage === 'incoming' ? 'Lectura del cobro de la farmacia: ' : 'Validación del recurso: ') + hint + ' Se conserva como desconocido; no se desbloquea este intento.' })
        }
      }
    }
  }
  return { checkedAt: new Date().toISOString(), applied: apply, blocked: journal.blocked || report.some(r => r.status === 'unknown' || r.status === 'pending' || r.status === 'prepared'), report }
}

let recoveryStage = 'cargar archivo'
if (require.main === module) {
  ;(async () => {
    const snapshotPath = process.env.RECOVERY_SNAPSHOT_PATH ?? '.env.recovery-state.json'
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as Snapshot
    if (!Array.isArray(snapshot.wallets) || !Array.isArray(snapshot.spends)) throw new Error('Archivo de recuperación inválido')
    recoveryStage = 'crear cliente'
    const client = await createAuthenticatedClient({ walletAddressUrl: process.env.WALLET_ADDRESS!, keyId: process.env.KEY_ID!, privateKey: process.env.PRIVATE_KEY_PATH!, logLevel: 'silent', requestTimeoutMs: 15000 })
    recoveryStage = 'abrir diario'
    const journal = await openAttemptJournal(process.env.PAYMENT_JOURNAL_PATH ?? '.env.payment-attempts.json')
    recoveryStage = 'asociar y consultar intentos'
    const result = await recoverExisting(client, snapshot, journal, process.argv.includes('--apply'))
    await writeFile('.env.recovery-report.json', JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
    // Solo resultados saneados, nunca respuestas completas ni tokens.
    console.log(JSON.stringify(result, null, 2))
  })().catch(() => { console.error('Recuperación no completada en ' + recoveryStage + '. Se conservan el diario y los bloqueos. No se envió ningún pago.'); process.exitCode = 1 })
}
