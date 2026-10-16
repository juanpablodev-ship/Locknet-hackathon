// Motor de la billetera: revisión del gasto con el guardián y aprobación del grupo (plan v6, 12.3).
// Los servicios llegan por parámetro: simulados ahora, reales a las 15:00, sin cambiar el motor.
import type { Guardian, Money, SharedWallet, Spend, SpendStatus, WalletEvent } from '../../../../contracts'
import { activeMembers, gt, newSpend } from './model'
import { assertTransition } from './state'

export interface EngineDeps {
  guardian: Guardian
  emit: (e: WalletEvent) => void
  now?: () => number
}

export function createEngine(deps: EngineDeps) {
  const now = deps.now ?? Date.now
  const wallets = new Map<string, SharedWallet>()
  const spends = new Map<string, Spend>()

  function emit(e: Omit<WalletEvent, 'ts'>): void {
    deps.emit({ ...e, ts: now() })
  }

  function walletOf(id: string): SharedWallet {
    const w = wallets.get(id)
    if (!w) throw new Error(`Billetera no encontrada: ${id}`)
    return w
  }

  function spendOf(id: string): Spend {
    const s = spends.get(id)
    if (!s) throw new Error(`Gasto no encontrado: ${id}`)
    return s
  }

  function setStatus(spend: Spend, to: SpendStatus): void {
    assertTransition(spend.status, to)
    spend.status = to
  }

  return {
    addWallet(wallet: SharedWallet): void {
      wallets.set(wallet.id, wallet)
    },

    getWallet: walletOf,
    getSpend: spendOf,

    listSpends(walletId: string): Spend[] {
      return [...spends.values()].filter((s) => s.walletId === walletId)
    },

    // SOLICITADO → REVISADO POR EL GUARDIÁN → BLOQUEADO | EN APROBACIÓN | APROBADO
    requestSpend(walletId: string, destination: Spend['destination'], amount: Money, id?: string): Spend {
      const wallet = walletOf(walletId)
      const spend = newSpend({ wallet, destination, amount, id })
      spends.set(spend.id, spend)
      emit({ walletId, type: 'spend-requested', spendId: spend.id, amount,
             message: `Se pidió un gasto a ${destination.name}` })

      const verdict = deps.guardian.checkDestination({
        walletAddress: destination.walletAddress,
        known: wallet.knownDestinations,
      })
      spend.verdicts = [verdict]
      spend.risk = deps.guardian.riskScore(spend.verdicts)
      emit({ walletId, type: 'spend-reviewed', spendId: spend.id, risk: spend.risk,
             message: verdict.userMessage })

      const rule = wallet.rules.groupApproval
      if (spend.verdicts.some((v) => v.status === 'block')) {
        setStatus(spend, 'blocked')
        emit({ walletId, type: 'spend-blocked', spendId: spend.id, risk: spend.risk,
               message: 'El guardián bloqueó el gasto.' })
      } else if (spend.risk >= rule.riskThreshold || gt(amount, rule.aboveAmount)) {
        setStatus(spend, 'awaiting-approval')
      } else {
        setStatus(spend, 'approved')
        emit({ walletId, type: 'spend-approved', spendId: spend.id, message: 'Gasto aprobado.' })
      }
      return spend
    },

    // Aprobación del grupo (inspirada en la multifirma; la aplica la plataforma).
    castApproval(spendId: string, memberId: string, yes: boolean): Spend {
      const spend = spendOf(spendId)
      const wallet = walletOf(spend.walletId)
      if (spend.status !== 'awaiting-approval') {
        throw new Error(`El gasto no está esperando aprobación (estado: ${spend.status})`)
      }
      const voters = activeMembers(wallet)
      if (!voters.some((m) => m.id === memberId)) throw new Error(`No es miembro activo: ${memberId}`)
      if (spend.approvals.some((a) => a.memberId === memberId)) throw new Error(`Ya votó: ${memberId}`)

      spend.approvals.push({ memberId, yes })
      emit({ walletId: wallet.id, type: 'approval-cast', spendId, memberId,
             message: yes ? 'Aprobó el gasto.' : 'Rechazó el gasto.' })

      const required = wallet.rules.groupApproval.approvalsRequired
      const yesCount = spend.approvals.filter((a) => a.yes).length
      const pending = voters.length - spend.approvals.length
      if (yesCount >= required) {
        setStatus(spend, 'approved')
        emit({ walletId: wallet.id, type: 'spend-approved', spendId, message: 'El grupo aprobó el gasto.' })
      } else if (yesCount + pending < required) {
        setStatus(spend, 'rejected')
        emit({ walletId: wallet.id, type: 'spend-rejected', spendId, message: 'El grupo rechazó el gasto.' })
      }
      return spend
    },
  }
}

export type Engine = ReturnType<typeof createEngine>
