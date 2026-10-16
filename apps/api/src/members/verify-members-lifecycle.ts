import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createAuthenticatedClient, type AuthenticatedClient, type OutgoingPaymentGrantSpentAmounts } from '@interledger/open-payments'
import { createMembersJoinService } from './members.service'
import { createMembersStore } from './member-operations'
import { readConfig } from './verify-outgoing-grant'

export function sanitizeSpentAmounts(value: OutgoingPaymentGrantSpentAmounts) {
  const result: OutgoingPaymentGrantSpentAmounts = { spentDebitAmount: null, spentReceiveAmount: null }
  for (const key of ['spentDebitAmount', 'spentReceiveAmount'] as const) {
    const amount = value[key]
    if (amount === null) continue
    if (!amount || !/^\d+$/.test(amount.value) || !/^[A-Z]{3}$/.test(amount.assetCode) ||
        !Number.isInteger(amount.assetScale) || amount.assetScale < 0 || amount.assetScale > 255) throw new Error('Monto no grabable')
    result[key] = { value: amount.value, assetCode: amount.assetCode, assetScale: amount.assetScale }
  }
  return result
}

/** Harness local de R1. R3 sigue siendo dueño de las rutas de la aplicación. */
export async function openLifecycleVerification(config: ReturnType<typeof readConfig>, client: AuthenticatedClient,
  record: (value: { joined: boolean; internalToken: boolean; available: boolean; revoked: boolean;
    spent: ReturnType<typeof sanitizeSpentAmounts> | null }) => Promise<void>) {
  const context = new AsyncLocalStorage<string | undefined>()
  const sessionId = randomBytes(32).toString('hex')
  const store = createMembersStore()
  let service: ReturnType<typeof createMembersJoinService> | undefined
  let memberId: string | undefined
  const evidence = { joined: false, internalToken: false, available: false, revoked: false, spent: null as ReturnType<typeof sanitizeSpentAmounts> | null }
  let stage = 'inicio'
  let busy = false
  let complete!: () => void
  let fail!: (error: Error) => void
  const done = new Promise<void>((yes, no) => { complete = yes; fail = no })
  // Capturar SOLO el payload saneado de una consulta real. No registrar argumentos ni tokens.
  const getSpent = client.outgoingPayment.getGrantSpentAmounts.bind(client.outgoingPayment)
  const wrapped = { ...client, outgoingPayment: { ...client.outgoingPayment, getGrantSpentAmounts: async (args: Parameters<typeof getSpent>[0]) => {
    const result = await getSpent(args); evidence.spent = sanitizeSpentAmounts(result); return result
  } } }
  const server = createServer((req, res) => {
    const cookie = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('r1_session='))?.slice('r1_session='.length)
    context.run(cookie === sessionId ? sessionId : undefined, async () => {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'origin'); res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Content-Security-Policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'")
      try {
        const address = server.address()
        if (!address || typeof address === 'string') throw new Error('Servidor cerrado')
        const origin = `http://localhost:${address.port}`
        if (req.headers.host !== `localhost:${address.port}`) { res.writeHead(400).end('Host inválido'); return }
        const url = new URL(req.url ?? '/', origin)
        if (busy) { res.writeHead(409).end('Operación en curso'); return }
        if (!['/start', '/finish', '/revoke-test-grant', '/done'].includes(url.pathname)) { res.writeHead(404).end(); return }
        const post = url.pathname === '/revoke-test-grant' || url.pathname === '/done'
        if (req.method !== (post ? 'POST' : 'GET') || (post && req.headers.origin !== origin)) { res.writeHead(400).end('Solicitud inválida'); return }
        busy = true
        if (url.pathname === '/start') {
          if (service) throw new Error('Interacción existente')
          context.enterWith(sessionId)
          const wallet = await client.walletAddress.get({ url: config.memberUrl })
          service = createMembersJoinService(wrapped, { finishUri: `${origin}/finish`, store,
            policy: { maxCap: { value: config.cap, assetCode: wallet.assetCode, assetScale: wallet.assetScale } },
            sessionId, currentSessionId: () => context.getStore() })
          const start = await service.startJoin('r1-real-verification', { name: 'Miembro de prueba R1', walletAddress: config.memberUrl,
            assetCode: wallet.assetCode, cap: { value: config.cap, assetCode: wallet.assetCode, assetScale: wallet.assetScale }, interval: config.interval })
          res.setHeader('Set-Cookie', `r1_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`)
          res.writeHead(303, { Location: start.redirectUrl }).end()
        } else {
          if (!service || context.getStore() !== sessionId) throw new Error('Sesión inválida')
          if (url.pathname === '/finish') {
            if (['state', 'hash', 'interact_ref'].some(key => url.searchParams.getAll(key).length !== 1)) throw new Error('Retorno inválido')
            stage = 'finishJoin'
            const joined = await service.finishJoin({ state: url.searchParams.get('state')!, hash: url.searchParams.get('hash')!, interactRef: url.searchParams.get('interact_ref')! })
            memberId = joined.member.id; evidence.joined = true
            stage = 'tokenFor'; evidence.internalToken = (await service.tokenFor(memberId)).length > 0
            stage = 'available'; await service.available(memberId); evidence.available = true
            await record(structuredClone(evidence))
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end('<p>Unión confirmada con Open Sentinels. Cupo consultado al proveedor. El token permanece en el servidor.</p><form method="post" action="/revoke-test-grant"><button>Revocar únicamente el permiso creado por esta prueba</button></form><form method="post" action="/done"><button>Finalizar sin revocar</button></form>')
            console.log('finishJoin, hash de Open Sentinels, token interno y consulta de cupo confirmados. La cancelación requiere el botón explícito del navegador.')
          } else if (url.pathname === '/revoke-test-grant') {
            if (!memberId || !evidence.joined) throw new Error('No hay permiso de prueba')
            stage = 'revoke'; await service.revoke(memberId)
            try { await service.tokenFor(memberId) } catch { evidence.revoked = true }
            if (!evidence.revoked) throw new Error('El token sigue utilizable')
            await record(structuredClone(evidence))
            res.end('Revocación confirmada. El permiso de esta prueba ya no se entrega por tokenFor.')
            console.log('grant.cancel confirmado y tokenFor bloqueado. No se realizó un pago ni se probó la renovación mensual.')
            stop()
          } else {
            res.end('Prueba terminada; el permiso externo permanece vigente.'); stop()
          }
        }
      } catch {
        res.writeHead(400).end(`Verificación fallida en ${stage}; datos sensibles omitidos.`)
        console.error(`Verificación real no completada [${stage}].`)
        clearTimeout(timer); server.close(); fail(new Error('Verificación real no completada'))
      } finally { busy = false }
    })
  })
  function stop() { clearTimeout(timer); server.close(); server.closeIdleConnections(); complete() }
  const timer = setTimeout(() => { server.closeAllConnections(); server.close(); fail(new Error('Tiempo de prueba agotado')) }, 600_000)
  await new Promise<void>((yes, no) => { server.once('error', no); server.listen(config.port, '127.0.0.1', yes) }).catch(() => { clearTimeout(timer); throw new Error('Puerto local no disponible') })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Servidor no disponible')
  return { url: `http://localhost:${address.port}/start`, done, stop }
}

if (require.main === module) (async () => {
  const config = readConfig(process.env)
  const client = await createAuthenticatedClient({ walletAddressUrl: config.walletAddressUrl, keyId: config.keyId,
    privateKey: config.privateKey, logLevel: 'silent', requestTimeoutMs: 15_000 })
  const verification = await openLifecycleVerification(config, client, async evidence => {
    const directory = resolve(__dirname, '../../../../fixtures')
    await mkdir(directory, { recursive: true })
    await writeFile(resolve(directory, 'members.real.sanitized.json'), JSON.stringify({ source: 'test-wallet-recording',
      observedAt: new Date().toISOString(), operations: { finishJoin: evidence.joined, tokenFor: evidence.internalToken,
        available: evidence.available, revoke: evidence.revoked }, spentAmounts: evidence.spent,
      limitations: 'Sin pago, sin renovación mensual observada. Reproducción offline no es una consulta actual.' }, null, 2) + '\n')
  })
  console.log(`Abre ${verification.url}. Autoriza tú en la Test Wallet; no se muestran secretos.`)
  await verification.done
})().catch(() => { console.error('La prueba de miembros no terminó correctamente; detalles sensibles omitidos.'); process.exitCode = 1 })
