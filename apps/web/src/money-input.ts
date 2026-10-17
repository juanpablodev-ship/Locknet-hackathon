import type { Money } from '../../../contracts/index.js'

export function moneyFromMajor(input: string, assetCode: string, assetScale: number): Money {
  if (!/^\d+(?:[.,]\d+)?$/.test(input) || !Number.isInteger(assetScale) || assetScale < 0 || assetScale > 20) throw new Error('Monto o escala inválidos')
  const [whole, fraction = ''] = input.replace(',', '.').split('.')
  if (fraction.length > assetScale) throw new Error('El monto tiene demasiados decimales')
  const value = BigInt(whole) * 10n ** BigInt(assetScale) + BigInt(fraction.padEnd(assetScale, '0') || '0')
  if (value <= 0n) throw new Error('El monto debe ser positivo')
  return { value: String(value), assetCode, assetScale }
}
