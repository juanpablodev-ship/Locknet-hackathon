import { describe, expect, it } from 'vitest'
import { guardianMock } from '../../../mocks/guardian.mock.js'

const p = { clientNonce: 'a', interactNonce: 'b', interactRef: 'c', grantUri: 'https://auth.example/' }
const cop = (n: number) => ({ value: String(n * 100), assetCode: 'COP', assetScale: 2 })

describe('guardianMock', () => {
  it('verifyInteractionHash: hash "invalido" → block', () => {
    expect(guardianMock.verifyInteractionHash({ ...p, hash: 'invalido' }).status).toBe('block')
  })

  it('verifyInteractionHash: otro hash → pass', () => {
    expect(guardianMock.verifyInteractionHash({ ...p, hash: 'cualquiera' }).status).toBe('pass')
  })

  it('checkDestination usa la real: farmacia-medel1in → warn 94', () => {
    const v = guardianMock.checkDestination({
      walletAddress: 'https://ilp.interledger-test.dev/farmacia-medel1in',
      known: [{ name: 'Farmacia Medellín', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medellin' }],
    })
    expect([v.status, v.riskPoints]).toEqual(['warn', 94])
  })

  it('checkQuote: comisión de 30% → block; sin comisión → pass', () => {
    expect(guardianMock.checkQuote({ debitAmount: cop(130), receiveAmount: cop(100), maxFeePercent: 20 }).status).toBe('block')
    expect(guardianMock.checkQuote({ debitAmount: cop(100), receiveAmount: cop(100), maxFeePercent: 20 }).status).toBe('pass')
  })

  it('reconcile: llegó menos → warn; llegó todo → pass', () => {
    expect(guardianMock.reconcile({ expected: cop(100), received: cop(99) }).status).toBe('warn')
    expect(guardianMock.reconcile({ expected: cop(100), received: cop(100) }).status).toBe('pass')
  })

  it('checkGrantRequest es el real: sin tope → warn; tope normal → pass', () => {
    expect(guardianMock.checkGrantRequest({ policy: { maxCap: cop(500) } }).status).toBe('warn')
    expect(guardianMock.checkGrantRequest({ debitAmount: cop(100), interval: 'R12/2026-10-16T00:00:00Z/P1M', policy: { maxCap: cop(500) } }).status).toBe('pass')
  })

  it('riskScore es el real (block → 100)', () => {
    expect(guardianMock.riskScore([guardianMock.verifyInteractionHash({ ...p, hash: 'invalido' })])).toBe(100)
  })
})
