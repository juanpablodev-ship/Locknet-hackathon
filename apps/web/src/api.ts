// Única puerta entre las pantallas y los datos. Las pantallas importan SOLO de aquí,
// nunca del simulado directamente (sección 14 del plan: cambiar de simulado a real es
// cambiar esta línea de importación).
import type { JoinSetup, Member, Money, SharedWallet, Spend, Verdict, WalletEvent } from '../../../contracts/index.js'
import * as mock from '../../../mocks/api.mock.js'

export const MODO: 'live' | 'mock' =
  import.meta.env.MODE === 'live' ? 'live' : import.meta.env.MODE === 'mock' ? 'mock' :
  import.meta.env.VITE_API_MODE === 'live' ? 'live' :
  import.meta.env.VITE_API_MODE === 'mock' || import.meta.env.MODE === 'test' ? 'mock' : 'live'
const BASE = import.meta.env.VITE_API_URL ?? ''

export interface ApiModeInfo {
  mode: 'live' | 'fixtures'
  label?: string
  recordedAt?: string
}

export interface DemoResetResult extends ApiModeInfo {
  wallets: string[]
}

function unirsePendiente(): never {
  throw new Error('Unirse todavía no está conectado a la API')
}

async function pedir<T>(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<T> {
  let respuesta: Response
  try {
    respuesta = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      ...(cuerpo === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cuerpo),
          }),
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor')
  }

  if (!respuesta.ok) {
    if (metodo === 'POST' && ruta === '/api/demo/reset' && respuesta.status === 409) {
      throw new Error('No se puede reiniciar con un pago en curso')
    }
    const error = (await respuesta.json()) as { error?: unknown }
    if (typeof error.error !== 'string') throw new Error(`Error HTTP ${respuesta.status}`)
    throw new Error(error.error)
  }
  return (await respuesta.json()) as T
}

export function getApiMode(): Promise<ApiModeInfo> {
  return pedir('GET', '/api/mode')
}

export function resetDemo(): Promise<DemoResetResult> {
  return pedir('POST', '/api/demo/reset')
}

export async function getWallets(): Promise<SharedWallet[]> {
  if (MODO === 'live') return pedir('GET', '/api/wallets')
  return mock.getWallets()
}

export async function getWallet(id: string): Promise<SharedWallet> {
  if (MODO === 'live') return pedir('GET', `/api/wallets/${encodeURIComponent(id)}`)
  return mock.getWallet(id)
}

export async function getSpends(walletId: string): Promise<Spend[]> {
  if (MODO === 'live') return pedir('GET', `/api/wallets/${encodeURIComponent(walletId)}/spends`)
  return mock.getSpends(walletId)
}

export async function getSpend(spendId: string): Promise<Spend> {
  if (MODO === 'live') return pedir('GET', `/api/spends/${encodeURIComponent(spendId)}`)
  const spend = mock
    .getWallets()
    .flatMap((wallet) => mock.getSpends(wallet.id))
    .find((item) => item.id === spendId)
  if (!spend) throw new Error('Gasto no encontrado')
  return spend
}

export function onEvents(walletId: string, cb: (e: WalletEvent) => void): () => void {
  if (MODO === 'mock') return mock.onEvents(walletId, cb)
  const source = new EventSource(`${BASE}/api/wallets/${encodeURIComponent(walletId)}/events`)
  let opened = false
  source.onopen = () => { if (opened) cb({ walletId, type: 'spend-updated', message: 'Conexion recuperada; consultar estado.', ts: Date.now() }); opened = true }
  source.onmessage = (event) => {
    let parsed: WalletEvent
    try {
      parsed = JSON.parse(event.data) as WalletEvent
    } catch {
      return
    }
    cb(parsed)
  }
  return () => source.close()
}

export async function castApproval(spendId: string, memberId: string, yes: boolean): Promise<Spend> {
  if (MODO === 'live') {
    return pedir('POST', `/api/spends/${encodeURIComponent(spendId)}/approvals`, { memberId, yes })
  }
  return mock.castApproval(spendId, memberId, yes)
}

export async function requestSpend(walletId: string, destination: Spend['destination'], amount: Money): Promise<Spend> {
  if (MODO === 'live') {
    return pedir('POST', `/api/wallets/${encodeURIComponent(walletId)}/spends`, { destination, amount })
  }
  return mock.requestSpend(walletId, destination, amount)
}

export async function getPaymentBlocker(spend: Spend): Promise<Spend | undefined> {
  const others = await getSpends(spend.walletId)
  return others.find(other => other.id !== spend.id && (other.status === 'paying' ||
    other.shares.some(share => share.attempts?.some(attempt =>
      attempt.status === 'unknown' || attempt.status === 'pending' || attempt.status === 'prepared'))))
}
export async function executeSpend(spendId: string): Promise<void> {
  if (MODO === 'live') {
    const spend = await getSpend(spendId)
    const blocker = await getPaymentBlocker(spend)
    if (blocker) throw new Error('Otro gasto tiene un pago pendiente o desconocido. Consulta el gasto anterior antes de pagar; no se envió un pago nuevo.')
    await pedir<{ spendId: string; status: 'paying' }>('POST', `/api/spends/${encodeURIComponent(spendId)}/execute`)
    return
  }
  await mock.executeSpend(spendId)
}

export async function retryShare(spendId: string): Promise<void> {
  if (MODO === 'live') {
    await pedir<{ spendId: string; status: 'paying' }>('POST', `/api/spends/${encodeURIComponent(spendId)}/retry`)
    return
  }
  await mock.retryShare(spendId)
}

export async function startJoin(
  walletId: string,
  member: Omit<Member, 'id' | 'status'>,
): Promise<{ redirectUrl: string; grantWarning: Verdict }> {
  if (MODO === 'live') return pedir('POST', `/api/wallets/${encodeURIComponent(walletId)}/join`, member)
  return mock.startJoin(walletId, member)
}

export async function finishJoin(p: { ok: boolean; memberId: string }): Promise<Member | Verdict> {
  if (MODO === 'live') unirsePendiente()
  return mock.finishJoin(p)
}

export async function cancelJoin(): Promise<void> {
  if (MODO === 'live') await pedir('POST', '/api/join/cancel')
}
export async function getJoinSetup(): Promise<JoinSetup | undefined> {
  if (MODO === 'mock') return undefined
  const setup = await pedir<Partial<JoinSetup>>('GET', '/api/setup')
  return setup.members && setup.interval ? setup as JoinSetup : undefined
}
export async function getSession(): Promise<{ memberIds: string[] }> {
  if (MODO === 'mock') return { memberIds: mock.getWallets().flatMap(w => w.members.map(m => m.id)) }
  return pedir('GET', '/api/session')
}
export async function recheckSpend(id: string): Promise<Spend> {
  if (MODO !== 'live') return getSpend(id)
  const result = await pedir<Spend | { spendId: string }>('POST', `/api/spends/${encodeURIComponent(id)}/recheck`)
  if ('shares' in result) return result
  // Compatibilidad con la API 202 aún abierta: solo consultar, nunca reenviar el POST.
  for (let i = 0; i < 60; i++) {
    const current = await getSpend(id)
    if (current.status !== 'paying') return current
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('La consulta sigue en curso. No se enviaron nuevos pagos; vuelve a consultar el estado.')
}
export async function revokeMember(walletId: string, memberId: string): Promise<void> {
  if (MODO !== 'live') throw new Error('Revocacion real solo disponible en modo live')
  await pedir('POST', `/api/wallets/${encodeURIComponent(walletId)}/members/${encodeURIComponent(memberId)}/revoke`)
}
export async function refreshCapacity(walletId: string): Promise<void> {
  if (MODO === 'live') await pedir('POST', `/api/wallets/${encodeURIComponent(walletId)}/capacity/refresh`)
}

export function setFalloAporte(memberId: string | null): void {
  if (MODO === 'mock') mock.setFalloAporte(memberId)
}

export function setHashInvalido(invalido: boolean): void {
  if (MODO === 'mock') mock.setHashInvalido(invalido)
}

// Solo para el panel de desarrollo. En modo live no hacen nada.
export function playEscenario1(stepMs?: number): void {
  if (MODO === 'mock') mock.playEscenario1(stepMs)
}

export function playEscenario3(stepMs?: number): void {
  if (MODO === 'mock') mock.playEscenario3(stepMs)
}

export function resetMock(): void {
  if (MODO === 'mock') mock.resetMock()
}

// Guarda contra carreras: cada pintado pide un turno; si mientras esperaba una promesa
// se pidió un turno más nuevo (otra ruta, otro pintado), el resultado viejo se descarta.
export function crearTurnos() {
  let actual = 0
  return {
    nuevo(): number {
      actual += 1
      return actual
    },
    esVigente(turno: number): boolean {
      return turno === actual
    },
  }
}
