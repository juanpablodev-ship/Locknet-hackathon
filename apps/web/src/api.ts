// Única puerta entre las pantallas y los datos. Las pantallas importan SOLO de aquí,
// nunca del simulado directamente (sección 14 del plan: cambiar de simulado a real es
// cambiar esta línea de importación).
import type { Money, SharedWallet, Spend, WalletEvent } from '../../../contracts/index.js'
import * as mock from '../../../mocks/api.mock.js'

export const MODO: 'live' | 'mock' = import.meta.env.VITE_API_MODE === 'live' ? 'live' : 'mock'

function pendienteLive(): never {
  throw new Error('Modo live pendiente: falta conectar con la API de R3')
}

export async function getWallets(): Promise<SharedWallet[]> {
  if (MODO === 'live') pendienteLive()
  return mock.getWallets()
}

export async function getWallet(id: string): Promise<SharedWallet> {
  if (MODO === 'live') pendienteLive()
  return mock.getWallet(id)
}

export async function getSpends(walletId: string): Promise<Spend[]> {
  if (MODO === 'live') pendienteLive()
  return mock.getSpends(walletId)
}

export async function getSpend(spendId: string): Promise<Spend> {
  if (MODO === 'live') pendienteLive()
  const spend = mock.getSpends('w-mama').find((s) => s.id === spendId)
  if (!spend) throw new Error('Gasto no encontrado')
  return spend
}

export function onEvents(walletId: string, cb: (e: WalletEvent) => void): () => void {
  return MODO === 'live' ? pendienteLive() : mock.onEvents(walletId, cb)
}

export async function castApproval(spendId: string, memberId: string, yes: boolean): Promise<Spend> {
  if (MODO === 'live') pendienteLive()
  return mock.castApproval(spendId, memberId, yes)
}

export async function requestSpend(walletId: string, destination: Spend['destination'], amount: Money): Promise<Spend> {
  if (MODO === 'live') pendienteLive()
  return mock.requestSpend(walletId, destination, amount)
}

export async function executeSpend(spendId: string): Promise<void> {
  if (MODO === 'live') pendienteLive()
  mock.executeSpend(spendId)
}

export async function retryShare(spendId: string): Promise<void> {
  if (MODO === 'live') pendienteLive()
  mock.retryShare(spendId)
}

export function setFalloAporte(memberId: string | null): void {
  if (MODO === 'live') pendienteLive()
  mock.setFalloAporte(memberId)
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
