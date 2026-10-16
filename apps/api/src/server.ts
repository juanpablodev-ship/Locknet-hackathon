// API REST + SSE sobre el motor de la billetera (R3). R4 escucha los WalletEvent por SSE.
// createApp no arranca nada: el arranque real (simulados o servicios reales) se conecta a las 15:00.
import express, { type NextFunction, type Request, type Response } from 'express'
import type { Money, WalletEvent } from '../../../contracts'
import type { Engine } from './wallet/engine'

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

export function createApp(deps: { engine: Engine; bus: EventBus; heartbeatMs?: number }) {
  const { engine, bus } = deps
  const heartbeatMs = deps.heartbeatMs ?? 15_000
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {   // la web de R4 puede correr en otro puerto
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    next()
  })

  app.get('/api/wallets/:id', wrap((req, res) => res.json(engine.getWallet(req.params.id))))

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
    res.status(201).json(engine.requestSpend(req.params.id, destination, amount))
  }))

  app.post('/api/spends/:id/approvals', wrap((req, res) => {
    const { memberId, yes } = req.body ?? {}
    if (typeof memberId !== 'string' || typeof yes !== 'boolean') throw new BadRequest('Falta { memberId, yes }')
    res.json(engine.castApproval(req.params.id, memberId, yes))
  }))

  // Pagar y reintentar responden 202 de inmediato; el avance ("2 de 3") llega por SSE.
  const background = (expected: string, run: (id: string) => Promise<unknown>): Handler => (req, res) => {
    const spend = engine.getSpend(req.params.id)
    if (spend.status !== expected) {
      throw new Error(`El gasto debe estar en ${expected} (estado: ${spend.status})`)
    }
    run(spend.id).catch((e) => console.error(`[api] falló ${spend.id}:`, e))
    res.status(202).json({ spendId: spend.id, status: 'paying' })
  }
  app.post('/api/spends/:id/execute', wrap(background('approved', (id) => engine.executeSpend(id))))
  app.post('/api/spends/:id/retry', wrap(background('incomplete', (id) => engine.retryShare(id))))

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
