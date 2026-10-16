import type { Member } from '../contracts/index'
import { createMembersMock } from '../mocks/members.mock'
import { remainingCapacity } from '../apps/api/src/members/member-operations'
import recording from '../fixtures/members.real.sanitized.json'

/** Respaldo OFFLINE. Reproduce gastos grabados; los miembros y consentimientos son simulados. */
export function createMembersBackup(mode: string | undefined, members: Member[]) {
  if (mode !== 'fixtures' || members.length === 0 || recording.source !== 'test-wallet-recording' || !recording.operations.available) {
    throw new Error('Respaldo de miembros no configurado')
  }
  const initial = members.map(member => ({ ...structuredClone(member),
    available: remainingCapacity(member.cap, recording.spentAmounts.spentDebitAmount) }))
  return {
    label: 'Modo respaldo — gastos reales grabados; miembros y consentimiento simulados',
    recordedAt: recording.observedAt,
    service: createMembersMock(initial),
  }
}
