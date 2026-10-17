import { readFile, writeFile, rename } from 'node:fs/promises'
import type { PaymentAttempt } from '../../../../contracts'

/** Diario local de IDs y estados, NUNCA de tokens. Se escribe ANTES de enviar dinero. */
export async function openAttemptJournal(path: string) {
  let records: Record<string, PaymentAttempt> = {}
  try {
    records = JSON.parse(await readFile(path, 'utf8'))
    if (!records || typeof records !== 'object' || Array.isArray(records) || Object.values(records).some(v =>
      !v || typeof v.incomingPaymentUrl !== 'string' || !['prepared', 'unknown', 'pending', 'completed', 'failed'].includes(v.status))) throw new Error('Invalid journal')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Diario de intentos inválido; no se habilitan pagos.')
  }
  const pendingAtStartup = new Set(Object.entries(records).filter(([,a]) => ['prepared', 'unknown', 'pending'].includes(a.status)).map(([key]) => key))
  let queue: Promise<void> = Promise.resolve()
  return {
    get blocked() { return [...pendingAtStartup].some(key => ['prepared', 'unknown', 'pending'].includes(records[key]?.status)) },
    entries() { return structuredClone(records) },
    record(key: string, attempt: PaymentAttempt): Promise<void> {
      // Lista blanca: un llamador no puede serializar otras propiedades.
      records[key] = { incomingPaymentUrl: attempt.incomingPaymentUrl, status: attempt.status,
        ...(attempt.quoteId ? { quoteId: attempt.quoteId } : {}), ...(attempt.outgoingId ? { outgoingId: attempt.outgoingId } : {}) }
      const payload = JSON.stringify(records, null, 2) + '\n'
      queue = queue.then(async () => { await writeFile(path + '.tmp', payload, { mode: 0o600 }); await rename(path + '.tmp', path) })
      return queue
    },
  }
}
