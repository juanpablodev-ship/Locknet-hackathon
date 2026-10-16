import { randomUUID } from 'node:crypto'
import type { Member, MembersService, Verdict } from '../contracts/index'
import { guardian } from '../packages/guardian/src/index.js'

/** SOLO simulación sin red. Las capacidades devueltas no son tokens de Open Payments. */
export function createMembersMock(initial: Member[] = [], errorIds: string[] = []): MembersService {
  const members = new Map(initial.map(member => [member.id, structuredClone(member)]))
  const failing = new Set(errorIds)
  const pending = new Map<string, { member: Member; kind: 'join' | 'confirm' }>()
  function active(id: string): Member {
    const member = members.get(id)
    if (failing.has(id)) throw new Error('Error de proveedor SIMULADO')
    if (!member || member.status !== 'active') throw new Error('Miembro SIMULADO no utilizable')
    return member
  }
  function verdict(valid: boolean): Verdict {
    return { check: 'consent-hash', status: valid ? 'pass' : 'block', riskPoints: valid ? 0 : 100,
      userMessage: 'Resultado SIMULADO; no verifica consentimiento real.', reasons: ['Sin conexión a Test Wallet'] }
  }
  function consume(p: Parameters<MembersService['finishJoin']>[0], kind: 'join' | 'confirm') {
    const entry = pending.get(p.state)
    if (!entry || entry.kind !== kind) throw new Error('Retorno SIMULADO inválido o ya utilizado')
    pending.delete(p.state)
    if (p.hash !== 'simulation-approved' || !p.interactRef) throw new Error('Consentimiento SIMULADO rechazado')
    return entry.member
  }
  return {
    async startJoin(walletId, input) {
      if (!walletId || !/^\d+$/.test(input.cap.value) || BigInt(input.cap.value) <= 0n) throw new Error('Solicitud SIMULADA inválida')
      const member: Member = { ...structuredClone(input), id: randomUUID(), status: 'pending-approval' }
      const state = randomUUID(); pending.set(state, { member, kind: 'join' })
      return { redirectUrl: `https://simulation.invalid/consent?state=${state}`,
        grantWarning: guardian.checkGrantRequest({ debitAmount: input.cap, interval: input.interval, policy: { maxCap: input.cap } }) }
    },
    async finishJoin(p) {
      const member = consume(p, 'join'); member.status = 'active'; members.set(member.id, member)
      return { member: structuredClone(member), hashVerdict: verdict(true) }
    },
    async available(id) { const member = active(id); return { ...(member.available ?? member.cap) } },
    async tokenFor(id) {
      const member = active(id)
      if (BigInt((member.available ?? member.cap).value) <= 0n) throw new Error('Cupo SIMULADO agotado')
      return `SIMULATION-ONLY:${id}`
    },
    async revoke(id) {
      const member = members.get(id)
      if (failing.has(id) || !member) throw new Error('Revocación SIMULADA fallida')
      member.status = 'revoked'; member.available = { ...member.cap, value: '0' }
    },
    async startWalletConfirm(id, request) {
      const member = active(id)
      if (!request.incomingPaymentUrl.startsWith('https://') || request.debit.assetCode !== member.assetCode || BigInt(request.debit.value) <= 0n) throw new Error('Confirmación SIMULADA inválida')
      const state = randomUUID(); pending.set(state, { member, kind: 'confirm' })
      return { redirectUrl: `https://simulation.invalid/confirm?state=${state}` }
    },
    async finishWalletConfirm(p) {
      const member = consume(p, 'confirm'); active(member.id)
      return { memberId: member.id, approved: true, token: `SIMULATION-SINGLE-PAYMENT:${randomUUID()}`, hashVerdict: verdict(true) }
    },
  }
}

export const membersMock: MembersService = createMembersMock()
