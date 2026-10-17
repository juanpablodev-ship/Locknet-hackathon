import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openAttemptJournal } from './journal'
import { PaymentError, safePaymentError } from './errors'
import { OpenPaymentsClientError } from '@interledger/open-payments'

describe('diario local sin capacidades de pago', () => {
  it('guarda IDs y estados; reinicio con pendiente bloquea y uno terminal no', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'locknet-attempts-')); const path = join(dir, 'journal.json')
    try {
      const j = await openAttemptJournal(path); expect(j.blocked).toBe(false)
      await j.record('quote', { incomingPaymentUrl: 'https://example.invalid/incoming', status: 'unknown', extra: 'not-recordable' } as any)
      expect(await readFile(path, 'utf8')).not.toContain('not-recordable')
      const recovery = await openAttemptJournal(path)
      expect(recovery.blocked).toBe(true)
      await recovery.record('quote', { incomingPaymentUrl: 'https://example.invalid/incoming', status: 'failed' })
      expect(recovery.blocked).toBe(false)
      await j.record('quote', { incomingPaymentUrl: 'https://example.invalid/incoming', status: 'failed' })
      expect((await openAttemptJournal(path)).blocked).toBe(false)
      await writeFile(path, 'invalid'); await expect(openAttemptJournal(path)).rejects.toThrow('inválido')
    } finally { await unlink(path); await unlink(path + '.tmp').catch(() => {}); await rmdir(dir) }
  })
  it('refresca una resolución externa sin borrar intentos ni reiniciar el consumidor', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'locknet-refresh-')); const path = join(dir, 'journal.json')
    try {
      const writer = await openAttemptJournal(path)
      const attempt = { incomingPaymentUrl: 'https://example.invalid/incoming', outgoingId: 'https://example.invalid/outgoing', status: 'unknown' as const }
      await writer.record('quote', attempt)
      const running = await openAttemptJournal(path)
      expect(running.blocked).toBe(true)
      await writer.record('quote', { ...attempt, status: 'failed' })
      expect(running.blocked).toBe(true)
      await running.refresh()
      expect(running.blocked).toBe(false)
      expect(running.entries().quote.status).toBe('failed')
    } finally { await unlink(path); await rmdir(dir) }
  })
  it.each(['missing', 'changed-id', 'corrupt'])('no desbloquea una recuperación inválida: %s', async kind => {
    const dir = await mkdtemp(join(tmpdir(), 'locknet-refresh-invalid-')); const path = join(dir, 'journal.json')
    try {
      const writer = await openAttemptJournal(path)
      await writer.record('quote', { incomingPaymentUrl: 'https://example.invalid/incoming', status: 'unknown' })
      const running = await openAttemptJournal(path)
      await writeFile(path, kind === 'corrupt' ? 'invalid' : JSON.stringify(kind === 'missing' ? {} : { quote: { incomingPaymentUrl: 'https://other.invalid/incoming', status: 'failed' } }))
      await expect(running.refresh()).rejects.toThrow('conserva el bloqueo')
      expect(running.blocked).toBe(true)
    } finally { await unlink(path); await rmdir(dir) }
  })
  it('clasifica solo causas confirmadas y no expone detalles del proveedor', () => {
    const funds = safePaymentError(new OpenPaymentsClientError('synthetic-private-detail', { description: 'synthetic-private-detail', code: 'insufficient_funds', status: 400 }), true)
    expect(funds.message).toContain('fondos insuficientes'); expect(funds.outcome).toBe('not-created')
    const unknown = safePaymentError(new Error('synthetic-private-detail'), true)
    expect(unknown.outcome).toBe('unknown'); expect(unknown.message).not.toContain('synthetic-private-detail')
    expect(safePaymentError(new PaymentError('Cupo agotado.', 'not-created')).message).toBe('Cupo agotado.')
  })
})
