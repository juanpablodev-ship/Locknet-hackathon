// Arranque real de la API (R3): npm run dev:api  (tsx --env-file=.env apps/api/src/main.ts)
// Guardián real (R5) + miembros reales (R1) + pagos reales (R2) + motor y API (R3).
// DEMO_MODE=fixtures: modo respaldo, sin SDK ni Test Wallet, con etiqueta explícita.
import { openAttemptJournal } from './payments/journal'
import { loadLiveConfig } from './live-config'
import { existsSync } from 'node:fs'
import { createAuthenticatedClient } from '@interledger/open-payments'
import type { Money, PaymentsService, SharedWallet } from '../../../contracts'
import { cuidadoDeMama } from '../../../contracts/ejemplo'
import { createMembersBackup } from '../../../demo/members-backup'
import { createDemoSeeds } from '../../../demo/seeds'
import { createPaymentsMock } from '../../../mocks/payments.mock'
import { guardian } from '../../../packages/guardian/src/index.js'
import { createMemberOperations, createMembersStore, resetMembersStore } from './members/member-operations'
import { createMembersJoinService } from './members/members.service'
import { createPaymentsService } from './payments/service'
import { createApp, createEventBus, type DemoDeps, type JoinDeps } from './server'
import { createEngine, type Engine } from './wallet/engine'

const money = (value: string, assetCode: string): Money => ({ value, assetCode, assetScale: 2 })

// Política del grupo para checkGrantRequest, por moneda (el guardián compara la misma moneda).
const MAX_CAP: Record<string, Money> = {
  COP: money('100000000', 'COP'),   // $1.000.000
  EUR: money('25000', 'EUR'),       // €250
  USD: money('25000', 'USD'),       // US$250
}

// Caso 1 sin miembros: los hermanos se unen de verdad desde su wallet (escenario 1).
const cuidadoVacio = (): SharedWallet => ({ ...structuredClone(cuidadoDeMama), members: [], authorizedCapacity: money('0', 'COP') })

interface Mode {
  join: JoinDeps['createService']
  demo: DemoDeps
  available: (memberId: string) => Promise<Money>
  revoke: (memberId: string) => Promise<void>
  setup?: Awaited<ReturnType<typeof loadLiveConfig>>
  metadata?: JoinDeps['metadata']
  payments: (engine: () => Engine) => PaymentsService
}

async function liveMode(env: NodeJS.ProcessEnv, finishUri: string): Promise<Mode> {
  const missing = ['WALLET_ADDRESS', 'KEY_ID', 'PRIVATE_KEY_PATH'].filter((k) => !env[k])
  if (missing.length) throw new Error(`Faltan variables en .env: ${missing.join(', ')} (o usa DEMO_MODE=fixtures)`)
  // Fuente: ../open-payments-snippets/wallet-address/wallet-address-get.ts (createAuthenticatedClient)
  // https://openpayments.dev/es/overview/getting-started/
  const client = await createAuthenticatedClient({
    walletAddressUrl: env.WALLET_ADDRESS!, keyId: env.KEY_ID!, privateKey: env.PRIVATE_KEY_PATH!,
    logLevel: 'silent', requestTimeoutMs: 15_000,
  })
  const config = await loadLiveConfig(env.LIVE_CONFIG_PATH ?? (existsSync('.env.integration.json') ? '.env.integration.json' : 'demo/live-config.example.json'),
    url => client.walletAddress.get({ url }), env.WALLET_ADDRESS!)
  // UN solo almacén (R1): lo comparten las sesiones de unirse y los pagos de R2 (tokenFor).
  const journal = await openAttemptJournal(env.PAYMENT_JOURNAL_PATH ?? '.env.payment-attempts.json')
  const store = createMembersStore()
  const ops = createMemberOperations(client, store)   // solo servidor: el token nunca sale por HTTP/SSE
  return {
    join(sessionId, currentSessionId, assetCode) {
      const base = MAX_CAP[assetCode]
      const scale = config.members.find(m => m.assetCode === assetCode)?.assetScale ?? 2
      const maxCap = base ? { ...base, assetScale: scale, value: (BigInt(base.value) * 10n ** BigInt(scale) / 100n).toString() } : undefined
      if (!maxCap) throw new Error(`Moneda no soportada para unirse: ${assetCode}`)
      return createMembersJoinService(client, { finishUri, policy: { maxCap }, sessionId, currentSessionId, store })
    },
    setup: config,
    metadata: async url => {
      if (!config.members.some(m => m.walletAddress === url)) throw new Error('Wallet no configurada para esta prueba')
      const w = await client.walletAddress.get({ url }); return { assetCode: w.assetCode, assetScale: w.assetScale }
    },
    revoke: id => ops.revoke(id),
    demo: { mode: 'live', seeds: () => [{ ...cuidadoVacio(), knownDestinations: [{ name: config.pharmacy.name, walletAddress: config.pharmacy.walletAddress }],
      authorizedCapacity: { value: '0', assetCode: 'COP', assetScale: config.pharmacy.assetScale },
      rules: { ...cuidadoVacio().rules, groupApproval: { ...cuidadoVacio().rules.groupApproval, aboveAmount: { value: (200000n * 10n ** BigInt(config.pharmacy.assetScale)).toString(), assetCode: 'COP', assetScale: config.pharmacy.assetScale } } } }], resetStore: () => resetMembersStore(store) },
    available: (id) => ops.available(id),
    payments: (engine) => createPaymentsService({
      client, journal,
      memberToken: (id) => ops.tokenFor(id),
      async memberWalletAddress(id) {
        for (const w of engine().listWallets()) {
          const m = w.members.find((x) => x.id === id)
          if (m) return m.walletAddress
        }
        throw new Error('Miembro no encontrado')
      },
    }),
  }
}

function fixturesMode(env: NodeJS.ProcessEnv): Mode {
  const seeds = () => createDemoSeeds()
  const make = () => createMembersBackup(env.DEMO_MODE, seeds().flatMap((w) => w.members))
  let backup = make()
  return {
    join: () => backup.service,   // miembros y consentimiento simulados (R1)
    demo: {
      mode: 'fixtures',
      label: `${backup.label} · pagos simulados`,
      recordedAt: backup.recordedAt,
      seeds,
      resetStore: () => { backup = make() },
    },
    available: (id) => backup.service.available(id),
    revoke: id => backup.service.revoke(id),
    payments: () => createPaymentsMock(),   // simulado de R2, sin red
  }
}

async function main() {
  const env = process.env
  const port = Number(env.PORT ?? 3000)
  const host = env.HOST ?? '127.0.0.1'
  const publicUrl = env.PUBLIC_API_URL ?? 'http://localhost:5173'
  const webUrl = env.WEB_URL ?? 'http://localhost:5173'
  const incomingPerShare = (env.COBROS ?? 'por-miembro') !== 'compartido'   // plan B por defecto
  const maxFeePercent = Number(env.MAX_FEE_PERCENT ?? 5)
  if (!Number.isFinite(maxFeePercent) || maxFeePercent < 0) throw new Error('MAX_FEE_PERCENT inválido')

  const mode = env.DEMO_MODE === 'fixtures' ? fixturesMode(env) : await liveMode(env, `${publicUrl}/api/join/finish`)

  const bus = createEventBus()
  let engine: Engine
  engine = createEngine({
    guardian, payments: mode.payments(() => engine), emit: bus.emit, incomingPerShare, maxFeePercent,
  })
  for (const w of mode.demo.seeds()) engine.addWallet(w)

  const app = createApp({ engine, bus, join: { webUrl, createService: mode.join, metadata: mode.metadata }, demo: mode.demo, available: mode.available, revoke: mode.revoke, setup: mode.setup })
  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port, host, () => resolve())
    server.once('error', () => reject(new Error('Puerto de API no disponible')))
  })
  console.log(`API escuchando en ${host}:${port} · modo ${mode.demo.mode}${mode.demo.label ? ` (${mode.demo.label})` : ''}` +
    ` · cobros ${incomingPerShare ? 'por miembro' : 'compartido'} · comisión máx ${maxFeePercent}% · web en ${webUrl}`)
}

main().catch((e) => {
  console.error('No se pudo arrancar la API. Revisa credenciales locales, LIVE_CONFIG_PATH, monedas publicas y puertos; no compartas secretos.')
  process.exit(1)
})
