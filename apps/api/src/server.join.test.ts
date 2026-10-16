import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Member, MembersService, WalletEvent } from '../../../contracts'
import { cuidadoDeMama } from '../../../contracts/ejemplo'
import { createApp, createEventBus } from './server'
import { createEngine } from './wallet/engine'
import { cop, fakeGuardian, fakePayments } from './wallet/test-fakes'

// MembersService falso con las mismas reglas de sesión que exige el de R1:
// sessionId fijo por instancia y currentSessionId() leído en cada llamada.
function fakeMembers(sessionId: string, currentSessionId: () => string | undefined, log: string[]): MembersService {
  const pending = new Map<string, Omit<Member, 'id' | 'status'>>()
  let n = 0
  const check = () => { if (currentSessionId() !== sessionId) throw new Error('Sesión de unión inválida') }
  const notUsed = async (): Promise<never> => { throw new Error('no usado') }
  return {
    async startJoin(walletId, member) {
      check()
      const state = `state-${sessionId.slice(0, 6)}-${++n}`
      pending.set(state, member)
      log.push(`start:${walletId}:${member.name}`)
      return { redirectUrl: `https://wallet.example/consent?s=${state}`,
               grantWarning: { check: 'grant', status: 'pass', riskPoints: 0, userMessage: 'Permiso normal.', reasons: [] } }
    },
    async finishJoin({ interactRef, hash, state }) {
      check()
      const m = pending.get(state)
      pending.delete(state)
      if (!m || hash !== 'hash-bueno' || !interactRef) throw new Error('No se pudo confirmar la unión')
      log.push(`finish:${m.name}`)
      return { member: { ...m, id: `m-${m.name}`, status: 'active' },
               hashVerdict: { check: 'consent-hash', status: 'pass', riskPoints: 0, userMessage: 'ok', reasons: [] } }
    },
    available: notUsed, revoke: notUsed, tokenFor: notUsed, startWalletConfirm: notUsed, finishWalletConfirm: notUsed,
  }
}

let server: Server
let base: string
let events: WalletEvent[]
let log: string[]
const WEB = 'http://localhost:5173'

beforeEach(async () => {
  events = []
  log = []
  const bus = createEventBus()
  bus.subscribe((e) => events.push(e))
  const engine = createEngine({ guardian: fakeGuardian, payments: fakePayments().svc, emit: bus.emit })
  engine.addWallet({ ...structuredClone(cuidadoDeMama), members: [], authorizedCapacity: cop(0) })
  const join = { webUrl: WEB, createService: (sid: string, current: () => string | undefined) => fakeMembers(sid, current, log) }
  server = createApp({ engine, bus, join }).listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
})

const hermano = (name: string) => ({
  name, walletAddress: `https://ilp.interledger-test.dev/${name}`, cap: cop(100_000), interval: 'R12/2026-10-16T00:00:00Z/P1M',
})

async function start(name: string, cookie?: string) {
  const res = await fetch(`${base}/api/wallets/w-mama/join`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(hermano(name)),
  })
  const setCookie = res.headers.get('set-cookie')
  const body = await res.json()
  const state = new URL(body.redirectUrl ?? 'https://x/?s=').searchParams.get('s')
  return { res, body, state, cookie: cookie ?? setCookie?.split(';')[0] }
}

const finish = (query: string, cookie?: string) =>
  fetch(`${base}/api/join/finish?${query}`, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} })

describe('POST /api/wallets/:id/join', () => {
  it('emite la cookie de sesión y devuelve redirectUrl + aviso del guardián', async () => {
    const { res, body, cookie } = await start('bogota')
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toMatch(/^sid=[\w-]{43}; HttpOnly; SameSite=Lax; Path=\//)
    expect(cookie).toMatch(/^sid=/)
    expect(body).toMatchObject({ redirectUrl: expect.stringMatching(/^https:\/\/wallet\.example/), grantWarning: { check: 'grant' } })
    expect(log).toEqual(['start:w-mama:bogota'])
  })

  it('cuerpo mal formado → 400; billetera inexistente → 404', async () => {
    const bad = await fetch(`${base}/api/wallets/w-mama/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(bad.status).toBe(400)
    const missing = await fetch(`${base}/api/wallets/no-existe/join`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(hermano('x')) })
    expect(missing.status).toBe(404)
  })
})

describe('GET /api/join/finish', () => {
  it('callback válido → miembro en la billetera, member-active y redirección union=ok', async () => {
    const { state, cookie } = await start('bogota')
    const res = await finish(`interact_ref=ref&hash=hash-bueno&state=${state}`, cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(`${WEB}#/inicio?union=ok`)
    const wallet = await (await fetch(`${base}/api/wallets/w-mama`)).json()
    expect(wallet.members.map((m: Member) => m.name)).toEqual(['bogota'])
    expect(wallet.authorizedCapacity).toEqual(cop(100_000))
    expect(events.map((e) => e.type)).toEqual(['member-active', 'capacity-updated'])
  })

  it('hash inválido → union=error y nadie se une', async () => {
    const { state, cookie } = await start('bogota')
    const res = await finish(`interact_ref=ref&hash=hash-falso&state=${state}`, cookie)
    expect(res.headers.get('location')).toBe(`${WEB}#/inicio?union=error`)
    expect((await (await fetch(`${base}/api/wallets/w-mama`)).json()).members).toEqual([])
  })

  it('sin cookie de sesión → union=error sin llamar a finishJoin', async () => {
    const { state } = await start('bogota')
    const res = await finish(`interact_ref=ref&hash=hash-bueno&state=${state}`)
    expect(res.headers.get('location')).toBe(`${WEB}#/inicio?union=error`)
    expect(log).toEqual(['start:w-mama:bogota'])
  })

  it('cookie inventada (no emitida por el servidor) → union=error', async () => {
    const { state } = await start('bogota')
    const res = await finish(`interact_ref=ref&hash=hash-bueno&state=${state}`, 'sid=inventada')
    expect(res.headers.get('location')).toBe(`${WEB}#/inicio?union=error`)
  })

  it('el state de otra sesión no sirve: cada navegador solo termina su propia unión', async () => {
    const a = await start('bogota')
    const b = await start('medellin')
    const cruzado = await finish(`interact_ref=ref&hash=hash-bueno&state=${a.state}`, b.cookie)
    expect(cruzado.headers.get('location')).toBe(`${WEB}#/inicio?union=error`)
    const propio = await finish(`interact_ref=ref&hash=hash-bueno&state=${b.state}`, b.cookie)
    expect(propio.headers.get('location')).toBe(`${WEB}#/inicio?union=ok`)
  })

  it('parámetros duplicados o faltantes → union=error sin llamar a finishJoin', async () => {
    const { state, cookie } = await start('bogota')
    const dup = await finish(`interact_ref=ref&hash=hash-bueno&hash=otro&state=${state}`, cookie)
    expect(dup.headers.get('location')).toBe(`${WEB}#/inicio?union=error`)
    const falta = await finish(`interact_ref=ref&state=${state}`, cookie)
    expect(falta.headers.get('location')).toBe(`${WEB}#/inicio?union=error`)
    expect(log).toEqual(['start:w-mama:bogota'])
  })

  it('el miembro rechazó en su wallet → union=rechazada', async () => {
    const { cookie } = await start('bogota')
    const res = await finish('result=grant_rejected', cookie)
    expect(res.headers.get('location')).toBe(`${WEB}#/inicio?union=rechazada`)
  })
})
