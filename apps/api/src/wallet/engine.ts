// Motor de la billetera: revisión del gasto con el guardián, aprobación del grupo (plan v6, 12.3)
// y ejecución por aportes con conciliación (12.4).
// Los servicios llegan por parámetro: simulados ahora, reales a las 15:00, sin cambiar el motor.
import type {
  Guardian, Money, PaymentsService, SharedWallet, Spend, SpendStatus, WalletEvent,
} from '../../../../contracts'
import { activeMembers, add, gt, newSpend, zero } from './model'
import { assertTransition } from './state'

type Share = Spend['shares'][number]

export interface EngineDeps {
  guardian: Guardian
  payments: PaymentsService
  emit: (e: WalletEvent) => void
  now?: () => number
  maxFeePercent?: number                 // para checkQuote; Rules no lo trae
  pollMs?: number                        // espera entre consultas de track()
  maxPolls?: number                      // intentos antes de dar el aporte por fallido
  sleep?: (ms: number) => Promise<void>
}

export function createEngine(deps: EngineDeps) {
  const now = deps.now ?? Date.now
  const maxFeePercent = deps.maxFeePercent ?? 5
  const pollMs = deps.pollMs ?? 1000
  const maxPolls = deps.maxPolls ?? 30
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const wallets = new Map<string, SharedWallet>()
  const spends = new Map<string, Spend>()
  // Cobros creados para cada gasto. Quedan en el motor: el contrato no tiene campo para ellos.
  const incomings = new Map<string, string[]>()

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

  function memberName(wallet: SharedWallet, memberId: string): string {
    return wallet.members.find((m) => m.id === memberId)?.name ?? memberId
  }

  function updateProgress(spend: Spend): void {
    spend.progress = { confirmed: spend.shares.filter((s) => s.status === 'paid').length, total: spend.shares.length }
  }

  function failShare(wallet: SharedWallet, spend: Spend, share: Share, reason: string): void {
    share.status = 'failed'
    share.failReason = reason
    updateProgress(spend)
    emit({ walletId: wallet.id, type: 'share-failed', spendId: spend.id, memberId: share.memberId, amount: share.share,
           message: `Falló el aporte de ${memberName(wallet, share.memberId)}: ${reason}` })
  }

  // Un aporte: cotizar (receiveAmount = su parte) → revisar cotización → pagar → seguir hasta que termine.
  async function payOne(wallet: SharedWallet, spend: Spend, share: Share, incomingPaymentUrl: string): Promise<void> {
    try {
      const quote = await deps.payments.quoteShare(share.memberId, incomingPaymentUrl, share.share)
      const qv = deps.guardian.checkQuote({ debitAmount: quote.debitAmount, receiveAmount: quote.receiveAmount, maxFeePercent })
      spend.verdicts.push(qv)
      if (qv.status === 'block') return failShare(wallet, spend, share, qv.userMessage)
      share.debit = quote.debitAmount

      const { outgoingId } = await deps.payments.payShare(share.memberId, quote.quoteId)
      let state = await deps.payments.track(outgoingId)
      for (let i = 1; state === 'pending' && i < maxPolls; i++) {
        await sleep(pollMs)
        state = await deps.payments.track(outgoingId)
      }
      if (state !== 'completed') {
        return failShare(wallet, spend, share, state === 'pending' ? 'El pago no se confirmó a tiempo' : 'El pago falló')
      }
      share.status = 'paid'
      delete share.failReason
      updateProgress(spend)
      const { confirmed, total } = spend.progress
      emit({ walletId: wallet.id, type: 'share-paid', spendId: spend.id, memberId: share.memberId, amount: share.share,
             message: `${confirmed} de ${total} aportes confirmados` })
    } catch (e) {
      failShare(wallet, spend, share, e instanceof Error ? e.message : String(e))
    }
  }

  // Cierre: nunca "pagado" sin que reconcile confirme lo RECIBIDO en todos los cobros del gasto.
  async function finish(wallet: SharedWallet, spend: Spend): Promise<Spend> {
    let received = zero(spend.amount)
    for (const url of incomings.get(spend.id) ?? []) {
      received = add(received, await deps.payments.received(url))
    }
    const rv = deps.guardian.reconcile({ expected: spend.amount, received })
    spend.verdicts = [...spend.verdicts.filter((v) => v.check !== 'reconcile'), rv]

    if (spend.shares.every((s) => s.status === 'paid') && rv.status === 'pass') {
      setStatus(spend, 'paid')
      emit({ walletId: wallet.id, type: 'spend-paid', spendId: spend.id, amount: received,
             message: 'Gasto verificado' })
    } else {
      setStatus(spend, 'incomplete')
    }
    return spend
  }

  async function payShares(wallet: SharedWallet, spend: Spend, shares: Share[], amount: Money): Promise<Spend> {
    let url: string
    try {
      // Justo antes de pagar: los cobros vencen.
      url = (await deps.payments.createIncoming(spend.destination.walletAddress, amount)).incomingPaymentUrl
    } catch (e) {
      const reason = `No se pudo crear el cobro: ${e instanceof Error ? e.message : String(e)}`
      shares.forEach((s) => failShare(wallet, spend, s, reason))
      return finish(wallet, spend)
    }
    incomings.set(spend.id, [...(incomings.get(spend.id) ?? []), url])
    for (const share of shares) await payOne(wallet, spend, share, url)  // en orden: "1 de 3", "2 de 3"…
    return finish(wallet, spend)
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

    // APROBADO → PAGANDO → PAGADO (verificado) | INCOMPLETO
    async executeSpend(spendId: string): Promise<Spend> {
      const spend = spendOf(spendId)
      const wallet = walletOf(spend.walletId)
      setStatus(spend, 'paying')
      return payShares(wallet, spend, spend.shares.filter((s) => s.status === 'pending'), spend.amount)
    },

    // INCOMPLETO → PAGANDO: reintenta solo los aportes fallidos, con un cobro nuevo por lo que falta.
    // No devuelve automáticamente los aportes ya hechos (límite dicho en el plan).
    async retryShare(spendId: string): Promise<Spend> {
      const spend = spendOf(spendId)
      const wallet = walletOf(spend.walletId)
      setStatus(spend, 'paying')
      const failed = spend.shares.filter((s) => s.status === 'failed')
      if (failed.length === 0) return finish(wallet, spend)   // solo faltaba confirmar lo recibido
      failed.forEach((s) => { s.status = 'pending'; delete s.failReason })
      updateProgress(spend)
      const missing = failed.reduce((sum, s) => add(sum, s.share), zero(spend.amount))
      return payShares(wallet, spend, failed, missing)
    },
  }
}

export type Engine = ReturnType<typeof createEngine>
