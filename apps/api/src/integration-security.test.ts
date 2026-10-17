import { createHash, randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedClient } from '@interledger/open-payments'
import { createApp, createEventBus } from './server'
import { createEngine } from './wallet/engine'
import { createMembersJoinService } from './members/members.service'
import { createMemberOperations, createMembersStore } from './members/member-operations'
import { guardian } from '../../../packages/guardian/src/index.js'
import { createPaymentsMock } from '../../../mocks/payments.mock'
import { cuidadoDeMama } from '../../../contracts/ejemplo'

const closers: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of closers.splice(0)) await close() })

async function setup() {
  const store = createMembersStore(); const bus = createEventBus()
  const engine = createEngine({ guardian, payments: createPaymentsMock(), emit: bus.emit })
  for (const id of ['a', 'b']) engine.addWallet({ ...structuredClone(cuidadoDeMama), id, members: [] })
  const requests: any[] = [] // solo respuestas sinteticas del SDK; guardian no se simula
  const wallet = { id: 'https://wallet.example/member', authServer: 'https://auth.example/tenant', resourceServer: 'https://resource.example', assetCode: 'COP', assetScale: 2 }
  const request = vi.fn(async (_args, body) => {
    const pending = { interact: { redirect: 'https://auth.example/approve', finish: randomBytes(16).toString('hex') }, continue: { uri: 'https://auth.example/continue', access_token: { value: randomBytes(24).toString('hex') } } }
    requests.push({ body, pending }); return pending
  })
  const continuation = vi.fn(async () => ({ continue: requests.at(-1).pending.continue,
    access_token: { value: randomBytes(24).toString('hex'), manage: 'https://auth.example/manage', access: requests.at(-1).body.access_token.access } }))
  const client = { walletAddress: { get: vi.fn().mockResolvedValue(wallet) }, grant: { request, continue: continuation, cancel: vi.fn() },
    outgoingPayment: { getGrantSpentAmounts: vi.fn().mockResolvedValue({ spentDebitAmount: null, spentReceiveAmount: null }) } } as unknown as AuthenticatedClient
  const origin = 'http://localhost:5173'
  const ops = createMemberOperations(client, store)
  const server = createApp({ engine, bus, security: true, available: ops.available, revoke: ops.revoke,
    join: { webUrl: origin, createService: (sessionId, currentSessionId) => createMembersJoinService(client, {
      finishUri: 'http://localhost:5173/api/join/finish', policy: { maxCap: cuidadoDeMama.members[0].cap }, sessionId, currentSessionId, store }) } }).listen(0, '127.0.0.1')
  await new Promise(r => server.once('listening', r)); const address = server.address() as { port: number }
  const base = `http://127.0.0.1:${address.port}`
  closers.push(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())) })
  const post = (path: string, body: unknown = {}, cookie?: string, customOrigin = origin) => fetch(base + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: customOrigin, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) })
  const member = { name: 'Audit', walletAddress: wallet.id, cap: cuidadoDeMama.members[0].cap, interval: cuidadoDeMama.members[0].interval }
  async function finish(cookie: string, altered = false) {
    const entry = requests.at(-1); const f = entry.body.interact.finish
    const params = new URL(f.uri).searchParams; const ref = randomBytes(16).toString('hex')
    params.set('interact_ref', ref)
    params.set('hash', createHash('sha256').update([f.nonce, entry.pending.interact.finish, ref, wallet.authServer].join('\n')).digest('base64'))
    if (altered) params.set('hash', 'invalid')
    return fetch(base + '/api/join/finish?' + params, { headers: { cookie }, redirect: 'manual' })
  }
  return { base, post, finish, member, engine, requests, continuation }
}

describe('integracion HTTP con miembros y Open Sentinels reales; SDK sin red', () => {
  it('solo una union con hash valido vincula identidad; nadie puede votar por otro miembro', async () => {
    const f = await setup()
    const start = await f.post('/api/wallets/a/join', f.member); const cookie = start.headers.get('set-cookie')!.split(';')[0]
    expect((await f.finish(cookie)).headers.get('location')).toContain('union=ok')
    expect(f.continuation).toHaveBeenCalledOnce()
    const id = f.engine.getWallet('a').members[0].id
    expect(await (await fetch(f.base + '/api/session', { headers: { cookie } })).json()).toEqual({ memberIds: [id] })
    const spend = f.engine.requestSpend('a', f.engine.getWallet('a').knownDestinations[0], { value: '30000000', assetCode: 'COP', assetScale: 2 })
    expect((await f.post(`/api/spends/${spend.id}/approvals`, { memberId: id, yes: true })).status).toBe(409)
    expect((await f.post(`/api/spends/${spend.id}/approvals`, { memberId: 'other', yes: true }, cookie)).status).toBe(409)
    expect((await f.post(`/api/spends/${spend.id}/approvals`, { memberId: id, yes: true }, cookie, 'https://other.example')).status).toBe(403)
    expect((await f.post(`/api/spends/${spend.id}/approvals`, { memberId: id, yes: true }, cookie)).status).toBe(200)
    expect((await f.post('/api/wallets/a/members/' + id + '/revoke', {}, cookie)).status).toBe(200)
    expect((await f.post('/api/wallets/a/members/' + id + '/revoke', {}, cookie)).status).toBe(409)
  })
  it('una segunda solicitud no cambia el grupo pendiente; hash alterado no continua ni autentica', async () => {
    const f = await setup(); const a = await f.post('/api/wallets/a/join', f.member); const cookie = a.headers.get('set-cookie')!.split(';')[0]
    expect((await f.post('/api/wallets/b/join', f.member, cookie)).status).toBe(409)
    expect((await f.finish(cookie)).headers.get('location')).toContain('union=ok')
    expect(f.engine.getWallet('a').members).toHaveLength(1); expect(f.engine.getWallet('b').members).toHaveLength(0)
    const g = await setup(); const b = await g.post('/api/wallets/a/join', g.member); const otherCookie = b.headers.get('set-cookie')!.split(';')[0]
    expect((await g.finish(otherCookie, true)).headers.get('location')).toContain('union=error')
    expect(g.continuation).not.toHaveBeenCalled(); expect(g.engine.getWallet('a').members).toHaveLength(0)
    expect(await (await fetch(g.base + '/api/session', { headers: { cookie: otherCookie } })).json()).toEqual({ memberIds: [] })
  })
})
