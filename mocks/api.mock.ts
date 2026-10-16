// Simulado de la API web (R4). Primer paso sin depender de nadie: api.mock con datos
// que cumplen el contrato de /contracts. Cambiar de simulado a real es cambiar una
// línea de importación (sección 14 del plan).
import type { Money, SharedWallet, Spend, WalletEvent } from '../contracts/index.js'
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

export function resetMock(): void {
  wallets = structuredClone(WALLETS_INICIALES)
  spends = structuredClone(SPENDS_INICIALES)
  for (const id of timers) clearTimeout(id)
  timers = []
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
