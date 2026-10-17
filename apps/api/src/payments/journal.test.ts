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
      expect((await openAttemptJournal(path)).blocked).toBe(true)
      await j.record('quote', { incomingPaymentUrl: 'https://example.invalid/incoming', status: 'failed' })
      expect((await openAttemptJournal(path)).blocked).toBe(false)
      await writeFile(path, 'invalid'); await expect(openAttemptJournal(path)).rejects.toThrow('inválido')
    } finally { await unlink(path); await unlink(path + '.tmp').catch(() => {}); await rmdir(dir) }
  })
  it('clasifica solo causas confirmadas y no expone detalles del proveedor', () => {
    const funds = safePaymentError(new OpenPaymentsClientError('synthetic-private-detail', { description: 'synthetic-private-detail', code: 'insufficient_funds', status: 400 }), true)
    expect(funds.message).toContain('fondos insuficientes'); expect(funds.outcome).toBe('not-created')
    const unknown = safePaymentError(new Error('synthetic-private-detail'), true)
    expect(unknown.outcome).toBe('unknown'); expect(unknown.message).not.toContain('synthetic-private-detail')
    expect(safePaymentError(new PaymentError('Cupo agotado.', 'not-created')).message).toBe('Cupo agotado.')
  })
})
