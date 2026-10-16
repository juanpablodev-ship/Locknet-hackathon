// Única puerta entre las pantallas y los datos. Las pantallas importan SOLO de aquí,
// nunca del simulado directamente (sección 14 del plan: cambiar de simulado a real es
// cambiar esta línea de importación).
import type { Money, SharedWallet, Spend, WalletEvent } from '../../../contracts/index.js'
import * as mock from '../../../mocks/api.mock.js'

export const MODO: 'live' | 'mock' =
  import.meta.env.VITE_API_MODE === 'live' || import.meta.env.MODE === 'live' ? 'live' : 'mock'
const BASE = import.meta.env.VITE_API_URL ?? ''

async function pedir<T>(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<T> {
  let respuesta: Response
  try {
    respuesta = await fetch(`${BASE}${ruta}`, {
      method: metodo,
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
    const error = (await respuesta.json()) as { error?: unknown }
    if (typeof error.error !== 'string') throw new Error(`Error HTTP ${respuesta.status}`)
    throw new Error(error.error)
  }
  return (await respuesta.json()) as T
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
  const spend = mock.getSpends('w-mama').find((s) => s.id === spendId)
  if (!spend) throw new Error('Gasto no encontrado')
  return spend
}

export function onEvents(walletId: string, cb: (e: WalletEvent) => void): () => void {
  if (MODO === 'mock') return mock.onEvents(walletId, cb)
  const source = new EventSource(`${BASE}/api/wallets/${encodeURIComponent(walletId)}/events`)
  source.onmessage = (event) => {
    try {
      cb(JSON.parse(event.data) as WalletEvent)
    } catch {
      return
    }
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

export async function executeSpend(spendId: string): Promise<void> {
  if (MODO === 'live') {
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

export function setFalloAporte(memberId: string | null): void {
  if (MODO === 'mock') mock.setFalloAporte(memberId)
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
