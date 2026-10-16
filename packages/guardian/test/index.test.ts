import { describe, expect, it } from 'vitest'
import * as api from '../src/index.js'
import { guardian } from '../src/index.js'

describe('API pública', () => {
  it('exporta checkDestination, riskScore y las funciones de address', () => {
    for (const name of ['checkDestination', 'riskScore', 'parseAddress', 'normalizeHandle', 'editDistance', 'compareHandles', 'verifyInteractionHash', 'checkGrantRequest', 'checkQuote', 'reconcile']) {
      expect(typeof (api as Record<string, unknown>)[name]).toBe('function')
    }
  })

  it('no expone nada que no sea parte de la API', () => {
    expect((api as Record<string, unknown>).onlyDigitSwaps).toBeUndefined()
  })
})

describe('objeto guardian', () => {
  const names = ['verifyInteractionHash', 'checkGrantRequest', 'checkDestination', 'checkQuote', 'reconcile', 'riskScore'] as const

  it('tiene las 6 funciones del contrato', () => {
    expect(Object.keys(guardian).sort()).toEqual([...names].sort())
    for (const name of names) expect(typeof guardian[name]).toBe('function')
  })

  it('checkDestination da warn 94 con farmacia-medel1in', () => {
    const v = guardian.checkDestination({
      walletAddress: 'https://ilp.interledger-test.dev/farmacia-medel1in',
      known: [{ name: 'Farmacia Medellín', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medellin' }],
    })
    expect([v.status, v.riskPoints]).toEqual(['warn', 94])
  })

  it('no inventa funciones fuera del contrato', () => {
    expect((guardian as unknown as Record<string, unknown>).normalizeHandle).toBeUndefined()
  })
})
