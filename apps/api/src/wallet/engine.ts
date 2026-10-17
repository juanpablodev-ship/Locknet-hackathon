// Motor de la billetera: revisión del gasto con el guardián, aprobación del grupo (plan v6, 12.3)
// y ejecución por aportes con conciliación (12.4).
// Los servicios llegan por parámetro: simulados ahora, reales a las 15:00, sin cambiar el motor.
import type {
  Guardian, Member, Money, PaymentsService, SharedWallet, Spend, SpendStatus, WalletEvent,
} from '../../../../contracts'
import { activeMembers, add, gt, newSpend, zero } from './model'
import { PaymentError, safePaymentError } from '../payments/errors'
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
  incomingPerShare?: boolean             // plan B: un cobro por aporte en vez de uno compartido
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
  // Plan B: el cobro propio de cada aporte, para saber cuánto llegó de cada miembro. Clave: "gasto:miembro".
  const shareIncoming = new Map<string, string>()

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

  // Cupo del grupo = suma de lo que le queda a cada miembro activo en la moneda de la billetera.
  // Los miembros en otra moneda no se suman hasta tener conversión (pendiente con available()).
  function recomputeCapacity(wallet: SharedWallet): void {
    const scale = wallet.authorizedCapacity.assetScale
    let total = zero({ assetCode: wallet.currency, assetScale: scale })
    for (const m of activeMembers(wallet)) {
      const left = m.available ?? zero(m.cap)
      if (left.assetCode === wallet.currency && left.assetScale === scale) total = add(total, left)
    }
    wallet.authorizedCapacity = total
    const buckets = new Map<string, Money>()
    for (const m of activeMembers(wallet)) {
      if (!m.available) continue
      const key = m.available.assetCode + ':' + m.available.assetScale
      buckets.set(key, add(buckets.get(key) ?? zero(m.available), m.available))
    }
    wallet.capacityByAsset = [...buckets.values()]
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
  async function payOne(wallet: SharedWallet, spend: Spend, share: Share, incomingPaymentUrl: string, target = share.share): Promise<void> {
    const attempt: NonNullable<Share['attempts']>[number] = { incomingPaymentUrl, status: 'prepared' }
    ;(share.attempts ??= []).push(attempt)
    let submitted = false
    try {
      const quote = await deps.payments.quoteShare(share.memberId, incomingPaymentUrl, target)
      attempt.quoteId = quote.quoteId
      const qv = deps.guardian.checkQuote({ debitAmount: quote.debitAmount, receiveAmount: quote.receiveAmount, maxFeePercent })
      spend.verdicts.push(qv)
      if (qv.status === 'block') { attempt.status = 'failed'; return failShare(wallet, spend, share, qv.userMessage) }
      share.debit = quote.debitAmount
      submitted = true
      attempt.status = 'unknown' // antes del await: una perdida de respuesta no prueba rechazo
      const { outgoingId } = await deps.payments.payShare(share.memberId, quote.quoteId)
      attempt.outgoingId = outgoingId
      let result = await deps.payments.track(outgoingId)
      for (let i = 1; result === 'pending' && i < maxPolls; i++) { await sleep(pollMs); result = await deps.payments.track(outgoingId) }
      attempt.status = result
      if (result === 'failed') return failShare(wallet, spend, share, 'El proveedor confirmo que el pago fallo.')
      share.status = result === 'completed' ? 'paid' : 'pending'
      share.failReason = result === 'pending' ? 'Resultado pendiente; consulta otra vez. No vuelvas a pagar.' : undefined
      updateProgress(spend)
      emit({ walletId: wallet.id, type: result === 'completed' ? 'share-paid' : 'share-failed', spendId: spend.id,
        memberId: share.memberId, message: result === 'completed' ? `${spend.progress.confirmed} de ${spend.progress.total} aportes confirmados` : 'Resultado pendiente; no reintentar pago.' })
    } catch (error) {
      const unknown = submitted && (!(error instanceof PaymentError) || error.outcome === 'unknown')
      attempt.status = unknown ? 'unknown' : 'failed'
      if (unknown) {
        share.status = 'pending'; share.failReason = 'Resultado desconocido; no se creara otro pago. Consulta el intento existente.'
      } else failShare(wallet, spend, share, safePaymentError(error).message)
    }
  }

  // Cierre: nunca "pagado" sin que reconcile confirme lo RECIBIDO en todos los cobros del gasto.
  async function finish(wallet: SharedWallet, spend: Spend): Promise<Spend> {
    let received = zero(spend.amount)
    let completeRead = true
    const receivedByUrl = new Map<string, Money>()
    for (const url of new Set(incomings.get(spend.id) ?? [])) {
      let got: Money
      // Un cobro sin confirmar no suma: reconcile no dará "pagado" y el gasto queda incompleto.
      try { got = await deps.payments.received(url); received = add(received, got) } catch { completeRead = false; continue }
      receivedByUrl.set(url, got)
    }
    // Plan B: cada aporte tiene su propio cobro, así que lo que llegó ahí es lo que llegó de ese miembro.
    // Con un cobro compartido (plan A) no se puede atribuir por miembro y `received` queda vacío.
    for (const share of spend.shares) {
      const urls = share.attempts?.map(a => a.incomingPaymentUrl) ?? []
      const values = [...new Set(urls)].map(url => receivedByUrl.get(url))
      if (deps.incomingPerShare && values.length && values.every((v): v is Money => !!v)) {
        share.received = values.reduce((sum, got) => add(sum, got), zero(share.share))
      }
    }
    const rv = deps.guardian.reconcile({ expected: spend.amount, received })
    spend.verdicts = [...spend.verdicts.filter((v) => v.check !== 'reconcile'), rv]

    if (completeRead && spend.shares.every((s) => s.status === 'paid') && rv.status === 'pass') {
      setStatus(spend, 'paid')
      emit({ walletId: wallet.id, type: 'spend-paid', spendId: spend.id, amount: received,
             message: 'Gasto verificado' })
    } else {
      setStatus(spend, 'incomplete')
    }
    if (spend.status !== 'paid') emit({ walletId: wallet.id, type: 'spend-updated', spendId: spend.id, message: completeRead ? 'Estado consultado.' : 'Recepcion no confirmada; vuelve a consultar sin pagar.' })
    return spend
  }

  // Justo antes de pagar: los cobros vencen. Si no se puede crear, fallan los aportes que dependían de él.
  async function newIncoming(wallet: SharedWallet, spend: Spend, shares: Share[], amount: Money): Promise<string | undefined> {
    try {
      const url = (await deps.payments.createIncoming(spend.destination.walletAddress, amount)).incomingPaymentUrl
      incomings.set(spend.id, [...(incomings.get(spend.id) ?? []), url])
      return url
    } catch (e) {
      const reason = safePaymentError(e).message
      shares.forEach((s) => failShare(wallet, spend, s, reason))
      return undefined
    }
  }

  async function payShares(wallet: SharedWallet, spend: Spend, shares: Share[], amount: Money): Promise<Spend> {
    if (deps.incomingPerShare) {
      // Plan B: cada aporte paga su propio cobro (probado con un pagador en la Test Wallet).
      for (const share of shares) {
        const left = { ...share.share, value: (BigInt(share.share.value) - BigInt(share.received?.value ?? '0')).toString() }
        if (BigInt(left.value) <= 0n) { share.status = 'paid'; continue }
        const url = await newIncoming(wallet, spend, [share], left)
        if (url) {
          shareIncoming.set(`${spend.id}:${share.memberId}`, url)   // el reintento lo reemplaza por su cobro nuevo
          await payOne(wallet, spend, share, url, left)
        }
      }
    } else {
      const url = await newIncoming(wallet, spend, shares, amount)
      if (url) for (const share of shares) await payOne(wallet, spend, share, url)  // en orden: "1 de 3", "2 de 3"…
    }
    return finish(wallet, spend)
  }

  return {
    addWallet(wallet: SharedWallet): void {
      wallets.set(wallet.id, wallet)
    },

    listWallets(): SharedWallet[] {
      return [...wallets.values()]
    },

    // Cupo real (plan 12.2): lo que le queda a cada miembro según MembersService.available() de R1.
    // Un importe no consultable se excluye; no se presenta como cupo actualizado.
    async refreshCapacity(walletId: string, available: (memberId: string) => Promise<Money>): Promise<SharedWallet> {
      const wallet = walletOf(walletId)
      wallet.capacityStale = false
      for (const m of activeMembers(wallet)) {
        try { m.available = await available(m.id) } catch { m.available = undefined; wallet.capacityStale = true }
      }
      recomputeCapacity(wallet)
      emit({ walletId, type: 'capacity-updated', amount: wallet.authorizedCapacity,
             message: 'Cupo autorizado del grupo actualizado.' })
      return wallet
    },

    // Reinicio de demo: reemplaza billeteras y borra gastos y cobros. No revoca permisos externos.
    reset(next: SharedWallet[]): void {
      if ([...spends.values()].some((s) => s.status === 'paying' || s.shares.some(sh => sh.attempts?.some(a => a.status === 'unknown' || a.status === 'pending')))) {
        throw new Error('No se puede reiniciar con un pago en curso')
      }
      wallets.clear()
      spends.clear()
      incomings.clear()
      shareIncoming.clear()
      for (const w of next) wallets.set(w.id, structuredClone(w))
    },

    // Un miembro que terminó de unirse (MembersService.finishJoin de R1). No deposita nada.
    addMember(walletId: string, member: Member): SharedWallet {
      const wallet = walletOf(walletId)
      if (member.status !== 'active') throw new Error(`Solo se agregan miembros activos (estado: ${member.status})`)
      if (wallet.members.some((m) => m.id === member.id || (m.walletAddress === member.walletAddress && m.status === 'active'))) throw new Error(`Ya es miembro: ${member.id}`)
      wallet.members.push(structuredClone(member))
      emit({ walletId, type: 'member-active', memberId: member.id, amount: member.cap,
             message: `${member.name} se unió. No depositó nada.` })
      recomputeCapacity(wallet)
      emit({ walletId, type: 'capacity-updated', amount: wallet.authorizedCapacity,
             message: 'Cupo autorizado del grupo actualizado.' })
      return wallet
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

    revokeMember(walletId: string, memberId: string): void {
      const wallet = walletOf(walletId)
      const member = wallet.members.find(m => m.id === memberId)
      if (!member) throw new Error('Miembro no encontrado')
      member.status = 'revoked'; member.available = zero(member.cap); recomputeCapacity(wallet)
      emit({ walletId, type: 'member-revoked', memberId, message: 'Permiso revocado.' })
    },

    async recheckSpend(spendId: string): Promise<Spend> {
      const spend = spendOf(spendId); const wallet = walletOf(spend.walletId)
      setStatus(spend, 'paying')
      for (const share of spend.shares) {
        const attempt = share.attempts?.at(-1)
        if (!attempt?.outgoingId || share.status === 'paid') continue
        try {
          const status = await deps.payments.track(attempt.outgoingId)
          attempt.status = status
          share.status = status === 'completed' ? 'paid' : status === 'failed' ? 'failed' : 'pending'
          share.failReason = status === 'pending' ? 'Resultado pendiente; consulta sin volver a pagar.' : status === 'failed' ? 'El proveedor confirmo el fallo.' : undefined
        } catch { share.status = 'pending'; attempt.status = 'unknown'; share.failReason = 'No se pudo consultar el intento existente.' }
      }
      updateProgress(spend)
      return finish(wallet, spend)
    },

    async retryShare(spendId: string): Promise<Spend> {
      const spend = spendOf(spendId); const wallet = walletOf(spend.walletId)
      if (spend.shares.some(s => s.status === 'pending' && s.attempts?.length)) throw new Error('Hay resultados desconocidos; consulta antes de reintentar.')
      setStatus(spend, 'paying')
      // Consultar recepcion antes de crear nada, incluso si el proveedor ya marco fallo.
      try {
        for (const share of spend.shares.filter(s => s.status === 'failed')) {
          if (!deps.incomingPerShare && share.attempts?.some(a => a.outgoingId)) throw new Error('Reintento compartido requiere conciliacion manual')
          const urls = deps.incomingPerShare ? [...new Set(share.attempts?.map(a => a.incomingPaymentUrl) ?? [])] : []
          share.received = zero(share.share)
          for (const url of urls) share.received = add(share.received, await deps.payments.received(url))
        }
      } catch { setStatus(spend, 'incomplete'); throw new Error('Consulta de recepcion pendiente; no se creo otro pago.') }
      const failed = spend.shares.filter(s => s.status === 'failed')
      failed.forEach(s => { s.status = 'pending'; delete s.failReason })
      const missing = failed.reduce((sum, s) => add(sum, { ...s.share, value: (BigInt(s.share.value) - BigInt(s.received?.value ?? '0')).toString() }), zero(spend.amount))
      return payShares(wallet, spend, failed, missing)
    },
  }
}

export type Engine = ReturnType<typeof createEngine>
