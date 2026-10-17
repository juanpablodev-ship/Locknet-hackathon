// Servicios falsos SOLO para las pruebas del motor. No son los simulados de /mocks:
// se reemplazan por /mocks/*.mock.ts (R1, R2, R5) o por los servicios reales a las 15:00.
import type { Guardian, Money, PaymentsService, Verdict } from '../../../../contracts'
import { PaymentError } from '../payments/errors'
import { add, zero } from './model'

export const cop = (pesos: number): Money => ({ value: String(pesos * 100), assetCode: 'COP', assetScale: 2 })

const verdict = (check: Verdict['check'], status: Verdict['status'], riskPoints: number, userMessage: string): Verdict =>
  ({ check, status, riskPoints, userMessage, reasons: [] })

export const fakeGuardian: Guardian = {
  verifyInteractionHash: () => verdict('consent-hash', 'pass', 0, 'Hash válido.'),
  checkGrantRequest: () => verdict('grant', 'pass', 0, 'Permiso normal.'),
  checkDestination: ({ walletAddress, known }) => {
    if (!walletAddress.startsWith('https://')) return verdict('destination', 'block', 100, 'Destino sin HTTPS.')
    if (known.some((k) => k.walletAddress === walletAddress)) return verdict('destination', 'pass', 0, 'Destino conocido.')
    if (walletAddress.endsWith('medel1in')) return verdict('destination', 'warn', 94, 'Se parece a la farmacia, pero no es la misma.')
    return verdict('destination', 'warn', 20, 'Destino nuevo.')
  },
  checkQuote: ({ debitAmount, receiveAmount }) =>
    debitAmount.assetCode === receiveAmount.assetCode && BigInt(debitAmount.value) * 100n > BigInt(receiveAmount.value) * 120n
      ? verdict('quote', 'block', 100, 'Le costaría más de 20% de lo normal. Gasto detenido.')
      : verdict('quote', 'pass', 0, 'Cotización normal.'),
  reconcile: ({ expected, received }) =>
    BigInt(received.value) >= BigInt(expected.value)
      ? verdict('reconcile', 'pass', 0, 'Llegó lo esperado.')
      : verdict('reconcile', 'warn', 50, 'Llegó menos de lo esperado.'),
  riskScore: (vs) => (vs.some((v) => v.status === 'block') ? 100 : Math.min(100, vs.reduce((n, v) => n + v.riskPoints, 0))),
}

// Pagos falsos configurables por miembro. Lleva la cuenta de lo recibido por cobro.
export function fakePayments(opts: {
  failMember?: Record<string, string>          // memberId → motivo (lanza error al pagar)
  trackAs?: Record<string, 'completed' | 'failed' | 'pending'>
  feePercent?: Record<string, number>          // memberId → comisión en la cotización
  shortReceive?: boolean                        // el destino recibe 1 unidad menos por aporte
  receivedFails?: boolean                       // la consulta de lo recibido no responde
  failWith?: Record<string, unknown>            // memberId → error exacto que lanza payShare
  incomingFails?: unknown                       // error exacto que lanza createIncoming
} = {}) {
  const received = new Map<string, Money>()
  const quotes = new Map<string, { memberId: string; url: string; receive: Money }>()
  const outgoing = new Map<string, { memberId: string; url: string; receive: Money }>()
  let n = 0
  const calls = { createIncoming: [] as Money[], payShare: 0 }
  const accounted = new Set<string>()

  const svc: PaymentsService = {
    async createIncoming(_walletAddress, amount) {
      calls.createIncoming.push(amount)
      if (opts.incomingFails !== undefined) throw opts.incomingFails
      const url = `https://cobro/${++n}`
      received.set(url, zero(amount))
      return { incomingPaymentUrl: url }
    },
    async quoteShare(memberId, url, share) {
      const fee = BigInt(opts.feePercent?.[memberId] ?? 0)
      const debit = { ...share, value: ((BigInt(share.value) * (100n + fee)) / 100n).toString() }
      const quoteId = `q-${++n}`
      quotes.set(quoteId, { memberId, url, receive: share })
      return { quoteId, debitAmount: debit, receiveAmount: share }
    },
    async payShare(memberId, quoteId) {
      calls.payShare++
      if (opts.failWith && memberId in opts.failWith) throw opts.failWith[memberId]
      if (opts.failMember?.[memberId]) throw new PaymentError(opts.failMember[memberId], 'not-created')
      const outgoingId = `o-${++n}`
      outgoing.set(outgoingId, quotes.get(quoteId)!)
      return { outgoingId }
    },
    async track(outgoingId) {
      const o = outgoing.get(outgoingId)!
      const state = opts.trackAs?.[o.memberId] ?? 'completed'
      if (state === 'completed' && !accounted.has(outgoingId)) {
        accounted.add(outgoingId)
        const got = opts.shortReceive ? { ...o.receive, value: (BigInt(o.receive.value) - 1n).toString() } : o.receive
        received.set(o.url, add(received.get(o.url)!, got))
      }
      return state
    },
    async received(url) {
      if (opts.receivedFails) throw new Error('sin respuesta')
      return received.get(url)!
    },
    async distributeReturn() {},
  }
  return { svc, calls, opts }
}
