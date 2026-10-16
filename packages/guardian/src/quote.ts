import type { Guardian, Money, Verdict } from '../../../contracts/index.js'

type Params = Parameters<Guardian['checkQuote']>[0]

const pass = (reasons: string[]): Verdict =>
  ({ check: 'quote', status: 'pass', riskPoints: 0, userMessage: 'Cotización normal.', reasons })

const block = (percent: number, reasons: string[]): Verdict => ({
  check: 'quote', status: 'block', riskPoints: 100,
  userMessage: `Este aporte costaría ${Math.round(percent)}% más de lo normal. Gasto detenido.`,
  reasons,
})

/** Unidades mayores (p. ej. pesos, no centavos). Number es válido aquí: solo se usa en cocientes, nunca para sumar montos. */
const major = (m: Money): number => Number(m.value) / 10 ** m.assetScale

/**
 * Quien envía paga la comisión: la cotización fija receiveAmount y debitAmount trae lo que cuesta.
 * - Misma moneda: costo extra = (debit − receive) / receive.
 * - Monedas distintas con referenceRate: pérdida frente a la tasa de referencia.
 * - Monedas distintas sin referenceRate: no hay con qué comparar, así que no se bloquea.
 */
export function checkQuote({ debitAmount, receiveAmount, referenceRate, maxFeePercent }: Params): Verdict {
  if (debitAmount.assetCode === receiveAmount.assetCode) {
    if (BigInt(receiveAmount.value) <= 0n) return block(100, ['receiveAmount no es positivo: no se puede calcular la comisión'])

    // Porcentaje en centésimas con BigInt (montos exactos); solo el resultado final pasa a Number.
    const scale = Math.max(debitAmount.assetScale, receiveAmount.assetScale)
    const debit = BigInt(debitAmount.value) * 10n ** BigInt(scale - debitAmount.assetScale)
    const receive = BigInt(receiveAmount.value) * 10n ** BigInt(scale - receiveAmount.assetScale)
    const percent = Number(((debit - receive) * 10000n) / receive) / 100

    const detail = `costo extra ${percent.toFixed(2)}% (máximo permitido ${maxFeePercent}%)`
    return percent > maxFeePercent ? block(percent, [detail]) : pass([detail])
  }

  if (referenceRate === undefined || !Number.isFinite(referenceRate) || referenceRate <= 0) {
    return pass(['monedas distintas sin tasa de referencia: no se compara la comisión'])
  }

  const effectiveRate = major(receiveAmount) / major(debitAmount)
  const loss = ((referenceRate - effectiveRate) / referenceRate) * 100
  const detail = `pérdida ${loss.toFixed(2)}% frente a la tasa de referencia ${referenceRate} (máximo permitido ${maxFeePercent}%)`
  return loss > maxFeePercent ? block(loss, [detail]) : pass([detail])
}
