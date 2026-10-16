// Máquina de estados del gasto (plan v6, sección 4 "Ciclo de vida de un gasto").
import type { SpendStatus } from '../../../../contracts'

export const TRANSITIONS: Record<SpendStatus, readonly SpendStatus[]> = {
  'requested': ['approved', 'awaiting-approval', 'blocked'],
  'awaiting-approval': ['approved', 'rejected'],
  'approved': ['paying'],
  'paying': ['paid', 'incomplete'],
  'incomplete': ['paying'],   // reintentar el aporte que falta
  'paid': [],
  'blocked': [],
  'rejected': [],
}

export function canTransition(from: SpendStatus, to: SpendStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function assertTransition(from: SpendStatus, to: SpendStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transición inválida del gasto: ${from} → ${to}`)
  }
}
