import { describe, expect, it } from 'vitest'
import { createMembersBackup } from './members-backup'
import { createDemoSeeds } from './seeds'

describe('respaldo offline con procedencia explícita', () => {
  it('reproduce gastos grabados sin usar una capacidad real de pago', async () => {
    const members = createDemoSeeds()[0].members
    const backup = createMembersBackup('fixtures', members)
    expect(backup.label).toContain('consentimiento simulados')
    expect(await backup.service.available(members[0].id)).toEqual(members[0].cap)
    expect(await backup.service.tokenFor(members[0].id)).toMatch(/^SIMULATION-ONLY:/)
    await backup.service.revoke(members[0].id)
    await expect(backup.service.tokenFor(members[0].id)).rejects.toThrow()
  })
  it('rechaza modo distinto y ausencia de miembros', () => {
    expect(() => createMembersBackup(undefined, createDemoSeeds()[0].members)).toThrow()
    expect(() => createMembersBackup('fixtures', [])).toThrow()
  })
})
