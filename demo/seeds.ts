import type { SharedWallet } from '../contracts/index'
import { cuidadoDeMama } from '../contracts/ejemplo'

/** Configuraciones de demostración; ninguna dirección autoriza pagos reales. */
export function createDemoSeeds(): SharedWallet[] {
  const care = structuredClone(cuidadoDeMama)
  care.name = 'Medicinas de mamá'
  for (const member of care.members) member.walletAddress = `https://simulation.invalid/members/${member.id}`
  for (const destination of care.knownDestinations) destination.walletAddress = 'https://simulation.invalid/pharmacy'
  const park: SharedWallet = { ...structuredClone(care), id: 'w-parque', name: 'Arreglo del parque', kind: 'goal',
    rules: { ...structuredClone(care.rules), goal: { amount: { value: '15000000', assetCode: 'COP', assetScale: 2 }, deadline: '2026-10-31T23:59:59Z' } } }
  const bakery: SharedWallet = { ...structuredClone(care), id: 'w-horno', name: 'Horno de la panadería', kind: 'investment',
    rules: { ...structuredClone(care.rules), return: { fromWalletAddress: 'https://simulation.invalid/bakery', percentPerSale: 10,
      cap: { value: '150000000', assetCode: 'COP', assetScale: 2 } } } }
  // Identidades independientes por grupo, incluso en la simulación.
  for (const group of [park, bakery]) for (const member of group.members) member.id = `${group.id}-${member.id}`
  return [care, park, bakery]
}
