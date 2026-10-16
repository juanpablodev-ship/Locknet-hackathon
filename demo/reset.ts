import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createDemoSeeds } from './seeds'
import { resetMembersStore, type MembersStore } from '../apps/api/src/members/member-operations'

/** R3 llama esto EN SU PROCESO y recrea el motor con las semillas devueltas. Sin red. */
export function resetDemo(store: MembersStore) {
  resetMembersStore(store)
  return { source: 'synthetic' as const, label: 'Modo respaldo — datos simulados', wallets: createDemoSeeds() }
}

/** CLI: reescribe SOLO demo/state.json, no reinicia por sí sola un servidor abierto. */
export async function writeDemoSnapshot(directory: string = __dirname): Promise<void> {
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'state.json'), JSON.stringify({ source: 'synthetic',
    label: 'Modo respaldo — datos simulados', wallets: createDemoSeeds() }, null, 2) + '\n', 'utf8')
}

if (require.main === module) writeDemoSnapshot().then(() => console.log('Semillas simuladas preparadas en demo/state.json; sin cambios de credenciales ni permisos externos.')).catch(() => {
  console.error('No se pudo preparar la demo local.'); process.exitCode = 1
})
