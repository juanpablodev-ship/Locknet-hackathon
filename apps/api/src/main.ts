// Arranque real de la API (R3): npm run dev:api  (tsx --env-file=.env apps/api/src/main.ts)
// Guardián real (R5) + unirse real (MembersService de R1) + motor y API (R3).
// DEMO_MODE=fixtures: modo respaldo de R1, sin SDK ni Test Wallet, con etiqueta explícita.
// Pagos: pendientes del PR #2 de R2; mientras tanto cada aporte falla con un motivo claro.
import { createAuthenticatedClient } from '@interledger/open-payments'
import type { Money, PaymentsService, SharedWallet } from '../../../contracts'
import { cuidadoDeMama } from '../../../contracts/ejemplo'
import { createMembersBackup } from '../../../demo/members-backup'
import { createDemoSeeds } from '../../../demo/seeds'
import { guardian } from '../../../packages/guardian/src/index.js'
import { createMembersStore, resetMembersStore } from './members/member-operations'
import { createMembersJoinService } from './members/members.service'
import { createApp, createEventBus, type DemoDeps, type JoinDeps } from './server'
import { createEngine } from './wallet/engine'

const money = (value: string, assetCode: string): Money => ({ value, assetCode, assetScale: 2 })

// Política del grupo para checkGrantRequest, por moneda (el guardián compara la misma moneda).
const MAX_CAP: Record<string, Money> = {
  COP: money('100000000', 'COP'),   // $1.000.000
  EUR: money('25000', 'EUR'),       // €250
  USD: money('25000', 'USD'),       // US$250
}

const PAGOS_PENDIENTES: PaymentsService = new Proxy({} as PaymentsService, {
  get: () => async () => { throw new Error('Pagos reales aún no integrados (PR #2 de R2)') },
})

// Caso 1 sin miembros: los hermanos se unen de verdad desde su wallet (escenario 1).
const cuidadoVacio = (): SharedWallet => ({ ...structuredClone(cuidadoDeMama), members: [], authorizedCapacity: money('0', 'COP') })

async function liveMode(env: NodeJS.ProcessEnv, finishUri: string): Promise<{ join: JoinDeps['createService']; demo: DemoDeps }> {
  const missing = ['WALLET_ADDRESS', 'KEY_ID', 'PRIVATE_KEY_PATH'].filter((k) => !env[k])
  if (missing.length) throw new Error(`Faltan variables en .env: ${missing.join(', ')} (o usa DEMO_MODE=fixtures)`)
  // Fuente: ../open-payments-snippets/wallet-address/wallet-address-get.ts (createAuthenticatedClient)
  // https://openpayments.dev/es/overview/getting-started/
  const client = await createAuthenticatedClient({
    walletAddressUrl: env.WALLET_ADDRESS!, keyId: env.KEY_ID!, privateKey: env.PRIVATE_KEY_PATH!,
    logLevel: 'silent', requestTimeoutMs: 15_000,
  })
  const store = createMembersStore()   // uno solo: todas las sesiones y, al integrar, R2 (tokenFor)
  return {
    join(sessionId, currentSessionId, assetCode) {
      const maxCap = MAX_CAP[assetCode]
      if (!maxCap) throw new Error(`Moneda no soportada para unirse: ${assetCode}`)
      return createMembersJoinService(client, { finishUri, policy: { maxCap }, sessionId, currentSessionId, store })
    },
    demo: { mode: 'live', seeds: () => [cuidadoVacio()], resetStore: () => resetMembersStore(store) },
  }
}

function fixturesMode(env: NodeJS.ProcessEnv): { join: JoinDeps['createService']; demo: DemoDeps } {
  const seeds = () => createDemoSeeds()
  const make = () => createMembersBackup(env.DEMO_MODE, seeds().flatMap((w) => w.members))
  let backup = make()
  return {
    join: () => backup.service,   // miembros y consentimiento simulados (R1)
    demo: {
      mode: 'fixtures',
      label: `${backup.label} · pagos pendientes de R2`,
      recordedAt: backup.recordedAt,
      seeds,
      resetStore: () => { backup = make() },
    },
  }
}

async function main() {
  const env = process.env
  const port = Number(env.PORT ?? 3000)
  const host = env.HOST ?? '127.0.0.1'
  const publicUrl = env.PUBLIC_API_URL ?? `http://localhost:${port}`
  const webUrl = env.WEB_URL ?? 'http://localhost:5173'

  const mode = env.DEMO_MODE === 'fixtures' ? fixturesMode(env) : await liveMode(env, `${publicUrl}/api/join/finish`)

  const bus = createEventBus()
  const engine = createEngine({ guardian, payments: PAGOS_PENDIENTES, emit: bus.emit })
  for (const w of mode.demo.seeds()) engine.addWallet(w)

  const app = createApp({ engine, bus, join: { webUrl, createService: mode.join }, demo: mode.demo })
  app.listen(port, host, () => {
    console.log(`API en ${publicUrl} · modo ${mode.demo.mode}${mode.demo.label ? ` (${mode.demo.label})` : ''} · web en ${webUrl}`)
  })
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'No se pudo arrancar la API')
  process.exit(1)
})
