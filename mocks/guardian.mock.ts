// Simulado del guardián para R1-R4: solo verifyInteractionHash es falso; el resto son las funciones reales de packages/guardian.
import type { Guardian, Verdict } from '../contracts/index.js'
import { checkDestination, checkGrantRequest, checkQuote, reconcile, riskScore } from '../packages/guardian/src/index.js'

const verdict = (check: Verdict['check'], status: Verdict['status'], riskPoints: number, userMessage: string, reasons: string[] = []): Verdict =>
  ({ check, status, riskPoints, userMessage, reasons })

export const guardianMock: Guardian = {
  // hash === 'invalido' → camino de error para que R1 lo pruebe
  verifyInteractionHash: ({ hash }) =>
    hash === 'invalido'
      ? verdict('consent-hash', 'block', 100, 'No pudimos confirmar que vienes de tu banco. No te uniste.', ['hash de interacción inválido'])
      : verdict('consent-hash', 'pass', 0, 'Hash válido.'),
  checkGrantRequest,
  checkDestination,
  checkQuote,
  reconcile,
  riskScore,
}
