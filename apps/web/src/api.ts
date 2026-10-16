// Única puerta entre las pantallas y los datos. Las pantallas importan SOLO de aquí,
// nunca del simulado directamente (sección 14 del plan: cambiar de simulado a real es
// cambiar esta línea de importación).
import type { Money, SharedWallet, Spend, WalletEvent } from '../../../contracts/index.js'
import * as mock from '../../../mocks/api.mock.js'

export const MODO: 'live' | 'mock' = import.meta.env.VITE_API_MODE === 'live' ? 'live' : 'mock'

function pendienteLive(): never {
  throw new Error('Modo live pendiente: falta conectar con la API de R3')
}

export function getWallets(): SharedWallet[] {
  return MODO === 'live' ? pendienteLive() : mock.getWallets()
}

export function getWallet(id: string): SharedWallet {
  return MODO === 'live' ? pendienteLive() : mock.getWallet(id)
}

export function getSpends(walletId: string): Spend[] {
  return MODO === 'live' ? pendienteLive() : mock.getSpends(walletId)
}

export function getSpend(spendId: string): Spend {
  const spend = getSpends('w-mama').find((s) => s.id === spendId)
  if (!spend) throw new Error('Gasto no encontrado')
  return spend
}

export function onEvents(walletId: string, cb: (e: WalletEvent) => void): () => void {
  return MODO === 'live' ? pendienteLive() : mock.onEvents(walletId, cb)
}

export function castApproval(spendId: string, memberId: string, yes: boolean): Spend {
  return MODO === 'live' ? pendienteLive() : mock.castApproval(spendId, memberId, yes)
}

export function requestSpend(walletId: string, destination: Spend['destination'], amount: Money): Spend {
  return MODO === 'live' ? pendienteLive() : mock.requestSpend(walletId, destination, amount)
}

export function executeSpend(spendId: string): void {
  if (MODO === 'live') pendienteLive()
  mock.executeSpend(spendId)
}

export function retryShare(spendId: string): void {
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
