import type { Money, SpendStatus } from '../../../contracts/index.js'

const SIMBOLOS: Record<string, string> = {
  COP: '$',
  EUR: '€',
  USD: 'US$'
}

export function formatMoney(m: Money): string {
  const valor = Number(m.value) / 10 ** m.assetScale
  const d = m.assetCode === 'COP' ? 0 : 2
  const numero = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  }).format(valor)

  const simbolo = SIMBOLOS[m.assetCode]
  if (simbolo) return `${simbolo}${numero}`
  return `${m.assetCode} ${numero}`
}

const BANDERAS: Record<string, string> = {
  COP: '🇨🇴',
  EUR: '🇪🇸',
  USD: '🇺🇸'
}

export function flagFor(assetCode: string): string {
  return BANDERAS[assetCode] ?? '🏳️'
}

export function riskLevel(score: number): { label: string; tone: 'verde' | 'ambar' | 'rojo' } {
  if (score < 40) return { label: 'Riesgo bajo', tone: 'verde' }
  if (score < 70) return { label: 'Riesgo medio', tone: 'ambar' }
  return { label: 'Riesgo alto', tone: 'rojo' }
}

export function progressText(p: { confirmed: number; total: number }, missingNames: string[]): string {
  const base = `${p.confirmed} de ${p.total} aportes confirmados`

  if (missingNames.length === 0) return base
  if (missingNames.length === 1) return `${base} · falta ${missingNames[0]}`

  const resto = missingNames.slice(0, -1).join(', ')
  const ultimo = missingNames[missingNames.length - 1]
  return `${base} · faltan ${resto} y ${ultimo}`
}

const ESTADOS: Record<SpendStatus, string> = {
  requested: 'Solicitado',
  'awaiting-approval': 'Esperando aprobación del grupo',
  approved: 'Aprobado',
  blocked: 'Bloqueado',
  paying: 'Pagando',
  paid: 'Pagado',
  rejected: 'Rechazado por el grupo',
  incomplete: 'Incompleto'
}

export function statusLabel(s: SpendStatus): string {
  return ESTADOS[s]
}
