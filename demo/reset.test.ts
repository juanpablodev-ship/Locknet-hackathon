import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDemoSeeds } from './seeds'
import { resetDemo, writeDemoSnapshot } from './reset'
import { createMembersStore } from '../apps/api/src/members/member-operations'
import simulated from '../fixtures/members.simulated.json'

describe('semillas y reinicio local de R1', () => {
  it('tres billeteras tipadas, independientes y explícitamente simuladas', () => {
    const seeds = createDemoSeeds()
    expect(seeds.map(w => w.kind)).toEqual(['care', 'goal', 'investment'])
    expect(new Set(seeds.flatMap(w => w.members.map(m => m.id))).size).toBe(9)
    expect(seeds.flatMap(w => w.members).every(m => new URL(m.walletAddress).hostname === 'simulation.invalid')).toBe(true)
    seeds[0].members[0].name = 'changed'
    expect(createDemoSeeds()[0].members[0].name).not.toBe('changed')
    expect(simulated.source).toBe('synthetic')
    expect(simulated.label).toContain('no respuestas grabadas')
  })
  it('reset es explícito, local y rechaza un almacén inválido', () => {
    expect(resetDemo(createMembersStore()).label).toContain('simulados')
    expect(() => resetDemo({ kind: 'members-memory' })).toThrow('inválido')
  })
  it('el script solo sobrescribe state.json y conserva archivos locales vecinos', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'locknet-r1-reset-'))
    const marker = join(directory, 'credentials-marker')
    try {
      await writeFile(marker, 'unchanged')
      await writeDemoSnapshot(directory)
      await writeDemoSnapshot(directory)
      expect(await readFile(marker, 'utf8')).toBe('unchanged')
      expect(JSON.parse(await readFile(join(directory, 'state.json'), 'utf8')).source).toBe('synthetic')
      await expect(writeDemoSnapshot(marker)).rejects.toThrow()
    } finally {
      await unlink(join(directory, 'state.json')); await unlink(marker); await rmdir(directory)
    }
  })
})
