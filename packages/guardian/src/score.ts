import type { Verdict } from '../../../contracts/index.js'

/** Puntaje de 0 a 100: cualquier 'block' → 100; si no, suma de riskPoints con tope 100. */
export function riskScore(verdicts: Verdict[]): number {
  if (verdicts.some((v) => v.status === 'block')) return 100
  return Math.min(100, verdicts.reduce((total, v) => total + v.riskPoints, 0))
}
