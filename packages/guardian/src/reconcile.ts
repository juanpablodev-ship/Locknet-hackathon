import type { Guardian, Money, Verdict } from '../../../contracts/index.js'
import { compareMoney, formatMoney } from './money.js'

type Params = Parameters<Guardian['reconcile']>[0]

const verdict = (status: Verdict['status'], riskPoints: number, userMessage: string, reasons: string[]): Verdict =>
  ({ check: 'reconcile', status, riskPoints, userMessage, reasons })

/** expected − received, en la escala más fina de los dos. */
function difference(expected: Money, received: Money): Money {
  const scale = Math.max(expected.assetScale, received.assetScale)
  const e = BigInt(expected.value) * 10n ** BigInt(scale - expected.assetScale)
  const r = BigInt(received.value) * 10n ** BigInt(scale - received.assetScale)
  return { value: (e - r).toString(), assetCode: expected.assetCode, assetScale: scale }
}

/** Que haya llegado lo cotizado. Solo un 'pass' permite mostrar "pagado". */
export function reconcile({ expected, received }: Params): Verdict {
  if (expected.assetCode !== received.assetCode) {
    return verdict('warn', 50, 'No pudimos verificar lo que llegó.',
      [`monedas distintas: se esperaba ${expected.assetCode} y llegó ${received.assetCode}`])
  }
  if (compareMoney(received, expected) >= 0) {
    return verdict('pass', 0, `Gasto verificado: llegaron ${formatMoney(received)}.`,
      [`llegó ${formatMoney(received)} y se esperaba ${formatMoney(expected)}`])
  }
  const missing = difference(expected, received)
  return verdict('warn', 50,
    `Llegaron ${formatMoney(received)} de ${formatMoney(expected)}. Falta ${formatMoney(missing)}.`,
    [`faltan ${formatMoney(missing)} para completar lo esperado`])
}
