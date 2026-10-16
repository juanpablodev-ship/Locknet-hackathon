import type { Verdict } from '../../../contracts/index.js'
import { explainComparison, parseAddress } from './address.js'

export const LOOKALIKE_POINTS = 94
export const NEW_DESTINATION_POINTS = 20

const verdict = (status: Verdict['status'], riskPoints: number, userMessage: string, reason: string): Verdict =>
  ({ check: 'destination', status, riskPoints, userMessage, reasons: [reason] })

export function checkDestination(p: {
  walletAddress: string
  known: { name: string; walletAddress: string }[]
}): Verdict {
  if (!parseAddress(p.walletAddress).isHttps) {
    return verdict('block', 100, 'Este destino no usa una conexión segura. Gasto bloqueado.',
      `el destino no usa https: ${p.walletAddress}`)
  }

  const compared = p.known.map((k) => ({ k, ...explainComparison(p.walletAddress, k.walletAddress) }))

  const same = compared.find((c) => c.result === 'same')
  if (same) {
    return verdict('pass', 0, `Destino conocido: ${same.k.name}.`, `coincide exactamente con ${same.k.name}`)
  }

  const lookalike = compared.find((c) => c.result === 'lookalike')
  if (lookalike) {
    return verdict('warn', LOOKALIKE_POINTS,
      `Esta cuenta se parece a la de ${lookalike.k.name}, pero no es la misma.`, lookalike.reason)
  }

  return verdict('warn', NEW_DESTINATION_POINTS, 'Es la primera vez que el grupo le paga a este destino.',
    `no coincide ni se parece a ninguno de los ${p.known.length} destinos conocidos`)
}
