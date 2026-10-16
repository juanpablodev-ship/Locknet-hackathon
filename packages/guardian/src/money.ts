import type { Money } from '../../../contracts/index.js'

const pow10 = (n: number): bigint => 10n ** BigInt(n)

/** -1 | 0 | 1. Exige el mismo assetCode; normaliza assetScale distintos con BigInt. */
export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  if (a.assetCode !== b.assetCode) {
    throw new Error(`No se pueden comparar ${a.assetCode} con ${b.assetCode}`)
  }
  const scale = Math.max(a.assetScale, b.assetScale)
  const x = BigInt(a.value) * pow10(scale - a.assetScale)
  const y = BigInt(b.value) * pow10(scale - b.assetScale)
  return x < y ? -1 : x > y ? 1 : 0
}

/** "$5.000.000 COP": punto de miles; coma y decimales solo si no son 0. */
export function formatMoney(m: Money): string {
  const total = BigInt(m.value)
  const negative = total < 0n
  const abs = negative ? -total : total
  const unit = pow10(m.assetScale)
  const whole = (abs / unit).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const fraction = (abs % unit).toString().padStart(m.assetScale, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}$${whole}${fraction ? ',' + fraction : ''} ${m.assetCode}`
}
