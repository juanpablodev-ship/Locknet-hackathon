import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyInteractionHash } from '../src/hash.js'

// Vector de https://openpayments.dev/es/identity/hash-verification/ (Base64 URL sin relleno).
const official = {
  clientNonce: 'VJLO6A4CATR0KRO',
  interactNonce: 'MBDOFXG4Y5CVJCX821LH',
  interactRef: '4IFWWIKYB2PQ6U56NL1',
  grantUri: 'https://server.example.com/tx',
  hash: 'x-gguKWTj8rQf7d7i3w3UhzvuJ5bpOlKyAlVpLxBffY',
}

describe('verifyInteractionHash', () => {
  it('vector oficial en base64url sin relleno → pass', () => {
    expect(verifyInteractionHash(official)).toMatchObject({
      check: 'consent-hash', status: 'pass', riskPoints: 0, userMessage: 'Confirmamos que vienes de tu banco.',
    })
  })

  it('base64 estándar con relleno → pass', () => {
    expect(verifyInteractionHash({ ...official, hash: 'x+gguKWTj8rQf7d7i3w3UhzvuJ5bpOlKyAlVpLxBffY=' }).status).toBe('pass')
  })

  it('base64 estándar SIN relleno → block (solo se aceptan los dos formatos con respaldo)', () => {
    expect(verifyInteractionHash({ ...official, hash: 'x+gguKWTj8rQf7d7i3w3UhzvuJ5bpOlKyAlVpLxBffY' }).status).toBe('block')
  })

  it("' ' en lugar de '+' → block (URL mal procesada)", () => {
    expect(verifyInteractionHash({ ...official, hash: 'x gguKWTj8rQf7d7i3w3UhzvuJ5bpOlKyAlVpLxBffY=' }).status).toBe('block')
  })

  it('espacio al inicio o al final del hash → block', () => {
    expect(verifyInteractionHash({ ...official, hash: ' ' + official.hash }).status).toBe('block')
    expect(verifyInteractionHash({ ...official, hash: official.hash + ' ' }).status).toBe('block')
  })

  it('un carácter cambiado → block', () => {
    const v = verifyInteractionHash({ ...official, hash: 'x-gguKWTj8rQf7d7i3w3UhzvuJ5bpOlKyAlVpLxBffZ' })
    expect(v).toMatchObject({
      status: 'block', riskPoints: 100, userMessage: 'No pudimos confirmar que vienes de tu banco. No te uniste.',
    })
  })

  it('hash de otro largo → block sin lanzar', () => {
    expect(verifyInteractionHash({ ...official, hash: 'corto' }).status).toBe('block')
  })

  it('grantUri con barra final → block con el reason de la barra', () => {
    const v = verifyInteractionHash({ ...official, grantUri: official.grantUri + '/' })
    expect(v.status).toBe('block')
    expect(v.reasons).toContain('coincidiría con/sin barra final en grantUri: revisar la URL que se pasa')
  })

  it('un block normal no menciona la barra', () => {
    const v = verifyInteractionHash({ ...official, hash: 'x-gguKWTj8rQf7d7i3w3UhzvuJ5bpOlKyAlVpLxBffZ' })
    expect(v.reasons.join(' ')).not.toContain('barra')
  })

  it('interactRef vacío → block', () => {
    expect(verifyInteractionHash({ ...official, interactRef: '' }).status).toBe('block')
  })

  it('campos null o undefined en ejecución → block sin lanzar', () => {
    expect(verifyInteractionHash({ ...official, hash: null as unknown as string }).status).toBe('block')
    expect(verifyInteractionHash({ ...official, clientNonce: undefined as unknown as string }).status).toBe('block')
  })

  it('reasons no incluye el hash esperado ni los nonces', () => {
    const v = verifyInteractionHash({ ...official, hash: 'x-gguKWTj8rQf7d7i3w3UhzvuJ5bpOlKyAlVpLxBffZ' })
    const text = JSON.stringify(v)
    for (const secret of [official.hash, official.clientNonce, official.interactNonce]) {
      expect(text).not.toContain(secret)
    }
  })
})

// Casos de rechazo tomados de la evidencia de R1 contra la Test Wallet (prompts/R1.md, 12:36 y 12:41).
describe('verifyInteractionHash — formato real de la Test Wallet (Rafiki)', () => {
  const sha256 = (base: string) => createHash('sha256').update(base, 'ascii').digest()
  const fields = [official.clientNonce, official.interactNonce, official.interactRef, official.grantUri]
  const standard = Buffer.from(official.hash, 'base64url').toString('base64')

  it('Base64 estándar con relleno, codificado en la URL y leído con URLSearchParams → pass', () => {
    // Rafiki: hash = createHash('sha-256').update(data).digest('base64') y searchParams.set('hash', hash)
    // https://github.com/interledger/rafiki/blob/68c11dc32742127bb96767ccbd85e9775bc31646/packages/auth/src/interaction/routes.ts (L384-387)
    const encoded = encodeURIComponent(standard)
    expect(encoded).toContain('%2B')
    expect(encoded).toContain('%3D')
    const received = new URLSearchParams('hash=' + encoded).get('hash') as string
    expect(received).toBe(standard)
    expect(verifyInteractionHash({ ...official, hash: received }).status).toBe('pass')
  })

  it('Base64 no canónico con los mismos bytes → block', () => {
    // El último carácter útil lleva 2 bits de relleno: cambiarlos decodifica a los mismos bytes.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    const nonCanonical = standard.slice(0, 42) + alphabet[alphabet.indexOf(standard[42]) + 1] + '='
    expect(Buffer.from(nonCanonical, 'base64').equals(Buffer.from(standard, 'base64'))).toBe(true)
    expect(nonCanonical).not.toBe(standard)
    expect(verifyInteractionHash({ ...official, hash: nonCanonical }).status).toBe('block')
  })

  it('alfabetos mezclados → block', () => {
    expect(verifyInteractionHash({ ...official, hash: standard.replace('+', '-') }).status).toBe('block')
    expect(verifyInteractionHash({ ...official, hash: official.hash.replace('-', '+') }).status).toBe('block')
  })

  it('hash sin decodificar (%2B y %3D) → block', () => {
    expect(verifyInteractionHash({ ...official, hash: encodeURIComponent(standard) }).status).toBe('block')
  })

  it('base64url con "=" → block', () => {
    expect(verifyInteractionHash({ ...official, hash: official.hash + '=' }).status).toBe('block')
  })

  it('base con CRLF → block', () => {
    const hash = sha256(fields.join('\r\n')).toString('base64')
    expect(verifyInteractionHash({ ...official, hash }).status).toBe('block')
  })

  it('base con salto final → block', () => {
    const hash = sha256(fields.join('\n') + '\n').toString('base64')
    expect(verifyInteractionHash({ ...official, hash }).status).toBe('block')
  })

  it('nonces invertidos → block', () => {
    const swapped = [fields[1], fields[0], fields[2], fields[3]].join('\n')
    expect(verifyInteractionHash({ ...official, hash: sha256(swapped).toString('base64') }).status).toBe('block')
  })

  it('control: la base bien armada con el mismo método sí da pass', () => {
    expect(verifyInteractionHash({ ...official, hash: sha256(fields.join('\n')).toString('base64') }).status).toBe('pass')
  })
})

describe('verifyInteractionHash — reasons distingue formato de coincidencia', () => {
  const FORMAT = 'formato de hash no reconocido: se acepta Base64 URL sin relleno o Base64 estándar con relleno (revisar cómo se lee el parámetro de la URL)'
  const NO_MATCH = 'el hash no coincide con el calculado'
  const standard = Buffer.from(official.hash, 'base64url').toString('base64')

  it('hash con espacio → reason de formato', () => {
    const v = verifyInteractionHash({ ...official, hash: standard.replace('+', ' ') })
    expect(v.status).toBe('block')
    expect(v.reasons).toEqual([FORMAT])
  })

  it('estándar sin relleno → reason de formato', () => {
    expect(verifyInteractionHash({ ...official, hash: standard.replace(/=+$/, '') }).reasons).toEqual([FORMAT])
  })

  it('sin decodificar (%2B%3D) y base64url con "=" → reason de formato', () => {
    expect(verifyInteractionHash({ ...official, hash: encodeURIComponent(standard) }).reasons).toEqual([FORMAT])
    expect(verifyInteractionHash({ ...official, hash: official.hash + '=' }).reasons).toEqual([FORMAT])
  })

  it('carácter cambiado en un hash bien formado → "no coincide", no formato', () => {
    const changed = official.hash.slice(0, -1) + 'Z'
    expect(verifyInteractionHash({ ...official, hash: changed }).reasons).toEqual([NO_MATCH])
    const changedStandard = standard.slice(0, 5) + (standard[5] === 'a' ? 'b' : 'a') + standard.slice(6)
    expect(verifyInteractionHash({ ...official, hash: changedStandard }).reasons).toEqual([NO_MATCH])
  })

  it('hash válido → no menciona formato', () => {
    expect(verifyInteractionHash(official).reasons.join(' ')).not.toContain('formato')
  })

  it('userMessage es el mismo en ambos casos y reasons no filtra hash ni nonces', () => {
    const a = verifyInteractionHash({ ...official, hash: standard.replace('+', ' ') })
    const b = verifyInteractionHash({ ...official, hash: official.hash.slice(0, -1) + 'Z' })
    expect(a.userMessage).toBe('No pudimos confirmar que vienes de tu banco. No te uniste.')
    expect(b.userMessage).toBe(a.userMessage)
    for (const text of [JSON.stringify(a.reasons), JSON.stringify(b.reasons)]) {
      for (const secret of [official.hash, standard, official.clientNonce, official.interactNonce, official.interactRef]) {
        expect(text).not.toContain(secret)
      }
    }
  })
})
