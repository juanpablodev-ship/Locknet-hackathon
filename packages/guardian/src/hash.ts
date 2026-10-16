import { createHash, timingSafeEqual } from 'node:crypto'
import type { Guardian, Verdict } from '../../../contracts/index.js'

type Params = Parameters<Guardian['verifyInteractionHash']>[0]

const OK_MESSAGE = 'Confirmamos que vienes de tu banco.'
const BLOCK_MESSAGE = 'No pudimos confirmar que vienes de tu banco. No te uniste.'
const FIELDS = ['clientNonce', 'interactNonce', 'interactRef', 'grantUri', 'hash'] as const

const verdict = (status: Verdict['status'], riskPoints: number, userMessage: string, reasons: string[]): Verdict =>
  ({ check: 'consent-hash', status, riskPoints, userMessage, reasons })

const block = (...reasons: string[]) => verdict('block', 100, BLOCK_MESSAGE, reasons)

/**
 * SHA-256 de la base (ASCII, sin salto final) en los dos formatos con respaldo:
 * Base64 URL sin relleno (RFC 9635 y vector oficial) y Base64 estándar con relleno (Rafiki).
 */
function expectedHashes(p: Params): string[] {
  const base = `${p.clientNonce}\n${p.interactNonce}\n${p.interactRef}\n${p.grantUri}`
  const digest = createHash('sha256').update(base, 'ascii').digest()
  return [digest.toString('base64url'), digest.toString('base64')]
}

function matches(p: Params, received: string): boolean {
  const got = Buffer.from(received, 'ascii')
  return expectedHashes(p).some((candidate) => {
    const want = Buffer.from(candidate, 'ascii')
    return want.length === got.length && timingSafeEqual(want, got)
  })
}

export function verifyInteractionHash(p: Params): Verdict {
  const missing = FIELDS.filter((f) => typeof p?.[f] !== 'string' || p[f] === '')
  if (missing.length > 0) return block(`falta o está vacío: ${missing.join(', ')}`)

  // Rafiki codifica el hash en la URL (%2B, %3D) y URLSearchParams lo decodifica bien:
  // un espacio significa una URL mal procesada, así que no se "arregla"; se rechaza.
  const received = p.hash
  if (matches(p, received)) return verdict('pass', 0, OK_MESSAGE, ['el hash coincide con el calculado'])

  const otherUri = p.grantUri.endsWith('/') ? p.grantUri.slice(0, -1) : p.grantUri + '/'
  if (matches({ ...p, grantUri: otherUri }, received)) {
    return block('el hash no coincide', 'coincidiría con/sin barra final en grantUri: revisar la URL que se pasa')
  }
  return block('el hash no coincide con el calculado')
}
