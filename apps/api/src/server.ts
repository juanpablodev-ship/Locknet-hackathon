// API REST + SSE sobre el motor de la billetera (R3). R4 escucha los WalletEvent por SSE.
// createApp no arranca nada: el arranque real está en main.ts.
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes } from 'node:crypto'
import express, { type NextFunction, type Request, type Response } from 'express'
import type { Member, MembersService, Money, SharedWallet, WalletEvent } from '../../../contracts'
import type { Engine } from './wallet/engine'

// ---------- Unirse: una instancia de MembersService (R1) por sesión del navegador ----------
export interface JoinDeps {
  // R1 exige: sessionId fijo por instancia y currentSessionId leído del contexto de cada petición.
  createService(sessionId: string, currentSessionId: () => string | undefined, assetCode: string): MembersService
  metadata?: (walletAddress: string) => Promise<{ assetCode: string; assetScale: number }>
  webUrl: string   // a dónde vuelve el navegador después del callback
}

// ---------- Modo de demo y reinicio (R1: demo/reset.ts y demo/members-backup.ts) ----------
export interface DemoDeps {
  mode: 'live' | 'fixtures'
  label?: string          // R4 la muestra COMPLETA cuando existe ("Modo respaldo — …")
  recordedAt?: string
  seeds(): SharedWallet[] // billeteras con las que arranca de nuevo
  resetStore(): void      // invalida interacciones locales; no revoca permisos externos
}

const SESSION_COOKIE = 'sid'

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return undefined
}

// Los tres parámetros del callback deben venir exactamente una vez (R1: rechazar duplicados).
function singleParams(req: Request, names: string[]): Record<string, string> | undefined {
  const params = new URL(req.originalUrl, 'http://localhost').searchParams
  const out: Record<string, string> = {}
  for (const n of names) {
    const all = params.getAll(n)
    if (all.length !== 1 || !all[0]) return undefined
    out[n] = all[0]
  }
  return out
}

// ---------- Bus de eventos: el motor emite, cada cliente SSE se suscribe ----------
export function createEventBus() {
  const listeners = new Set<(e: WalletEvent) => void>()
  return {
    emit(e: WalletEvent): void {
      listeners.forEach((l) => l(e))
    },
    subscribe(l: (e: WalletEvent) => void): () => void {
      listeners.add(l)
      return () => { listeners.delete(l) }
    },
  }
}
export type EventBus = ReturnType<typeof createEventBus>

// ---------- Validación mínima de entrada ----------
class BadRequest extends Error {}

function isMoney(x: unknown): x is Money {
  const m = x as Money
  return !!m && typeof m.value === 'string' && /^\d+$/.test(m.value)
    && typeof m.assetCode === 'string' && Number.isInteger(m.assetScale)
}

function statusFor(err: unknown): number {
  if (err instanceof BadRequest) return 400
  const msg = err instanceof Error ? err.message : ''
  if (/no encontrad/i.test(msg)) return 404
  return 409   // transición inválida, voto doble, no es miembro, etc.
}

type Handler = (req: Request, res: Response) => unknown
const wrap = (h: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve().then(() => h(req, res)).catch(next)
}

export function createApp(deps: {
  engine: Engine; bus: EventBus; heartbeatMs?: number; join?: JoinDeps; demo?: DemoDeps
  security?: boolean
  setup?: unknown
  revoke?: (memberId: string) => Promise<void>
  available?: (memberId: string) => Promise<Money>   // MembersService.available() de R1 (cupo real)
}) {
  const { engine, bus } = deps
  const secure = deps.security ?? deps.demo?.mode !== 'fixtures'
  const expectedOrigin = deps.join ? new URL(deps.join.webUrl).origin : undefined
  // Refresca el cupo en segundo plano; un fallo nunca rompe la respuesta al usuario.
  const refreshLater = (walletId: string) => {
    if (deps.available) engine.refreshCapacity(walletId, deps.available).catch(() => {})
  }
  const heartbeatMs = deps.heartbeatMs ?? 15_000
  const app = express()
  app.use(express.json())

  // Sesión del navegador: cookie sid emitida SOLO por este servidor; el contexto de cada
  // petición vive en AsyncLocalStorage (nunca en una variable global compartida).
  const requestContext = new AsyncLocalStorage<{ sid?: string }>()
  const sessions = new Map<string, { service: MembersService; walletId: string; assetCode: string; pending: boolean; finishing?: boolean; expiresAt: number; members: Set<string> }>()
  const issued = new Map<string, number>()
  const currentSessionId = () => {
    const sid = requestContext.getStore()?.sid
    return sid && (issued.get(sid) ?? 0) > Date.now() ? sid : undefined
  }
  app.use((req, _res, next) => {
    const sid = readCookie(req, SESSION_COOKIE)
    requestContext.run({ sid: sid && (issued.get(sid) ?? 0) > Date.now() ? sid : undefined }, next)
  })
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer')
    if (req.method === 'OPTIONS') { res.sendStatus(403); return }
    if (secure && req.method !== 'GET' && req.headers.origin !== expectedOrigin) { res.status(403).json({ error: 'Origen no permitido. Usa la web configurada y su proxy.' }); return }
    next()
  })
  const identity = (walletId: string, claimed?: string): string => {
    const sid = currentSessionId(); const owned = sid ? sessions.get(sid)?.members : undefined
    const active = engine.getWallet(walletId).members.filter(m => m.status === 'active' && owned?.has(m.id))
    const chosen = claimed ? active.find(m => m.id === claimed) : active[0]
    if (!chosen) throw new Error('Debes autorizar tu propia wallet en este navegador para esta accion.')
    return chosen.id
  }
  app.get('/api/setup', (_req, res) => res.json(deps.setup ?? {}))
  app.get('/api/session', (_req, res) => {
    if (!secure) { res.json({ memberIds: engine.listWallets().flatMap(w => w.members.filter(m => m.status === 'active').map(m => m.id)), simulated: true }); return }
    const sid = currentSessionId(); res.json({ memberIds: sid ? [...(sessions.get(sid)?.members ?? [])] : [] })
  })

  app.get('/api/wallets', wrap((_req, res) => res.json(engine.listWallets())))

  app.get('/api/wallets/:id', wrap((req, res) => res.json(engine.getWallet(req.params.id))))

  app.get('/api/spends/:id', wrap((req, res) => res.json(engine.getSpend(req.params.id))))

  app.get('/api/wallets/:id/spends', wrap((req, res) => {
    engine.getWallet(req.params.id)
    res.json(engine.listSpends(req.params.id))
  }))

  app.post('/api/wallets/:id/spends', wrap((req, res) => {
    const { destination, amount } = req.body ?? {}
    if (typeof destination?.name !== 'string' || typeof destination?.walletAddress !== 'string') {
      throw new BadRequest('Falta destination { name, walletAddress }')
    }
    if (!isMoney(amount)) throw new BadRequest('amount debe ser Money { value, assetCode, assetScale }')
    if (secure) identity(req.params.id)
    res.status(201).json(engine.requestSpend(req.params.id, destination, amount))
  }))

  app.post('/api/spends/:id/approvals', wrap((req, res) => {
    const { memberId, yes } = req.body ?? {}
    if (typeof memberId !== 'string' || typeof yes !== 'boolean') throw new BadRequest('Falta { memberId, yes }')
    const spend = engine.getSpend(req.params.id)
    if (secure) identity(spend.walletId, memberId)
    res.json(engine.castApproval(req.params.id, memberId, yes))
  }))

  // Pagar y reintentar responden 202 de inmediato; el avance ("2 de 3") llega por SSE.
  const background = (expected: string, run: (id: string) => Promise<unknown>): Handler => (req, res) => {
    const spend = engine.getSpend(req.params.id)
    if (secure) identity(spend.walletId)
    if (spend.status !== expected) {
      throw new Error(`El gasto debe estar en ${expected} (estado: ${spend.status})`)
    }
    run(spend.id)
      .catch(() => { /* no registrar errores del proveedor */ })
      .finally(() => refreshLater(spend.walletId))
    res.status(202).json({ spendId: spend.id, status: 'paying' })
  }
  app.post('/api/spends/:id/execute', wrap(background('approved', (id) => engine.executeSpend(id))))
  app.post('/api/spends/:id/retry', wrap(background('incomplete', (id) => engine.retryShare(id))))

  app.post('/api/spends/:id/recheck', wrap(background('incomplete', (id) => engine.recheckSpend(id))))

  app.post('/api/wallets/:id/members/:memberId/revoke', wrap(async (req, res) => {
    if (secure) identity(req.params.id, req.params.memberId)
    if (!deps.revoke) throw new Error('Revocacion no disponible')
    await deps.revoke(req.params.memberId); engine.revokeMember(req.params.id, req.params.memberId)
    res.json({ revoked: true })
  }))

  app.post('/api/wallets/:id/capacity/refresh', wrap(async (req, res) => {
    if (!deps.available) throw new Error('Consulta de cupo no encontrada en este servidor')
    res.json(await engine.refreshCapacity(req.params.id, deps.available))
  }))

  // ---------- Modo y reinicio de demo ----------
  app.get('/api/mode', (_req, res) => {
    const d = deps.demo
    res.json(d ? { mode: d.mode, label: d.label, recordedAt: d.recordedAt } : { mode: 'live' })
  })

  app.post('/api/demo/reset', wrap((_req, res) => {
    const d = deps.demo
    if (!d) throw new Error('Reinicio de demo no encontrado en este servidor')
    if (secure) identity(engine.listWallets()[0].id)
    const next = d.seeds()
    engine.reset(next)          // 409 si hay un pago en curso; nada se toca antes de esto
    d.resetStore()
    sessions.clear()            // las uniones pendientes dejan de servir
    issued.clear()
    res.json({ mode: d.mode, label: d.label, wallets: next.map((w) => w.id) })
  }))

  // ---------- Unirse (plan 12.1): inicio y callback del banco ----------
  app.post('/api/wallets/:id/join', wrap(async (req, res) => {
    const join = deps.join
    if (!join) throw new Error('Unirse no está disponible en este servidor')
    const walletId = engine.getWallet(req.params.id).id
    const { name, walletAddress, cap, interval } = req.body ?? {}
    if (typeof name !== 'string' || typeof walletAddress !== 'string' || typeof interval !== 'string' || !isMoney(cap)) {
      throw new BadRequest('Falta { name, walletAddress, cap: Money, interval }')
    }
    if (engine.getWallet(walletId).members.some(m => m.walletAddress === walletAddress && m.status === 'active')) throw new Error('Esta wallet ya tiene una union activa.')
    let sid = currentSessionId()
    if (!sid) {
      sid = randomBytes(32).toString('base64url')
      issued.set(sid, Date.now() + 86400000)
      res.setHeader('Set-Cookie',
        `${SESSION_COOKIE}=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${join.webUrl.startsWith('https:') ? '; Secure' : ''}`)
    }
    const existing = sessions.get(sid)
    if (existing?.pending && existing.expiresAt > Date.now()) throw new Error('Ya hay una union pendiente en este navegador; no cambies de grupo.')
    const session = { service: undefined as unknown as MembersService, walletId, assetCode: cap.assetCode,
      pending: true, expiresAt: Date.now() + 600000, members: existing?.members ?? new Set<string>() }
    sessions.set(sid, session)
    try {
      if (join.metadata) {
        const metadata = await join.metadata(walletAddress)
        if (metadata.assetCode !== cap.assetCode || metadata.assetScale !== cap.assetScale) throw new Error('Unidad distinta de la wallet publica')
      }
      session.service = join.createService(sid, currentSessionId, cap.assetCode)
      const result = await requestContext.run({ sid }, () => session.service.startJoin(walletId, { name, walletAddress, assetCode: cap.assetCode, cap, interval }))
      res.json(result)
    } catch {
      session.pending = false
      throw new Error('No se pudo iniciar la union; revisa wallet, moneda, escala e intervalo.')
    }
  }))

  app.post('/api/join/cancel', wrap((_req, res) => {
    const sid = currentSessionId(); const session = sid ? sessions.get(sid) : undefined
    if (session?.finishing) throw new Error('Hay una union completandose')
    session?.service?.cancelJoin?.()
    if (session) session.pending = false
    res.json({ cancelledLocally: true, externalGrantRevoked: false })
  }))

  // El banco redirige aquí. Nunca se registran ni se reenvían hash, interact_ref ni state.
  app.get('/api/join/finish', wrap(async (req, res) => {
    const join = deps.join
    if (!join) throw new Error('Unirse no está disponible en este servidor')
    const back = (result: 'ok' | 'error' | 'rechazada') => res.redirect(303, `${join.webUrl}#/inicio?union=${result}`)
    const rejected = new URL(req.originalUrl, 'http://localhost').searchParams
    if (rejected.get('result') === 'grant_rejected') {
      const sid = currentSessionId(); const session = sid ? sessions.get(sid) : undefined
      const state = rejected.get('state')
      if (session && state && !session.finishing) { session.service.cancelJoin?.(state); session.pending = false }
      return back('rechazada')
    }

    const sid = currentSessionId()
    const session = sid ? sessions.get(sid) : undefined
    const p = singleParams(req, ['interact_ref', 'hash', 'state'])
    if (!session || !session.pending || session.finishing || session.expiresAt <= Date.now() || !p) return back('error')
    session.finishing = true
    let member: Member
    try {
      ({ member } = await session.service.finishJoin({ interactRef: p.interact_ref, hash: p.hash, state: p.state }))
    } catch {
      session.finishing = false
      return back('error')   // incluye hash inválido: R1 no continúa la concesión
    }
    session.pending = false; session.finishing = false
    engine.addMember(session.walletId, member)
    session.members.add(member.id)
    refreshLater(session.walletId)
    return back('ok')
  }))

  // SSE: cada WalletEvent de esta billetera, como `data: <json>`.
  app.get('/api/wallets/:id/events', wrap((req, res) => {
    const walletId = engine.getWallet(req.params.id).id
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write(': conectado\n\n')
    const unsubscribe = bus.subscribe((e) => {
      if (e.walletId === walletId) res.write(`data: ${JSON.stringify(e)}\n\n`)
    })
    const ping = setInterval(() => res.write(': ping\n\n'), heartbeatMs)
    req.on('close', () => { clearInterval(ping); unsubscribe() })
  }))

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(statusFor(err)).json({ error: err instanceof Error ? err.message : String(err) })
  })

  return app
}
