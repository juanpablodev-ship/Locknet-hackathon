// Simulado de la API web (R4). Primer paso sin depender de nadie: api.mock con datos
// que cumplen el contrato de /contracts. Cambiar de simulado a real es cambiar una
// línea de importación (sección 14 del plan).
import type { Money, SharedWallet, Spend } from '../contracts/index.js'
import { cuidadoDeMama, medicina } from '../contracts/ejemplo.js'

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

export function resetMock(): void {
  wallets = structuredClone(WALLETS_INICIALES)
  spends = structuredClone(SPENDS_INICIALES)
}
