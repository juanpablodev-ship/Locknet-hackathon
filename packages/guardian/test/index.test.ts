import { describe, expect, it } from 'vitest'
import * as guardian from '../src/index.js'

describe('API pública', () => {
  it('exporta checkDestination, riskScore y las funciones de address', () => {
    for (const name of ['checkDestination', 'riskScore', 'parseAddress', 'normalizeHandle', 'editDistance', 'compareHandles', 'verifyInteractionHash', 'checkGrantRequest', 'checkQuote', 'reconcile']) {
      expect(typeof (guardian as Record<string, unknown>)[name]).toBe('function')
    }
  })

  it('no expone nada que no sea parte de la API', () => {
    expect((guardian as Record<string, unknown>).onlyDigitSwaps).toBeUndefined()
  })
})
