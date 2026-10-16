// Simulado del guardián para R1-R4. checkDestination y riskScore son los reales; el resto son falsos simples.
import type { Guardian, Verdict } from '../contracts/index.js'
import { checkDestination, riskScore } from '../packages/guardian/src/index.js'

const verdict = (check: Verdict['check'], status: Verdict['status'], riskPoints: number, userMessage: string, reasons: string[] = []): Verdict =>
  ({ check, status, riskPoints, userMessage, reasons })

export const guardianMock: Guardian = {
  // hash === 'invalido' → camino de error para que R1 lo pruebe
  verifyInteractionHash: ({ hash }) =>
    hash === 'invalido'
      ? verdict('consent-hash', 'block', 100, 'No pudimos confirmar que vienes de tu banco. No te uniste.', ['hash de interacción inválido'])
      : verdict('consent-hash', 'pass', 0, 'Hash válido.'),
  checkGrantRequest: () => verdict('grant', 'pass', 0, 'Permiso normal.'),
  checkDestination,
  checkQuote: ({ debitAmount, receiveAmount }) =>
    debitAmount.assetCode === receiveAmount.assetCode && BigInt(debitAmount.value) * 100n > BigInt(receiveAmount.value) * 120n
      ? verdict('quote', 'block', 100, 'Le costaría más de 20% de lo normal. Gasto detenido.')
      : verdict('quote', 'pass', 0, 'Cotización normal.'),
  reconcile: ({ expected, received }) =>
    BigInt(received.value) >= BigInt(expected.value)
      ? verdict('reconcile', 'pass', 0, 'Llegó lo esperado.')
      : verdict('reconcile', 'warn', 50, 'Llegó menos de lo esperado.'),
  riskScore,
}
