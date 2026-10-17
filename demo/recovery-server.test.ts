import { describe, expect, it } from 'vitest'
import { readAuthorizationExpiresAt, isRecoveryReadScope } from './recovery-server'

describe('vigencia del permiso de recuperación', () => {
  it('retira el permiso cinco segundos antes del vencimiento declarado', () => {
    expect(readAuthorizationExpiresAt(600, 1000)).toBe(596000)
  })
  it('aplica una vigencia conservadora cuando el proveedor no declara una', () => {
    expect(readAuthorizationExpiresAt(undefined, 1000)).toBe(296000)
  })
  it.each([0, -1, 5, NaN, Infinity])('rechaza vigencia no utilizable: %s', seconds => {
    expect(() => readAuthorizationExpiresAt(seconds, 1000)).toThrow('vigencia')
  })
})

describe('alcance de la recuperación autorizada', () => {
  const wallet = 'https://example.com/member'
  it('acepta exclusivamente lectura histórica de la wallet elegida', () => {
    expect(isRecoveryReadScope({ type: 'outgoing-payment', identifier: wallet, actions: ['read-all', 'read'] }, wallet)).toBe(true)
  })
  it.each([
    { type: 'outgoing-payment', identifier: wallet, actions: ['read', 'create'] },
    { type: 'outgoing-payment', identifier: wallet, actions: ['read', 'read-all', 'create'] },
    { type: 'outgoing-payment', identifier: 'https://example.com/other', actions: ['read', 'read-all'] },
    { type: 'incoming-payment', identifier: wallet, actions: ['read', 'read-all'] },
    { type: 'outgoing-payment', identifier: wallet, actions: ['read', 'read'] },
  ])('rechaza un permiso distinto: %j', access => {
    expect(isRecoveryReadScope(access, wallet)).toBe(false)
  })
})
