// Cálculos puros de la billetera: cupo del grupo, reparto y creación de gastos.
import type { Member, Money, SharedWallet, Spend } from '../../../../contracts'

function sameUnit(a: Money, b: Money): void {
  if (a.assetCode !== b.assetCode || a.assetScale !== b.assetScale) {
    throw new Error(`Montos no comparables: ${a.assetCode}/${a.assetScale} vs ${b.assetCode}/${b.assetScale}`)
  }
}

export function zero(like: Pick<Money, 'assetCode' | 'assetScale'>): Money {
  return { value: '0', assetCode: like.assetCode, assetScale: like.assetScale }
}

export function add(a: Money, b: Money): Money {
  sameUnit(a, b)
  return { ...a, value: (BigInt(a.value) + BigInt(b.value)).toString() }
}

export function gt(a: Money, b: Money): boolean {
  sameUnit(a, b)
  return BigInt(a.value) > BigInt(b.value)
}

// Cupo del grupo = suma de lo que le queda a cada miembro activo, en la moneda de la billetera.
// Es capacidad autorizada, NO saldo. `toWalletCurrency` convierte aportes en otra moneda (p. ej. EUR → COP).
export async function groupCapacity(
  wallet: SharedWallet,
  available: (memberId: string) => Promise<Money>,
  toWalletCurrency: (m: Money) => Money | Promise<Money>,
  walletScale = 2,
): Promise<Money> {
  let total = zero({ assetCode: wallet.currency, assetScale: walletScale })
  for (const m of activeMembers(wallet)) {
    const left = await available(m.id)
    total = add(total, left.assetCode === wallet.currency ? left : await toWalletCurrency(left))
  }
  return total
}

export function activeMembers(wallet: SharedWallet): Member[] {
  return wallet.members.filter((m) => m.status === 'active')
}

// Partes iguales en la moneda del destino. El residuo se reparte de a una unidad mínima
// empezando por el primero, para que la suma siempre dé el monto exacto.
export function splitEqual(amount: Money, n: number): Money[] {
  if (!Number.isInteger(n) || n < 1) throw new Error(`No se puede repartir entre ${n} miembros`)
  const total = BigInt(amount.value)
  const base = total / BigInt(n)
  const rest = Number(total % BigInt(n))
  return Array.from({ length: n }, (_, i) => ({ ...amount, value: (base + (i < rest ? 1n : 0n)).toString() }))
}

let counter = 0
export function newSpend(p: {
  wallet: SharedWallet
  destination: Spend['destination']
  amount: Money
  id?: string
}): Spend {
  const members = activeMembers(p.wallet)
  const parts = splitEqual(p.amount, members.length)
  return {
    id: p.id ?? `s-${Date.now()}-${++counter}`,
    walletId: p.wallet.id,
    destination: p.destination,
    amount: p.amount,
    status: 'requested',
    risk: 0,
    verdicts: [],
    approvals: [],
    shares: members.map((m, i) => ({ memberId: m.id, share: parts[i], status: 'pending' as const })),
    progress: { confirmed: 0, total: members.length },
  }
}
