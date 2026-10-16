// Simulado de la API web (R4). Primer paso sin depender de nadie: api.mock con datos
// que cumplen el contrato de /contracts. Cambiar de simulado a real es cambiar una
// línea de importación (sección 14 del plan).
import type { Member, Money, SharedWallet, Spend, Verdict, WalletEvent } from '../contracts/index.js'
import { ataque, cuidadoDeMama, destinoParecido, medicina } from '../contracts/ejemplo.js'

const cop = (pesos: number): Money => ({ value: String(pesos * 100), assetCode: 'COP', assetScale: 2 })

const arregloDelParque: SharedWallet = {
  id: 'w-parque',
  name: 'Arreglo del parque',
  currency: 'COP',
  kind: 'goal',
  members: [
    { id: 'm-vecino-1', name: 'Vecino del 101', walletAddress: 'https://ilp.interledger-test.dev/vecino_1',
      assetCode: 'COP', cap: cop(50_000), available: cop(50_000), status: 'active' },
    { id: 'm-vecino-2', name: 'Vecina del 203', walletAddress: 'https://ilp.interledger-test.dev/vecino_2',
      assetCode: 'COP', cap: cop(50_000), available: cop(50_000), status: 'active' },
    { id: 'm-vecino-3', name: 'Vecino del 305', walletAddress: 'https://ilp.interledger-test.dev/vecino_3',
      assetCode: 'COP', cap: cop(50_000), status: 'pending-approval' },
  ],
  rules: {
    split: 'equal',
    groupApproval: { aboveAmount: cop(200_000), approvalsRequired: 2, riskThreshold: 60, confirmInWallet: false },
    goal: { members: 3, amount: cop(150_000), deadline: '2026-10-31T23:59:59Z' },
  },
  knownDestinations: [
    { name: 'Contratista del parque', walletAddress: 'https://ilp.interledger-test.dev/contratista-parque' },
  ],
  authorizedCapacity: cop(100_000), // solo cuentan los dos activos
}

const hornoDeLaPanaderia: SharedWallet = {
  id: 'w-horno',
  name: 'Horno de la panadería',
  currency: 'COP',
  kind: 'investment',
  members: [
    { id: 'm-inversionista-1', name: 'Inversionista 1', walletAddress: 'https://ilp.interledger-test.dev/inversionista_1',
      assetCode: 'COP', cap: cop(500_000), available: cop(500_000), status: 'active' },
    { id: 'm-inversionista-2', name: 'Inversionista 2', walletAddress: 'https://ilp.interledger-test.dev/inversionista_2',
      assetCode: 'COP', cap: cop(500_000), available: cop(500_000), status: 'active' },
    { id: 'm-inversionista-3', name: 'Inversionista 3', walletAddress: 'https://ilp.interledger-test.dev/inversionista_3',
      assetCode: 'COP', cap: cop(500_000), available: cop(500_000), status: 'active' },
  ],
  rules: {
    split: 'equal',
    groupApproval: { aboveAmount: cop(200_000), approvalsRequired: 2, riskThreshold: 60, confirmInWallet: false },
    return: { fromWalletAddress: 'https://ilp.interledger-test.dev/panaderia', percentPerSale: 10, cap: cop(1_500_000) },
  },
  knownDestinations: [
    { name: 'Proveedor de harina', walletAddress: 'https://ilp.interledger-test.dev/proveedor-harina' },
  ],
  authorizedCapacity: cop(1_500_000),
}

const WALLETS_INICIALES: SharedWallet[] = [cuidadoDeMama, arregloDelParque, hornoDeLaPanaderia]

let wallets: SharedWallet[] = structuredClone(WALLETS_INICIALES)

export function getWallets(): SharedWallet[] {
  return structuredClone(wallets)
}

export function getWallet(id: string): SharedWallet {
  const wallet = wallets.find((w) => w.id === id)
  if (!wallet) throw new Error('Billetera no encontrada')
  return structuredClone(wallet)
}

const SPENDS_INICIALES: Record<string, Spend[]> = {
  'w-mama': [medicina],
  'w-parque': [],
  'w-horno': [],
}

let spends: Record<string, Spend[]> = structuredClone(SPENDS_INICIALES)

export function getSpends(walletId: string): Spend[] {
  return structuredClone(spends[walletId] ?? [])
}

const listeners: Record<string, Set<(e: WalletEvent) => void>> = {}
let timers: ReturnType<typeof setTimeout>[] = []
let falloMemberId: string | null = null
let joinCounter = 0
let hashInvalido = false
let ultimoJoinPendiente: string | null = null
const joinsPendientes = new Map<string, { walletId: string; member: Member }>()

export function resetMock(): void {
  wallets = structuredClone(WALLETS_INICIALES)
  spends = structuredClone(SPENDS_INICIALES)
  for (const id of timers) clearTimeout(id)
  timers = []
  falloMemberId = null
  joinCounter = 0
  hashInvalido = false
  ultimoJoinPendiente = null
  joinsPendientes.clear()
}

export function setFalloAporte(memberId: string | null): void {
  falloMemberId = memberId
}

export function setHashInvalido(invalido: boolean): void {
  hashInvalido = invalido
}

function formatCap(cap: Money): string {
  const value = Number(cap.value) / 10 ** cap.assetScale
  const decimals = cap.assetCode === 'COP' ? 0 : 2
  const number = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
  const symbol = cap.assetCode === 'COP' ? '$' : cap.assetCode === 'EUR' ? '€' : cap.assetCode === 'USD' ? 'US$' : `${cap.assetCode} `
  return `${symbol}${number}`
}

function excedeTopeCOP(cap: Money): boolean {
  const scale = 10n ** BigInt(cap.assetScale)
  if (cap.assetCode === 'COP') return BigInt(cap.value) > 1_000_000n * scale
  if (cap.assetCode === 'EUR') return BigInt(cap.value) > 230n * scale
  return cap.assetCode !== 'COP'
}

export function startJoin(
  walletId: string,
  member: Omit<Member, 'id' | 'status'>,
): { redirectUrl: string; grantWarning: Verdict } {
  const wallet = wallets.find((item) => item.id === walletId)
  if (!wallet) throw new Error('Billetera no encontrada')
  if (member.cap.assetCode !== wallet.currency) {
    throw new Error('El tope debe estar en la moneda de la billetera')
  }

  const id = `m-nuevo-${++joinCounter}`
  const nuevo: Member = { ...structuredClone(member), id, status: 'active' }
  joinsPendientes.set(id, { walletId, member: nuevo })
  ultimoJoinPendiente = id

  const superaTope = excedeTopeCOP(member.cap)
  const sinIntervalo = !member.interval
  const grantWarning: Verdict = superaTope || sinIntervalo
    ? {
        check: 'grant',
        status: 'warn',
        riskPoints: 60,
        userMessage: `Esta billetera te pide autorizar hasta ${formatCap(member.cap)} sin límite de tiempo. Es mucho más de lo normal.`,
        reasons: [
          ...(superaTope ? ['El tope supera $1.000.000 COP equivalentes.'] : []),
          ...(sinIntervalo ? ['No se indicó un límite de tiempo.'] : []),
        ],
      }
    : {
        check: 'grant',
        status: 'pass',
        riskPoints: 0,
        userMessage: 'El tope y su intervalo están dentro de lo esperado.',
        reasons: [],
      }

  return {
    redirectUrl: hashInvalido
      ? '#/unirse/volver?ok=0'
      : `#/unirse/volver?ok=1&miembro=${encodeURIComponent(id)}`,
    grantWarning,
  }
}

export function finishJoin({ ok, memberId }: { ok: boolean; memberId: string }): Member | Verdict {
  const pendiente = joinsPendientes.get(memberId)
  if (!ok) {
    const idPendiente = memberId || ultimoJoinPendiente
    if (idPendiente) joinsPendientes.delete(idPendiente)
    if (idPendiente === ultimoJoinPendiente) ultimoJoinPendiente = null
    return {
      check: 'consent-hash',
      status: 'block',
      riskPoints: 100,
      userMessage: 'No pudimos confirmar que vienes de tu banco. No te uniste.',
      reasons: ['La confirmación del banco no es válida.'],
    }
  }
  if (!pendiente) throw new Error('Invitación no encontrada')
  joinsPendientes.delete(memberId)
  if (memberId === ultimoJoinPendiente) ultimoJoinPendiente = null

  const wallet = wallets.find((item) => item.id === pendiente.walletId)
  if (!wallet) throw new Error('Billetera no encontrada')
  wallet.members.push(pendiente.member)
  wallet.authorizedCapacity = {
    ...wallet.authorizedCapacity,
    value: (BigInt(wallet.authorizedCapacity.value) + BigInt(pendiente.member.cap.value)).toString(),
  }
  emitir({
    walletId: wallet.id,
    type: 'member-active',
    memberId: pendiente.member.id,
    message: `${pendiente.member.name} se unió al grupo`,
  })
  emitir({
    walletId: wallet.id,
    type: 'capacity-updated',
    amount: wallet.authorizedCapacity,
    message: 'Cupo del grupo actualizado tras unirse un miembro.',
  })
  return structuredClone(pendiente.member)
}

export function onEvents(walletId: string, cb: (e: WalletEvent) => void): () => void {
  const deLaBilletera = (listeners[walletId] ??= new Set())
  deLaBilletera.add(cb)
  return () => deLaBilletera.delete(cb)
}

function emitir(e: Omit<WalletEvent, 'ts'>): void {
  const evento: WalletEvent = { ...e, ts: Date.now() }
  for (const cb of listeners[e.walletId] ?? []) cb(structuredClone(evento))
}

function programar(ms: number, fn: () => void): void {
  timers.push(setTimeout(fn, ms))
}

export const _testEmitir = emitir
export const _testProgramar = programar

export function playEscenario1(stepMs = 1200): void {
  const wallet = wallets.find((w) => w.id === 'w-mama')
  if (!wallet) return

  for (const miembro of wallet.members) miembro.status = 'pending-approval'
  wallet.authorizedCapacity = cop(0)

  wallet.members.forEach((miembro, i) => {
    programar(stepMs * (i + 1), () => {
      miembro.status = 'active'
      emitir({
        walletId: 'w-mama',
        type: 'member-active',
        memberId: miembro.id,
        message: `${miembro.name} se unió al grupo`,
      })
    })
  })

  programar(stepMs * 4, () => {
    const capacidad = structuredClone(cuidadoDeMama.authorizedCapacity)
    wallet.authorizedCapacity = capacidad
    emitir({
      walletId: 'w-mama',
      type: 'capacity-updated',
      amount: capacidad,
      message: 'Cupo del grupo: $300.000. Nadie depositó nada.',
    })
  })
}

export function playEscenario3(stepMs = 1200): void {
  const walletId = 'w-mama'

  const nuevo: Spend = structuredClone(ataque)
  nuevo.status = 'requested'
  nuevo.risk = 0
  nuevo.verdicts = []

  spends[walletId] = [...spends[walletId].filter((s) => s.id !== nuevo.id), nuevo]

  emitir({
    walletId,
    type: 'spend-requested',
    spendId: nuevo.id,
    amount: nuevo.amount,
    message: 'Piden un gasto de $120.000 a una cuenta nueva',
  })

  programar(stepMs, () => {
    const gasto = spends[walletId].find((s) => s.id === nuevo.id)
    if (!gasto) return

    gasto.status = 'awaiting-approval'
    gasto.risk = 94
    gasto.verdicts = [structuredClone(destinoParecido)]
    gasto.approvals = []

    emitir({
      walletId,
      type: 'spend-reviewed',
      spendId: gasto.id,
      risk: 94,
      message: destinoParecido.userMessage,
    })
  })
}

function encontrarGastoYBilletera(spendId: string): { wallet: SharedWallet; spend: Spend } {
  for (const wallet of wallets) {
    const spend = spends[wallet.id]?.find((s) => s.id === spendId)
    if (spend) return { wallet, spend }
  }
  throw new Error('Gasto no encontrado')
}

function nombreDe(wallet: SharedWallet, memberId: string): string {
  return wallet.members.find((m) => m.id === memberId)?.name ?? memberId
}

function repartirIgual(amount: Money, n: number): Money[] {
  const total = BigInt(amount.value)
  const base = total / BigInt(n)
  const resto = Number(total % BigInt(n))
  return Array.from({ length: n }, (_, i) => ({ ...amount, value: (base + (i < resto ? 1n : 0n)).toString() }))
}

function montoMayor(a: Money, b: Money): boolean {
  return BigInt(a.value) > BigInt(b.value)
}

function normalizarDireccion(addr: string): string {
  return addr.toLowerCase().replace(/rn/g, 'm').replace(/1/g, 'l').replace(/0/g, 'o')
}

function distanciaEdicion(a: string, b: string): number {
  if (a === b) return 0
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array.from({ length: b.length }, () => 0),
  ])
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + costo)
    }
  }
  return dp[a.length][b.length]
}

function seParece(candidata: string, conocida: string): boolean {
  const a = normalizarDireccion(candidata)
  const b = normalizarDireccion(conocida)
  return a === b || distanciaEdicion(a, b) <= 2
}

// Revisión simulada del destino (no es el guardián real: valores propios del mock).
function revisarDestino(wallet: SharedWallet, walletAddress: string): { risk: number; verdicts: Verdict[] } {
  if (wallet.knownDestinations.some((d) => d.walletAddress === walletAddress)) {
    return { risk: 5, verdicts: [] }
  }

  const parecido = wallet.knownDestinations.find((d) => seParece(walletAddress, d.walletAddress))
  if (parecido) {
    return {
      risk: 94,
      verdicts: [
        {
          check: 'destination',
          status: 'warn',
          riskPoints: 94,
          userMessage: 'Esta cuenta se parece a la de la farmacia que usan siempre, pero no es la misma.',
          reasons: [`${walletAddress} ≈ ${parecido.walletAddress}`],
        },
      ],
    }
  }

  return {
    risk: 45,
    verdicts: [
      {
        check: 'destination',
        status: 'warn',
        riskPoints: 45,
        userMessage: 'Es una cuenta nueva para este grupo.',
        reasons: [`${walletAddress} no coincide con ningún destino conocido`],
      },
    ],
  }
}

let contadorGastos = 0

export function requestSpend(walletId: string, destination: Spend['destination'], amount: Money): Spend {
  const wallet = wallets.find((w) => w.id === walletId)
  if (!wallet) throw new Error('Billetera no encontrada')

  const activos = wallet.members.filter((m) => m.status === 'active')
  const partes = repartirIgual(amount, activos.length)
  const spend: Spend = {
    id: `s-${Date.now()}-${++contadorGastos}`,
    walletId,
    destination,
    amount,
    status: 'requested',
    risk: 0,
    verdicts: [],
    approvals: [],
    shares: activos.map((m, i) => ({ memberId: m.id, share: partes[i], status: 'pending' })),
    progress: { confirmed: 0, total: activos.length },
  }
  spends[walletId] = [...(spends[walletId] ?? []), spend]
  emitir({
    walletId,
    type: 'spend-requested',
    spendId: spend.id,
    amount,
    message: `Se pidió un gasto a ${destination.name}`,
  })

  const revision = revisarDestino(wallet, destination.walletAddress)
  spend.risk = revision.risk
  spend.verdicts = revision.verdicts
  emitir({
    walletId,
    type: 'spend-reviewed',
    spendId: spend.id,
    risk: spend.risk,
    message: revision.verdicts[0]?.userMessage ?? 'Destino conocido.',
  })

  const regla = wallet.rules.groupApproval
  if (spend.verdicts.length > 0 || montoMayor(amount, regla.aboveAmount)) {
    spend.status = 'awaiting-approval'
  } else {
    spend.status = 'approved'
    emitir({ walletId, type: 'spend-approved', spendId: spend.id, message: 'El grupo aprobó el gasto.' })
  }
  return structuredClone(spend)
}

function convertirAEur(montoCop: Money): Money {
  const pesos = Number(montoCop.value) / 10 ** montoCop.assetScale
  const centavosEur = Math.round(pesos * 0.00023 * 100)
  return { value: String(centavosEur), assetCode: 'EUR', assetScale: 2 }
}

// Fija el status final del gasto (y, si quedó pagado, reduce cupo/disponible) ANTES de
// notificar el último aporte, para que quien escuche el evento ya vea el resultado final.
function resolverPago(wallet: SharedWallet, spend: Spend): boolean {
  const huboFallos = spend.shares.some((s) => s.status === 'failed')
  if (huboFallos) {
    spend.status = 'incomplete'
    return false
  }

  spend.status = 'paid'
  wallet.authorizedCapacity = {
    ...wallet.authorizedCapacity,
    value: (BigInt(wallet.authorizedCapacity.value) - BigInt(spend.amount.value)).toString(),
  }
  for (const share of spend.shares) {
    const miembro = wallet.members.find((m) => m.id === share.memberId)
    if (miembro?.available && share.debit) {
      miembro.available = {
        ...miembro.available,
        value: (BigInt(miembro.available.value) - BigInt(share.debit.value)).toString(),
      }
    }
  }
  return true
}

function emitirCierre(wallet: SharedWallet, spend: Spend): void {
  emitir({ walletId: wallet.id, type: 'spend-paid', spendId: spend.id, amount: spend.amount, message: 'Gasto verificado' })
  emitir({
    walletId: wallet.id,
    type: 'capacity-updated',
    amount: wallet.authorizedCapacity,
    message: 'Cupo del grupo actualizado tras el pago.',
  })
}

function pagarAportes(wallet: SharedWallet, spend: Spend, shares: Spend['shares']): void {
  const stepMs = 1500
  shares.forEach((share, i) => {
    programar(stepMs * (i + 1), () => {
      if (share.memberId === falloMemberId) {
        share.status = 'failed'
        share.failReason = 'cupo insuficiente'
        falloMemberId = null
      } else {
        const miembro = wallet.members.find((m) => m.id === share.memberId)
        share.debit = miembro?.assetCode === 'EUR' ? convertirAEur(share.share) : structuredClone(share.share)
        share.received = structuredClone(share.share)
        share.status = 'paid'
        delete share.failReason
      }

      spend.progress = {
        confirmed: spend.shares.filter((s) => s.status === 'paid').length,
        total: spend.shares.length,
      }

      const todosListos = spend.shares.every((s) => s.status === 'paid' || s.status === 'failed')
      const quedoPagado = todosListos && resolverPago(wallet, spend)

      if (share.status === 'failed') {
        emitir({
          walletId: wallet.id,
          type: 'share-failed',
          spendId: spend.id,
          memberId: share.memberId,
          amount: share.share,
          message: `Falló el aporte de ${nombreDe(wallet, share.memberId)}: cupo insuficiente`,
        })
      } else {
        emitir({
          walletId: wallet.id,
          type: 'share-paid',
          spendId: spend.id,
          memberId: share.memberId,
          amount: share.share,
          message: `${nombreDe(wallet, share.memberId)} aportó`,
        })
      }

      if (quedoPagado) emitirCierre(wallet, spend)
    })
  })
}

export function executeSpend(spendId: string): void {
  const { wallet, spend } = encontrarGastoYBilletera(spendId)
  if (spend.status !== 'approved') {
    throw new Error(`El gasto no está aprobado (estado: ${spend.status})`)
  }
  spend.status = 'paying'
  pagarAportes(wallet, spend, spend.shares.filter((s) => s.status === 'pending'))
}

export function retryShare(spendId: string): void {
  const { wallet, spend } = encontrarGastoYBilletera(spendId)
  if (spend.status !== 'incomplete') {
    throw new Error(`El gasto no está incompleto (estado: ${spend.status})`)
  }
  spend.status = 'paying'
  const fallidos = spend.shares.filter((s) => s.status === 'failed')
  fallidos.forEach((s) => {
    s.status = 'pending'
    delete s.failReason
  })
  spend.progress = {
    confirmed: spend.shares.filter((s) => s.status === 'paid').length,
    total: spend.shares.length,
  }
  pagarAportes(wallet, spend, fallidos)
}

// Misma regla de votación que apps/api/src/wallet/engine.ts (castApproval).
export function castApproval(spendId: string, memberId: string, yes: boolean): Spend {
  const { wallet, spend } = encontrarGastoYBilletera(spendId)

  if (spend.status !== 'awaiting-approval') {
    throw new Error(`El gasto no está esperando aprobación (estado: ${spend.status})`)
  }

  const votantes = wallet.members.filter((m) => m.status === 'active')
  if (!votantes.some((m) => m.id === memberId)) throw new Error(`No es miembro activo: ${memberId}`)
  if (spend.approvals.some((a) => a.memberId === memberId)) throw new Error(`Ya votó: ${memberId}`)

  spend.approvals.push({ memberId, yes })
  emitir({
    walletId: wallet.id,
    type: 'approval-cast',
    spendId,
    memberId,
    message: yes ? 'Aprobó el gasto.' : 'Rechazó el gasto.',
  })

  const required = wallet.rules.groupApproval.approvalsRequired
  const yesCount = spend.approvals.filter((a) => a.yes).length
  const pending = votantes.length - spend.approvals.length

  if (yesCount >= required) {
    spend.status = 'approved'
    emitir({ walletId: wallet.id, type: 'spend-approved', spendId, message: 'El grupo aprobó el gasto.' })
  } else if (yesCount + pending < required) {
    spend.status = 'rejected'
    emitir({ walletId: wallet.id, type: 'spend-rejected', spendId, message: 'El grupo rechazó el gasto.' })
  }

  return structuredClone(spend)
}
