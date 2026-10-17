import { OpenPaymentsClientError } from '@interledger/open-payments'

/** No conserva el error original: puede contener cabeceras, tokens o URLs privadas. */
export class PaymentError extends Error {
  constructor(message: string, readonly outcome: 'not-created' | 'unknown') { super(message) }
}
export function safePaymentError(error: unknown, creatingOutgoing = false): PaymentError {
  if (error instanceof PaymentError) return error
  const code = error instanceof OpenPaymentsClientError ? error.code : undefined
  const known: Record<string, string> = {
    insufficient_funds: 'El proveedor confirmó fondos insuficientes.',
    invalid_token: 'El proveedor rechazó el permiso; puede estar vencido o revocado.',
    quote_expired: 'La cotización venció.',
    payment_expired: 'El cobro venció.',
    insufficient_grant: 'El cupo del permiso no alcanza.',
  }
  const status = error instanceof OpenPaymentsClientError ? error.status : undefined
  const rejected = status !== undefined && [400, 401, 403, 404, 409, 422].includes(status)
  return new PaymentError((code && known[code]) || (rejected ? 'El proveedor rechazó la solicitud.' : 'Error temporal del proveedor; resultado no confirmado.'),
    creatingOutgoing && !rejected ? 'unknown' : 'not-created')
}
