import { createAuthenticatedClient } from '@interledger/open-payments'

const required = [
  'WALLET_ADDRESS', 'KEY_ID', 'PRIVATE_KEY_PATH',
  'QUOTE_ONLY_MEMBER_ID', 'QUOTE_ONLY_PAYER_WALLET_ADDRESS', 'QUOTE_ONLY_RECEIVER_WALLET_ADDRESS',
] as const

type DiagnosticConfig = Record<(typeof required)[number], string>

function readConfig(env: NodeJS.ProcessEnv): DiagnosticConfig {
  const missing = required.filter((name) => !env[name]?.trim())
  if (missing.length) throw new Error(`Configuración ausente: ${missing.join(', ')}`)
  return Object.fromEntries(required.map((name) => [name, env[name]!.trim()])) as DiagnosticConfig
}

function matchesMemberId(walletUrl: string, memberId: string): boolean {
  try {
    const lastSegment = new URL(walletUrl).pathname.split('/').filter(Boolean).at(-1) ?? ''
    return decodeURIComponent(lastSegment) === memberId
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  try {
    const config = readConfig(process.env)
    const client = await createAuthenticatedClient({
      walletAddressUrl: config.WALLET_ADDRESS,
      privateKey: config.PRIVATE_KEY_PATH,
      keyId: config.KEY_ID,
    })
    const [payer, receiver] = await Promise.all([
      client.walletAddress.get({ url: config.QUOTE_ONLY_PAYER_WALLET_ADDRESS }),
      client.walletAddress.get({ url: config.QUOTE_ONLY_RECEIVER_WALLET_ADDRESS }),
    ])

    console.log(`PAGADORA: assetCode=${payer.assetCode} assetScale=${payer.assetScale}`)
    console.log(`RECEPTORA: assetCode=${receiver.assetCode} assetScale=${receiver.assetScale}`)
    console.log(`PAGADORA miembro coincide: ${matchesMemberId(config.QUOTE_ONLY_PAYER_WALLET_ADDRESS, config.QUOTE_ONLY_MEMBER_ID) ? 'sí' : 'no'}`)
  } catch {
    console.error('Diagnóstico de wallets falló; detalle reservado')
    process.exitCode = 1
  }
}

if (typeof require !== 'undefined' && require.main === module) void main()
