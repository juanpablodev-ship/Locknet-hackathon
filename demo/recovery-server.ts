import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { createAuthenticatedClient, isPendingGrant, isFinalizedGrantWithAccessToken } from '@interledger/open-payments'
import { guardian } from '../packages/guardian/src/index'
import { openAttemptJournal } from '../apps/api/src/payments/journal'
import { recoverExisting } from './recover-existing-payments'
import type { SharedWallet, Spend } from '../contracts'

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export function readAuthorizationExpiresAt(seconds: number | undefined, now = Date.now()) {
  const lifetime = seconds ?? 300
  if (!Number.isFinite(lifetime) || lifetime <= 5) throw new Error('Permiso sin vigencia suficiente')
  return now + (lifetime - 5) * 1000
}

export async function startRecovery() {
  const port = Number(process.env.RECOVERY_PORT ?? '3345')
  const origin = `http://localhost:${port}`
  const path = process.env.RECOVERY_SNAPSHOT_PATH ?? '.env.recovery-state.json'
  const snapshot = JSON.parse(await readFile(path, 'utf8')) as { capturedAt: string; wallets: SharedWallet[]; spends: Spend[] }
  if (!Array.isArray(snapshot.wallets) || !Array.isArray(snapshot.spends)) throw new Error('Historial inválido')
  const client = await createAuthenticatedClient({ walletAddressUrl: process.env.WALLET_ADDRESS!, keyId: process.env.KEY_ID!, privateKey: process.env.PRIVATE_KEY_PATH!, logLevel: 'silent', requestTimeoutMs: 15000 })
  const members = new Map<string, { name: string; walletAddress: string }>()
  for (const spend of snapshot.spends) for (const share of spend.shares) {
    if (!share.attempts?.some(a => a.outgoingId)) continue
    const member = snapshot.wallets.find(w => w.id === spend.walletId)?.members.find(m => m.id === share.memberId)
    if (member) members.set(member.walletAddress, { name: member.name, walletAddress: member.walletAddress })
  }
  const choices = [...members.values()]
  const readTokens = new Map<string, string>()
  const readExpiries = new Map<string, number>()
  const sessions = new Set<string>()
  async function begin(index: number, sid: string) {
    const member = choices[index]
    if (!member) throw new Error('Miembro inválido')
    const wallet = await client.walletAddress.get({ url: member.walletAddress })
    const nonce = randomBytes(32).toString('base64url')
    const state = randomBytes(32).toString('base64url')
    const requestedAt = Date.now()
    // Solo lectura: nunca create, nunca límites de débito ni envío de dinero.
    const grant = await client.grant.request({ url: wallet.authServer }, {
      access_token: { access: [{ type: 'outgoing-payment', identifier: wallet.id, actions: ['read'] }] },
      interact: { start: ['redirect'], finish: { method: 'redirect', uri: `${origin}/finish?state=${state}`, nonce } },
    })
    if (!isPendingGrant(grant) || !grant.interact.finish) throw new Error('Se esperaba consentimiento')
    return { grant, nonce, state, requestedAt, sid, wallet, consumed: false }
  }
  const pending = new Map<string, Awaited<ReturnType<typeof begin>>>()
  let checking = false
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'origin')
    res.setHeader('Content-Security-Policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'")
    if (req.headers.host !== `localhost:${port}`) { res.writeHead(400).end('Host inválido'); return }
    const url = new URL(req.url ?? '/', origin)
    let sid = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('recovery_sid='))?.slice('recovery_sid='.length)
    if (!sid || !sessions.has(sid)) {
      sid = randomBytes(32).toString('hex'); sessions.add(sid)
      res.setHeader('Set-Cookie', `recovery_sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`)
    }
    for (const [wallet, expiresAt] of readExpiries) if (expiresAt <= Date.now()) {
      readTokens.delete(wallet); readExpiries.delete(wallet)
    }
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        res.end(`<h1>Recuperar pagos existentes — solo lectura</h1><p>Este servidor no puede enviar dinero. Cada dueño debe autorizar desde su perfil de navegador.</p><ul>${choices.map((m, i) => `<li>${escape(m.name)}: ${readTokens.has(m.walletAddress) ? 'lectura autorizada' : `<a href="/start?member=${i}">Solicitar permiso de lectura</a>`}</li>`).join('')}</ul><form method="post" action="/check"><button>Consultar intentos existentes y guardar resultados confirmados (sin pagar)</button></form>`)
      } else if (req.method === 'GET' && url.pathname === '/start') {
        if ([...pending.values()].some(s => s.sid === sid && !s.consumed && Date.now() - s.requestedAt < 600000)) throw new Error('Interacción pendiente')
        const session = await begin(Number(url.searchParams.get('member')), sid)
        pending.set(session.state, session)
        res.writeHead(303, { Location: session.grant.interact.redirect }).end()
      } else if (req.method === 'GET' && url.pathname === '/finish') {
        for (const name of ['state', 'hash', 'interact_ref']) if (url.searchParams.getAll(name).length !== 1) throw new Error('Callback inválido')
        const session = pending.get(url.searchParams.get('state')!)
        if (!session || session.sid !== sid || session.consumed || Date.now() - session.requestedAt > 600000) throw new Error('Sesión inválida')
        session.consumed = true
        const hash = guardian.verifyInteractionHash({ clientNonce: session.nonce, interactNonce: session.grant.interact.finish!, interactRef: url.searchParams.get('interact_ref')!, grantUri: session.wallet.authServer, hash: url.searchParams.get('hash')! })
        if (hash.status !== 'pass') throw new Error('Hash inválido')
        const wait = session.requestedAt + (session.grant.continue.wait ?? 0) * 1000 - Date.now()
        if (wait > 600000) throw new Error('Espera inválida')
        if (wait > 0) await delay(wait)
        const grant = await client.grant.continue({ url: session.grant.continue.uri, accessToken: session.grant.continue.access_token.value }, { interact_ref: url.searchParams.get('interact_ref')! })
        if (!isFinalizedGrantWithAccessToken(grant) || grant.access_token.access.length !== 1) throw new Error('Grant inválido')
        const access = grant.access_token.access[0]
        if (access.type !== 'outgoing-payment' || access.identifier !== session.wallet.id || access.actions.length !== 1 || access.actions[0] !== 'read') throw new Error('Alcance distinto')
        const expiresAt = readAuthorizationExpiresAt(grant.access_token.expires_in)
        readTokens.set(session.wallet.id, grant.access_token.value)
        readExpiries.set(session.wallet.id, expiresAt)
        res.writeHead(303, { Location: '/' }).end()
      } else if (req.method === 'POST' && url.pathname === '/check') {
        if (req.headers.origin !== origin || checking) throw new Error('Consulta no disponible')
        checking = true
        try {
          const journal = await openAttemptJournal(process.env.PAYMENT_JOURNAL_PATH ?? '.env.payment-attempts.json')
          const result = await recoverExisting(client, snapshot, journal, true, readTokens)
          await writeFile('.env.recovery-report.json', JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
          await writeFile(path, JSON.stringify(snapshot, null, 2) + '\n', { mode: 0o600 })
          res.end(`<h1>${result.blocked ? 'Aún hay intentos sin confirmar' : 'Todos los intentos consultados tienen resultado terminal'}</h1><p>No se envió ningún pago. EXPIRED describe un cobro vencido, no dinero recibido.</p><pre>${escape(JSON.stringify(result, null, 2))}</pre><a href="/">Volver</a>`)
        } finally { checking = false }
      } else res.writeHead(404).end('No encontrado')
    } catch { res.writeHead(400).end('<h1>No se pudo completar la recuperación</h1><p>No se envió dinero ni se desbloquearon intentos no confirmados. Comprueba que el dueño haya iniciado sesión y vuelve a solicitar una lectura nueva.</p><a href="/">Volver</a>') }
  })
  server.once('error', () => { console.error('Puerto de recuperación no disponible.'); process.exitCode = 1 })
  server.listen(port, '127.0.0.1', () => console.log(`Recuperación SOLO LECTURA en ${origin}. El usuario autoriza y consulta; no se crean pagos ni cobros.`))
}
if (require.main === module) startRecovery().catch(() => { console.error('No se pudo preparar la recuperación; se conserva el historial.'); process.exitCode = 1 })
