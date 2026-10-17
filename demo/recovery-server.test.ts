import { describe, expect, it } from 'vitest'
import { readAuthorizationExpiresAt } from './recovery-server'

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
