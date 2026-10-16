import { createHash, randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedClient, PendingGrant, GrantWithAccessToken } from '@interledger/open-payments'
import { openLifecycleVerification, sanitizeSpentAmounts } from './verify-members-lifecycle'
import { readConfig } from './verify-outgoing-grant'

afterEach(() => vi.restoreAllMocks())
const config = { ...readConfig({ WALLET_ADDRESS: 'https://wallet.example/client', KEY_ID: 'test-id', PRIVATE_KEY_PATH: 'unused.key',
  MEMBER_WALLET_ADDRESS: 'https://wallet.example/member', MEMBER_CAP: '10000', MEMBER_INTERVAL: 'R3/2026-10-16T00:00:00Z/P1M' }), port: 0 }

describe('prueba local del ciclo de miembros (red del SDK simulada)', () => {
  it('rechaza datos no grabables y elimina cualquier metadato ajeno de los montos', () => {
    const payload = { spentDebitAmount: { value: '0', assetCode: 'COP', assetScale: 2, extra: 'not-recorded' }, spentReceiveAmount: null }
    expect(JSON.stringify(sanitizeSpentAmounts(payload))).not.toContain('not-recorded')
    expect(() => sanitizeSpentAmounts({ ...payload, spentDebitAmount: { ...payload.spentDebitAmount, value: 'invalid' } })).toThrow()
  })
  it('recorre unión, cupo y revocación explícita; un navegador sin cookie no puede revocar', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const wallet = { id: config.memberUrl, authServer: 'https://auth.example/tenant', resourceServer: 'https://resource.example', assetCode: 'COP', assetScale: 2 }
    const pending: PendingGrant = { interact: { redirect: 'https://auth.example/consent', finish: randomBytes(16).toString('hex') },
      continue: { uri: 'https://auth.example/continue', access_token: { value: randomBytes(32).toString('hex') } } }
    const request = vi.fn().mockResolvedValue(pending)
    const final: GrantWithAccessToken = { continue: pending.continue, access_token: { value: randomBytes(32).toString('hex'), manage: 'https://auth.example/manage',
      access: [{ type: 'outgoing-payment', identifier: wallet.id, actions: ['read', 'create'], limits: {
        debitAmount: { value: config.cap, assetCode: 'COP', assetScale: 2 }, interval: config.interval } }] } }
    const cancel = vi.fn().mockResolvedValue(undefined)
    const client = { walletAddress: { get: vi.fn().mockResolvedValue(wallet) }, grant: { request, continue: vi.fn().mockResolvedValue(final), cancel },
      outgoingPayment: { getGrantSpentAmounts: vi.fn().mockResolvedValue({ spentDebitAmount: null, spentReceiveAmount: null }) } } as unknown as AuthenticatedClient
    const record = vi.fn().mockResolvedValue(undefined)
    const run = await openLifecycleVerification(config, client, record)
    try {
      const start = await fetch(run.url, { redirect: 'manual' })
      expect(start.headers.get('referrer-policy')).toBe('origin')
      const cookie = start.headers.get('set-cookie')!.split(';')[0]
      const finish = request.mock.calls[0][1].interact.finish
      const url = new URL(finish.uri)
      const ref = randomBytes(16).toString('hex')
      url.searchParams.set('interact_ref', ref)
      url.searchParams.set('hash', createHash('sha256').update([finish.nonce, pending.interact.finish, ref, wallet.authServer].join('\n')).digest('base64'))
      const response = await fetch(url, { headers: { cookie } })
      expect(await response.text()).toContain('Unión confirmada con Open Sentinels')
      expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ joined: true, internalToken: true, available: true, revoked: false }))
      const endpoint = new URL('/revoke-test-grant', run.url)
      const noOrigin = await fetch(endpoint, { method: 'POST', headers: { cookie } })
      expect(noOrigin.status).toBe(400)
      expect(cancel).not.toHaveBeenCalled()
      const nullOrigin = await fetch(endpoint, { method: 'POST', headers: { cookie, origin: 'null' } })
      expect(nullOrigin.status).toBe(400)
      expect(cancel).not.toHaveBeenCalled()
      const revoke = await fetch(endpoint, { method: 'POST', headers: { cookie, origin: endpoint.origin } })
      expect(await revoke.text()).toContain('Revocación confirmada')
      await run.done
      expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ revoked: true }))
      expect(JSON.stringify(record.mock.calls)).not.toContain(final.access_token.value)
    } finally { run.stop() }
  })
})
