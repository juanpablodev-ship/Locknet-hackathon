// Arranque real de la API (R3): npm run dev:api  (tsx --env-file=.env apps/api/src/main.ts)
// Guardián real (R5) + unirse real (MembersService de R1) + motor y API (R3).
// Pagos: pendientes del PR #2 de R2; mientras tanto cada aporte falla con un motivo claro.
import { createAuthenticatedClient } from '@interledger/open-payments'
import type { Money, PaymentsService } from '../../../contracts'
import { cuidadoDeMama } from '../../../contracts/ejemplo'
import { guardian } from '../../../packages/guardian/src/index.js'
import { createMembersStore } from './members/member-operations'
import { createMembersJoinService } from './members/members.service'
import { createApp, createEventBus } from './server'
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

async function main() {
  const env = process.env
  const missing = ['WALLET_ADDRESS', 'KEY_ID', 'PRIVATE_KEY_PATH'].filter((k) => !env[k])
  if (missing.length) throw new Error(`Faltan variables en .env: ${missing.join(', ')}`)
  const port = Number(env.PORT ?? 3000)
  const host = env.HOST ?? '127.0.0.1'
  const publicUrl = env.PUBLIC_API_URL ?? `http://localhost:${port}`
  const webUrl = env.WEB_URL ?? 'http://localhost:5173'

  // Fuente: ../open-payments-snippets/wallet-address/wallet-address-get.ts (createAuthenticatedClient)
  // https://openpayments.dev/es/overview/getting-started/
  const client = await createAuthenticatedClient({
    walletAddressUrl: env.WALLET_ADDRESS!, keyId: env.KEY_ID!, privateKey: env.PRIVATE_KEY_PATH!,
    logLevel: 'silent', requestTimeoutMs: 15_000,
  })

  const bus = createEventBus()
  const engine = createEngine({ guardian, payments: PAGOS_PENDIENTES, emit: bus.emit })
  // Caso 1 sin miembros: los hermanos se unen de verdad desde su wallet (escenario 1).
  engine.addWallet({ ...structuredClone(cuidadoDeMama), members: [], authorizedCapacity: money('0', 'COP') })

  const store = createMembersStore()   // uno solo, compartido por todas las sesiones (R1)
  const app = createApp({
    engine, bus,
    join: {
      webUrl,
      createService(sessionId, currentSessionId, assetCode) {
        const maxCap = MAX_CAP[assetCode]
        if (!maxCap) throw new Error(`Moneda no soportada para unirse: ${assetCode}`)
        return createMembersJoinService(client, {
          finishUri: `${publicUrl}/api/join/finish`, policy: { maxCap }, sessionId, currentSessionId, store,
        })
      },
    },
  })

  app.listen(port, host, () => {
    console.log(`API en ${publicUrl} · web esperada en ${webUrl} · pagos: pendientes de R2`)
  })
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'No se pudo arrancar la API')
  process.exit(1)
})
