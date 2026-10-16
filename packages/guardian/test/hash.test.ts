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
