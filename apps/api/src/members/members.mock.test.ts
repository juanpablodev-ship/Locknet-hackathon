import { describe, expect, it } from 'vitest'
import type { Member } from '../../../../contracts/index'
import { createMembersMock } from '../../../../mocks/members.mock'

const member: Member = { id: 'active', name: 'Miembro simulado', walletAddress: 'https://simulation.invalid/member',
  assetCode: 'COP', cap: { value: '10000', assetCode: 'COP', assetScale: 2 }, interval: 'R3/2026-10-16T00:00:00Z/P1M', status: 'active' }

describe('simulado explícito de MembersService', () => {
  it('miembro activo, revocado, agotado y proveedor con error son distintos', async () => {
    const service = createMembersMock([member, { ...member, id: 'revoked', status: 'revoked' },
      { ...member, id: 'empty', available: { ...member.cap, value: '0' } }, { ...member, id: 'error' }], ['error'])
    expect(await service.available('active')).toEqual(member.cap)
    expect(await service.tokenFor('active')).toContain('SIMULATION-ONLY:')
    await expect(service.tokenFor('revoked')).rejects.toThrow('no utilizable')
    await expect(service.tokenFor('empty')).rejects.toThrow('agotado')
    await expect(service.available('error')).rejects.toThrow('SIMULADO')
    await service.revoke('active'); await service.revoke('active')
    await expect(service.available('active')).rejects.toThrow()
    await expect(service.revoke('unknown')).rejects.toThrow()
  })
  it('unión simulada, rechazo de hash y callback repetido', async () => {
    const service = createMembersMock()
    const start = await service.startJoin('group', member)
    expect(new URL(start.redirectUrl).hostname).toBe('simulation.invalid')
    const state = new URL(start.redirectUrl).searchParams.get('state')!
    const p = { state, interactRef: 'simulation-reference', hash: 'simulation-approved' }
    expect((await service.finishJoin(p)).hashVerdict.userMessage).toContain('SIMULADO')
    await expect(service.finishJoin(p)).rejects.toThrow('ya utilizado')
    const next = await service.startJoin('group', member)
    await expect(service.finishJoin({ ...p, state: new URL(next.redirectUrl).searchParams.get('state')!, hash: 'invalid' })).rejects.toThrow('rechazado')
    await expect(service.startJoin('', member)).rejects.toThrow()
  })
  it('confirmación simulada tiene capacidad distinta de la mensual y rechaza callbacks cruzados', async () => {
    const service = createMembersMock([member])
    const start = await service.startWalletConfirm(member.id, { incomingPaymentUrl: 'https://simulation.invalid/incoming', debit: member.cap })
    const p = { state: new URL(start.redirectUrl).searchParams.get('state')!, interactRef: 'simulation-reference', hash: 'simulation-approved' }
    await expect(service.finishJoin(p)).rejects.toThrow()
    const result = await service.finishWalletConfirm(p)
    expect(result.approved).toBe(true)
    expect(result.token).not.toBe(await service.tokenFor(member.id))
    await expect(service.finishWalletConfirm(p)).rejects.toThrow()
    await expect(service.startWalletConfirm(member.id, { incomingPaymentUrl: 'http://invalid', debit: member.cap })).rejects.toThrow()
  })
})
