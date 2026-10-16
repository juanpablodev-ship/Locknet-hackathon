import type { Guardian } from '../../../contracts/index.js'
import { checkDestination } from './destination.js'
import { checkGrantRequest } from './grant.js'
import { verifyInteractionHash } from './hash.js'
import { checkQuote } from './quote.js'
import { reconcile } from './reconcile.js'
import { riskScore } from './score.js'

export { checkDestination, LOOKALIKE_POINTS, NEW_DESTINATION_POINTS } from './destination.js'
export { checkGrantRequest } from './grant.js'
export { verifyInteractionHash } from './hash.js'
export { checkQuote } from './quote.js'
export { reconcile } from './reconcile.js'
export { riskScore } from './score.js'
export { compareHandles, editDistance, explainComparison, normalizeHandle, parseAddress } from './address.js'
export type { ComparisonDetail, HandleComparison, ParsedAddress } from './address.js'

/** El guardián completo, tipado contra el contrato: si falta una función o cambia una firma, tsc falla. */
export const guardian: Guardian = {
  verifyInteractionHash,
  checkGrantRequest,
  checkDestination,
  checkQuote,
  reconcile,
  riskScore,
}
