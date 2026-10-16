// Ejemplo tipado del caso 1 "Cuidado de mamá" (plan v6, sección 4).
// Sirve para que el compilador verifique el contrato y como datos base para los simulados.
// Las wallet addresses y el riskThreshold son ilustrativos: cada rol usa sus valores reales.
// Montos con assetScale 2: "10000000" = $100.000,00 COP.
import type { Money, SharedWallet, Spend, Verdict } from './index'

const cop = (pesos: number): Money => ({ value: String(pesos * 100), assetCode: 'COP', assetScale: 2 })
const eur = (euros: number): Money => ({ value: String(euros * 100), assetCode: 'EUR', assetScale: 2 })

export const cuidadoDeMama: SharedWallet = {
  id: 'w-mama',
  name: 'Cuidado de mamá',
  currency: 'COP',
  kind: 'care',
  members: [
    { id: 'm-bogota', name: 'Hermano en Bogotá', walletAddress: 'https://ilp.interledger-test.dev/hermano_1',
      assetCode: 'COP', cap: cop(100_000), interval: 'R12/2026-10-16T00:00:00Z/P1M', available: cop(100_000), status: 'active' },
    { id: 'm-medellin', name: 'Hermana en Medellín', walletAddress: 'https://ilp.interledger-test.dev/hermano_2',
      assetCode: 'COP', cap: cop(100_000), interval: 'R12/2026-10-16T00:00:00Z/P1M', available: cop(100_000), status: 'active' },
    { id: 'm-madrid', name: 'Hermano en Madrid', walletAddress: 'https://ilp.interledger-test.dev/hermano_3',
      assetCode: 'EUR', cap: eur(22), interval: 'R12/2026-10-16T00:00:00Z/P1M', available: eur(22), status: 'active' },
  ],
  rules: {
    split: 'equal',
    groupApproval: { aboveAmount: cop(200_000), approvalsRequired: 2, riskThreshold: 60, confirmInWallet: false },
  },
  knownDestinations: [
    { name: 'Farmacia Medellín', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medellin' },
  ],
  authorizedCapacity: cop(300_000),
}

// Escenario 2: la medicina, $40.000 de cada hermano, ya verificada.
export const medicina: Spend = {
  id: 's-medicina',
  walletId: 'w-mama',
  destination: { name: 'Farmacia Medellín', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medellin' },
  amount: cop(120_000),
  status: 'paid',
  risk: 0,
  verdicts: [],
  approvals: [],
  shares: [
    { memberId: 'm-bogota', share: cop(40_000), debit: cop(40_000), received: cop(40_000), status: 'paid' },
    { memberId: 'm-medellin', share: cop(40_000), debit: cop(40_000), received: cop(40_000), status: 'paid' },
    { memberId: 'm-madrid', share: cop(40_000), received: cop(40_000), status: 'paid' },
  ],
  progress: { confirmed: 3, total: 3 },
}

// Escenario 3: destino parecido → 'warn' con riskPoints alto → EN APROBACIÓN (no BLOQUEADO).
export const destinoParecido: Verdict = {
  check: 'destination',
  status: 'warn',
  riskPoints: 94,
  userMessage: 'Esta cuenta se parece a la de la farmacia que usan siempre, pero no es la misma.',
  reasons: ['farmacia-medel1in ≈ farmacia-medellin (1→l)'],
}

// Prueba negativa: el compilador debe rechazar valores fuera del contrato.
// Si alguna de estas líneas deja de dar error, typecheck falla.
// @ts-expect-error 'blocked' no es un Status válido (es 'block')
export const _statusInvalido: Verdict = { ...destinoParecido, status: 'blocked' }
// @ts-expect-error 'saldo' no existe en SharedWallet: es authorizedCapacity
export const _saldo: SharedWallet = { ...cuidadoDeMama, saldo: cop(300_000) }

export const ataque: Spend = {
  id: 's-ataque',
  walletId: 'w-mama',
  destination: { name: 'Farmacia (cuenta nueva)', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medel1in' },
  amount: cop(120_000),
  status: 'awaiting-approval',
  risk: 94,
  verdicts: [destinoParecido],
  approvals: [],
  shares: [
    { memberId: 'm-bogota', share: cop(40_000), status: 'pending' },
    { memberId: 'm-medellin', share: cop(40_000), status: 'pending' },
    { memberId: 'm-madrid', share: cop(40_000), status: 'pending' },
  ],
  progress: { confirmed: 0, total: 3 },
}
