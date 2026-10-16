import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import {
  createAuthenticatedClient, isPendingGrant, isFinalizedGrantWithAccessToken,
  type AuthenticatedClient, type Grant, type WalletAddress,
} from '@interledger/open-payments'
import type { Guardian, Money } from '../../../../contracts/index'

// Experimento R1; no implementa MembersService ni sustituye al guardián de R5.
// API: https://openpayments.dev/guides/outgoing-grant-future-payments/
type Client = Pick<AuthenticatedClient, 'walletAddress' | 'grant'>

export function readConfig(env: NodeJS.ProcessEnv) {
  for (const name of ['WALLET_ADDRESS', 'KEY_ID', 'PRIVATE_KEY_PATH', 'MEMBER_WALLET_ADDRESS', 'MEMBER_CAP', 'MEMBER_INTERVAL']) {
    if (!env[name]?.trim()) throw new Error(`Falta configuración local: ${name}`)
  }
  for (const name of ['WALLET_ADDRESS', 'MEMBER_WALLET_ADDRESS']) {
    const url = new URL(env[name]!)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('Wallet inválida: debe ser HTTPS sin credenciales ni parámetros')
    }
  }
  if (!/^[1-9]\d*$/.test(env.MEMBER_CAP!)) throw new Error('MEMBER_CAP debe ser un entero positivo en unidades mínimas')
  // Alcance deliberado: intervalos finitos diarios o mensuales, inicio UTC explícito.
  const interval = /^R([1-9]\d*)\/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\/P1[MD]$/.exec(env.MEMBER_INTERVAL!)
  if (!interval || !Number.isFinite(Date.parse(interval[2])) ||
      new Date(interval[2]).toISOString().replace('.000Z', 'Z') !== interval[2]) {
    throw new Error('MEMBER_INTERVAL debe ser Rn/fecha-UTC/P1M o P1D, con n positivo')
  }
  const port = Number(env.MEMBERS_VERIFY_PORT ?? '3344')
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('MEMBERS_VERIFY_PORT inválido')
  return {
    walletAddressUrl: env.WALLET_ADDRESS!, keyId: env.KEY_ID!, privateKey: env.PRIVATE_KEY_PATH!,
    memberUrl: env.MEMBER_WALLET_ADDRESS!, cap: env.MEMBER_CAP!, interval: env.MEMBER_INTERVAL!, port,
  }
}

export function verifyInteractionHash(p: Parameters<Guardian['verifyInteractionHash']>[0]): boolean {
  // RFC 9635 §4.2.3: LF, ASCII, SHA-256, Base64URL sin relleno.
  const fields = [p.clientNonce, p.interactNonce, p.interactRef, p.grantUri]
  if (fields.some(value => !/^[\x21-\x7e]+$/.test(value)) || !/^[A-Za-z0-9_-]{43}$/.test(p.hash)) return false
  const expected = createHash('sha256').update(fields.join('\n'), 'ascii').digest('base64url')
  return timingSafeEqual(Buffer.from(expected), Buffer.from(p.hash))
}

export async function startVerification(client: Client, config: ReturnType<typeof readConfig>) {
  const wallet = await client.walletAddress.get({ url: config.memberUrl })
  if (!Number.isInteger(wallet.assetScale) || wallet.assetScale < 0 || !wallet.assetCode) {
    throw new Error('La wallet no devolvió una moneda válida')
  }
  const grantUri = wallet.authServer
  if (new URL(grantUri).protocol !== 'https:') throw new Error('Servidor de autorización sin HTTPS')
  const clientNonce = randomBytes(32).toString('base64url')
  const state = randomBytes(32).toString('base64url')
  const debitAmount: Money = { value: config.cap, assetCode: wallet.assetCode, assetScale: wallet.assetScale }
  const grant = await client.grant.request({ url: grantUri }, {
    access_token: { access: [{
      identifier: wallet.id, type: 'outgoing-payment', actions: ['read', 'create'],
      limits: { debitAmount, interval: config.interval },
    }] },
    interact: { start: ['redirect'], finish: {
      method: 'redirect', uri: `http://localhost:${config.port}/finish?state=${state}`, nonce: clientNonce,
    } },
  })
  if (!isPendingGrant(grant) || !grant.interact.finish || !grant.continue.access_token.value ||
      new URL(grant.interact.redirect).protocol !== 'https:' || new URL(grant.continue.uri).protocol !== 'https:') {
    throw new Error('Se esperaba una concesión interactiva segura')
  }
  return { grant, grantUri, wallet, debitAmount, interval: config.interval, clientNonce, state,
    requestedAt: Date.now(), consumed: false }
}

export function confirmLimits(grant: Grant, wallet: WalletAddress, debit: Money, interval: string): boolean {
  if (!isFinalizedGrantWithAccessToken(grant) || !grant.access_token.value || grant.access_token.access.length !== 1) return false
  const access = grant.access_token.access[0]
  if (access.type !== 'outgoing-payment') return false
  const limits = access.limits
  return access.identifier === wallet.id && access.actions.length === 2 &&
    access.actions.includes('read') && access.actions.includes('create') &&
    !!limits && !('receiver' in limits) && limits.interval === interval &&
    'debitAmount' in limits && limits.debitAmount.value === debit.value &&
    limits.debitAmount.assetCode === debit.assetCode && limits.debitAmount.assetScale === debit.assetScale
}

export async function finishVerification(client: Client, session: Awaited<ReturnType<typeof startVerification>>, url: URL) {
  if (session.consumed || Date.now() - session.requestedAt > 600_000 || url.pathname !== '/finish' ||
      ['state', 'hash', 'interact_ref'].some(name => url.searchParams.getAll(name).length !== 1) ||
      url.searchParams.get('state') !== session.state || !verifyInteractionHash({
        clientNonce: session.clientNonce, interactNonce: session.grant.interact.finish,
        interactRef: url.searchParams.get('interact_ref')!, grantUri: session.grantUri,
        hash: url.searchParams.get('hash')!,
      })) throw new Error('Retorno inválido, vencido o ya utilizado')
  // Consumir antes del await impide continuaciones concurrentes/repetidas.
  session.consumed = true
  const wait = session.grant.continue.wait ?? 0
  const remaining = session.requestedAt + wait * 1000 - Date.now()
  if (!Number.isFinite(remaining) || remaining > 600_000) throw new Error('Espera de continuación fuera del experimento')
  if (remaining > 0) await delay(remaining)
  const grant = await client.grant.continue({
    url: session.grant.continue.uri, accessToken: session.grant.continue.access_token.value,
  }, { interact_ref: url.searchParams.get('interact_ref')! })
  if (!isFinalizedGrantWithAccessToken(grant) || !confirmLimits(grant, session.wallet, session.debitAmount, session.interval)) {
    throw new Error('La concesión no confirmó exactamente el permiso solicitado')
  }
  // El token se descarta al salir: no se imprime, persiste ni devuelve al navegador.
  return 'Permiso confirmado: sin destinatario, con cupo autorizado e intervalo; hash válido.'
}

export async function runVerification(config: ReturnType<typeof readConfig>) {
  const client = await createAuthenticatedClient({
    walletAddressUrl: config.walletAddressUrl, keyId: config.keyId, privateKey: config.privateKey,
    logLevel: 'silent', requestTimeoutMs: 15_000,
  })
  let session: Awaited<ReturnType<typeof startVerification>> | undefined
  let busy = false
  await new Promise<void>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Referrer-Policy', 'no-referrer')
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      let url: URL
      try { url = new URL(req.url ?? '/', `http://localhost:${config.port}`) }
      catch { res.writeHead(400).end('Solicitud inválida'); return }
      if (req.headers.host !== `localhost:${config.port}` || req.method !== 'GET') {
        res.writeHead(400).end('Solicitud inválida'); return
      }
      if (busy) { res.writeHead(409).end('Verificación en curso'); return }
      if (url.pathname !== '/start' && url.pathname !== '/finish') { res.writeHead(404).end(); return }
      busy = true
      try {
        if (url.pathname === '/start') {
          if (session) throw new Error('Interacción ya iniciada')
          session = await startVerification(client, config)
          res.writeHead(303, { Location: session.grant.interact.redirect }).end()
        } else {
          if (!session) throw new Error('No hay interacción pendiente')
          const result = await finishVerification(client, session, url)
          res.end(result)
          console.log(result)
          clearTimeout(timeout)
          server.close(() => resolve())
        }
      } catch {
        // Los errores del SDK pueden contener credenciales o respuestas completas.
        res.writeHead(400).end('No se pudo confirmar el permiso. Reinicia la verificación.')
        clearTimeout(timeout)
        server.close(() => reject(new Error('Verificación fallida; detalles sensibles omitidos')))
      } finally { busy = false }
    })
    const timeout = setTimeout(() => {
      server.closeAllConnections()
      server.close()
      reject(new Error('Tiempo de autorización agotado'))
    }, 600_000)
    server.once('error', () => { clearTimeout(timeout); reject(new Error('No se pudo abrir el puerto local')) })
    server.listen(config.port, '127.0.0.1', () => {
      console.log(`Abre http://localhost:${config.port}/start para autorizar en la Test Wallet.`)
    })
  })
}

if (require.main === module) {
  Promise.resolve().then(() => runVerification(readConfig(process.env))).catch(() => {
    console.error('Verificación no completada. Revisa configuración local, llave, puerto y consentimiento; no se muestran detalles sensibles.')
    process.exitCode = 1
  })
}
