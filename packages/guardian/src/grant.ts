import type { Guardian, Verdict } from '../../../contracts/index.js'
import { compareMoney, formatMoney } from './money.js'

type Params = Parameters<Guardian['checkGrantRequest']>[0]

// El snippet oficial usa "R/2016-08-24T08:00:00Z/P1D": la R puede ir sin número.
const INTERVAL = /^R\d*\/[^/]+\/P/

interface Problem {
  points: number
  message: string
  reason: string
}

export function checkGrantRequest({ debitAmount, interval, policy }: Params): Verdict {
  // Orden = prioridad ante un empate de puntos.
  const problems: Problem[] = []
  const noTime = !interval ? ' sin límite de tiempo' : ''

  if (!debitAmount) {
    problems.push({ points: 80, message: `Esta billetera te pide autorizar pagos sin tope${noTime ? ' y' + noTime : ''}.`, reason: 'no hay debitAmount: sin tope' })
  } else if (debitAmount.assetCode !== policy.maxCap.assetCode) {
    problems.push({
      points: 30, message: 'No pudimos comparar el tope con lo normal.',
      reason: `assetCode ${debitAmount.assetCode} distinto de ${policy.maxCap.assetCode}`,
    })
  } else if (compareMoney(debitAmount, policy.maxCap) > 0) {
    problems.push({
      points: 60,
      message: `Esta billetera te pide autorizar hasta ${formatMoney(debitAmount)}${noTime}. Es mucho más de lo normal.`,
      reason: `debitAmount ${formatMoney(debitAmount)} supera el tope ${formatMoney(policy.maxCap)}`,
    })
  }

  if (!interval) {
    problems.push({ points: 40, message: 'El permiso no tiene límite de tiempo.', reason: 'no hay interval' })
  } else if (!INTERVAL.test(interval)) {
    problems.push({ points: 30, message: 'El intervalo del permiso no tiene un formato válido.', reason: `interval no cumple R<n>/<inicio>/P<duración>: ${interval}` })
  }

  if (problems.length === 0) {
    return { check: 'grant', status: 'pass', riskPoints: 0, userMessage: 'El permiso pide un tope normal.', reasons: [] }
  }

  // El más grave: más puntos; ante un empate, el primero de la lista.
  const worst = problems.reduce((a, b) => (b.points > a.points ? b : a))

  return {
    check: 'grant',
    status: 'warn',
    riskPoints: Math.min(100, problems.reduce((n, p) => n + p.points, 0)),
    userMessage: worst.message,
    reasons: problems.map((p) => p.reason),
  }
}
