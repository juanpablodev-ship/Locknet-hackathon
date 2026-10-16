// Basado en el snippet oficial de continuación de grant:
//   https://github.com/interledger/open-payments-snippets/blob/71e13be/grant/grant-continuation.ts
//   (L28: "// @TODO: Verify hash")
// Cómo se calcula el hash: https://openpayments.dev/es/identity/hash-verification/
//
// Escrito con nuestras palabras. Necesita red y llaves (variables de entorno), por eso
// no se ejecuta en las pruebas. Variables:
//   KEY_ID, WALLET_ADDRESS, PRIVATE_KEY_PATH, CONTINUE_URI, CONTINUE_ACCESS_TOKEN,
//   URL_WITH_INTERACT_REF  (la URL a la que el banco devolvió al usuario)
//   CLIENT_NONCE           (el nonce que enviamos en interact.finish.nonce)
//   INTERACT_NONCE         (el nonce que devolvió el servidor en interact.finish)
//   GRANT_URI              (walletAddress.authServer, igual que en grant.request)
import { createAuthenticatedClient, isFinalizedGrant } from '@interledger/open-payments'
import { guardian } from '../src/index.js'

const env = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`Falta la variable de entorno ${name}`)
  return value
}

const client = await createAuthenticatedClient({
  walletAddressUrl: env('WALLET_ADDRESS'),
  privateKey: env('PRIVATE_KEY_PATH'),
  keyId: env('KEY_ID'),
})

// La URL de retorno trae interact_ref y hash como parámetros.
const returnUrl = new URL(env('URL_WITH_INTERACT_REF'))
const interactRef = returnUrl.searchParams.get('interact_ref') ?? ''
const hash = returnUrl.searchParams.get('hash') ?? ''
const clientNonce = env('CLIENT_NONCE')
const interactNonce = env('INTERACT_NONCE')
const grantUri = env('GRANT_URI')

// Guardián: verifica que el retorno viene del banco (el snippet oficial lo deja en @TODO)
const v = guardian.verifyInteractionHash({ clientNonce, interactNonce, interactRef, grantUri, hash })
if (v.status === 'block') throw new Error(v.userMessage)

const grant = await client.grant.continue(
  { accessToken: env('CONTINUE_ACCESS_TOKEN'), url: env('CONTINUE_URI') },
  { interact_ref: interactRef },
)

if (!isFinalizedGrant(grant)) {
  throw new Error('Se esperaba un grant finalizado, pero llegó uno que no lo está.')
}

// No se imprime el access token: se guarda solo en el servidor.
console.log('Grant finalizado. Retorno verificado por el guardián.')
