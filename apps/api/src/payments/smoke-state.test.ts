import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertNoSmokeState, createSmokeState, inspectStoredPayment, readSmokeState, saveSmokeState } from './smoke-state'

const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

async function statePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'r2-smoke-state-'))
  directories.push(directory)
  return join(directory, '.env.r2-smoke-state.json')
}

const incomingPaymentId = 'https://example.test/incoming/one'
const quoteId = 'https://example.test/quotes/one'
const outgoingPaymentId = 'https://example.test/outgoing/one'
const amount = { value: '100', assetCode: 'EUR', assetScale: 2 }

describe('estado local del smoke R2', () => {
  it('persiste cada ID y permite leer el estado después de cerrar el proceso', async () => {
    const path = await statePath()
    const initial = createSmokeState(amount, '2026-10-16T20:00:00.000Z')
    await saveSmokeState(path, { ...initial, incomingPaymentId, status: 'incoming-created' })
    expect((await readSmokeState(path)).incomingPaymentId).toBe(incomingPaymentId)
    await saveSmokeState(path, { ...initial, incomingPaymentId, quoteId, status: 'quote-created' })
    expect((await readSmokeState(path)).quoteId).toBe(quoteId)
    await saveSmokeState(path, { ...initial, incomingPaymentId, quoteId, outgoingPaymentId, status: 'outgoing-created' })
    const stored = await readSmokeState(path)
    expect(stored).toMatchObject({ incomingPaymentId, quoteId, outgoingPaymentId, status: 'outgoing-created' })
    expect(stored.startedAt).toBe(initial.startedAt)
  })

  it('no persiste propiedades extra ni permite leer un estado que contenga secretos', async () => {
    const path = await statePath()
    const state = { ...createSmokeState(amount), incomingPaymentId, status: 'incoming-created' as const }
    const withExtras = { ...state, accessToken: 'SENTINEL_TOKEN', privateKey: 'SENTINEL_KEY' }
    await saveSmokeState(path, withExtras)
    const raw = await readFile(path, 'utf8')
    expect(raw).not.toContain('SENTINEL_TOKEN')
    expect(raw).not.toContain('SENTINEL_KEY')
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect(await readSmokeState(path)).toMatchObject(state)
    await writeFile(path, JSON.stringify({ ...state, accessToken: 'SENTINEL_TOKEN' }))
    await expect(readSmokeState(path)).rejects.toThrow('Estado local inválido')
  })

  it('se detiene si falta el archivo o cualquiera de los IDs, sin invocar getters', async () => {
    const path = await statePath()
    await expect(readSmokeState(path)).rejects.toThrow('Estado local ausente')
    const state = { ...createSmokeState(amount), incomingPaymentId, quoteId, status: 'quote-created' as const }
    const getOutgoing = async () => { throw new Error('No debe consultarse') }
    const getIncoming = async () => { throw new Error('No debe consultarse') }
    await expect(inspectStoredPayment(state, getOutgoing, getIncoming)).rejects.toThrow('Faltan IDs')
  })

  it('consulta solo el outgoing si sigue pendiente, y el incoming únicamente al completarse', async () => {
    const state = { ...createSmokeState(amount), incomingPaymentId, quoteId, outgoingPaymentId, status: 'outgoing-created' as const }
    const calls: string[] = []
    const getOutgoing = async (id: string) => {
      calls.push(`outgoing:${id}`)
      return { failed: false, sentAmount: amount, debitAmount: amount }
    }
    const getIncoming = async (id: string) => {
      calls.push(`incoming:${id}`)
      return { receivedAmount: amount }
    }
    expect(await inspectStoredPayment(state, getOutgoing, getIncoming)).toBe('amount-matched')
    expect(calls).toEqual([`outgoing:${outgoingPaymentId}`, `incoming:${incomingPaymentId}`])
    calls.length = 0
    expect(await inspectStoredPayment(state,
      async (id) => { calls.push(`outgoing:${id}`); return { failed: false, sentAmount: { ...amount, value: '0' }, debitAmount: amount } },
      getIncoming)).toBe('outgoing-pending')
    expect(calls).toEqual([`outgoing:${outgoingPaymentId}`])
  })

  it('no reemplaza silenciosamente un estado anterior y rechaza IDs con parámetros', async () => {
    const path = await statePath()
    await assertNoSmokeState(path)
    await saveSmokeState(path, { ...createSmokeState(amount), incomingPaymentId, status: 'incoming-created' })
    await expect(assertNoSmokeState(path)).rejects.toThrow('Ya existe estado local')
    await expect(saveSmokeState(path, {
      ...createSmokeState(amount), incomingPaymentId: `${incomingPaymentId}?access_token=SENTINEL_TOKEN`,
      status: 'incoming-created',
    })).rejects.toThrow('Estado local inválido')
  })

  it('clasifica fallo y diferencia de monto sin emitir respuestas completas', async () => {
    const state = { ...createSmokeState(amount), incomingPaymentId, quoteId, outgoingPaymentId,
      status: 'outgoing-created' as const }
    const full = { failed: false, sentAmount: amount, debitAmount: amount }
    expect(await inspectStoredPayment(state, async () => ({ ...full, failed: true }),
      async () => { throw new Error('No debe consultarse') })).toBe('outgoing-failed')
    expect(await inspectStoredPayment(state, async () => full,
      async () => ({ receivedAmount: { ...amount, value: '99' } }))).toBe('amount-mismatch')
  })
})
