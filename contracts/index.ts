// Contrato compartido — plan v6, sección 11.
// Solo R3 lo cambia, y con aviso al grupo. Nadie copia ni redefine estos tipos: se importan.
//   import type { Money, Spend, ... } from '<ruta>/contracts'

// ---------- Comunes ----------
export interface Money { value: string; assetCode: string; assetScale: number }

// ---------- Guardián (R5) ----------
export type Status = 'pass' | 'warn' | 'block'
// 'block' = objetivamente falso (hash inválido, destino sin HTTPS) → el gasto queda BLOQUEADO.
// Destino parecido = 'warn' con riskPoints alto → el gasto pasa a EN APROBACIÓN (escenario 3).
export interface Verdict {
  check: 'consent-hash' | 'grant' | 'destination' | 'quote' | 'reconcile'
  status: Status
  riskPoints: number          // aporte al puntaje
  userMessage: string         // español claro
  reasons: string[]           // detalle técnico
}
export interface Guardian {
  // grantUri = URL EXACTA del servidor de autorización usada en grant.request (no la de continue)
  verifyInteractionHash(p: { clientNonce: string; interactNonce: string; interactRef: string; grantUri: string; hash: string }): Verdict
  checkGrantRequest(p: { debitAmount?: Money; interval?: string; policy: { maxCap: Money } }): Verdict
  checkDestination(p: { walletAddress: string; known: { name: string; walletAddress: string }[] }): Verdict
  checkQuote(p: { debitAmount: Money; receiveAmount: Money; referenceRate?: number; maxFeePercent: number }): Verdict
  reconcile(p: { expected: Money; received: Money }): Verdict
  riskScore(verdicts: Verdict[]): number   // suma de riskPoints, tope 100; cualquier 'block' → 100
}

// ---------- Billetera ----------
export type MemberStatus = 'pending-approval' | 'active' | 'revoked' | 'expired'
export type SpendStatus = 'requested' | 'awaiting-approval' | 'approved' | 'blocked'
                        | 'paying' | 'paid' | 'rejected' | 'incomplete'

export interface Member {
  id: string; name: string; walletAddress: string; assetCode: string
  cap: Money; interval?: string; available?: Money; status: MemberStatus
}

export interface Rules {
  split: 'equal' | 'proportional-to-cap'
  groupApproval: {                      // inspirada en la multifirma; la aplica la plataforma
    aboveAmount: Money; approvalsRequired: number; riskThreshold: number  // riesgo ≥ umbral → exige aprobación
    confirmInWallet: boolean            // true → permiso de un solo pago con limits.receiver (sección 6.1)
  }
  goal?: { members?: number; amount?: Money; deadline: string }        // caso 2: parque
  return?: { fromWalletAddress: string; percentPerSale: number; cap: Money }  // caso 3: panadería
}

export interface SharedWallet {
  id: string; name: string; currency: string
  kind: 'care' | 'goal' | 'investment' // mismo motor, distinta configuración
  members: Member[]; rules: Rules
  knownDestinations: { name: string; walletAddress: string }[]
  authorizedCapacity: Money            // cupo del grupo: capacidad autorizada, NO saldo
}

export interface Spend {
  id: string; walletId: string
  destination: { name: string; walletAddress: string }
  amount: Money; status: SpendStatus
  risk: number; verdicts: Verdict[]
  approvals: { memberId: string; yes: boolean }[]
  shares: { memberId: string; share: Money; debit?: Money; received?: Money
            status: 'pending' | 'paid' | 'failed'; failReason?: string }[]
  progress: { confirmed: number; total: number }   // "2 de 3 aportes confirmados"
}

// ---------- Servicios ----------
export interface MembersService {      // R1
  startJoin(walletId: string, member: Omit<Member, 'id' | 'status'>): Promise<{ redirectUrl: string; grantWarning: Verdict }>
  finishJoin(p: { interactRef: string; hash: string; state: string }): Promise<{ member: Member; hashVerdict: Verdict }>
  available(memberId: string): Promise<Money>
  revoke(memberId: string): Promise<void>
  tokenFor(memberId: string): Promise<string>   // solo lo usa R2 en el servidor
  // P2 (sección 6.1): permiso de un solo pago con destino fijo, aprobado en la wallet del miembro
  startWalletConfirm(memberId: string, p: { incomingPaymentUrl: string; debit: Money }): Promise<{ redirectUrl: string }>
  finishWalletConfirm(p: { interactRef: string; hash: string; state: string }): Promise<{ memberId: string; approved: boolean; token?: string; hashVerdict: Verdict }>
}

export interface PaymentsService {     // R2
  createIncoming(walletAddress: string, amount: Money): Promise<{ incomingPaymentUrl: string }>
  quoteShare(memberId: string, incomingPaymentUrl: string, share: Money): Promise<{ quoteId: string; debitAmount: Money; receiveAmount: Money }>
  payShare(memberId: string, quoteId: string): Promise<{ outgoingId: string }>
  track(outgoingId: string): Promise<'pending' | 'completed' | 'failed'>
  received(incomingPaymentUrl: string): Promise<Money>
  distributeReturn(rule: Rules['return'], sale: Money, investors: Member[]): Promise<void>
}

// ---------- Eventos para la web (R3 emite, R4 escucha) ----------
export interface WalletEvent {
  walletId: string
  type: 'member-active' | 'member-revoked' | 'capacity-updated'
      | 'spend-requested' | 'spend-reviewed' | 'approval-cast' | 'wallet-confirm-requested' | 'spend-approved'
      | 'spend-blocked' | 'spend-rejected' | 'share-paid' | 'share-failed'
      | 'spend-paid' | 'goal-reached' | 'goal-failed' | 'return-paid'
  spendId?: string; memberId?: string; amount?: Money; risk?: number
  message: string; ts: number
}
