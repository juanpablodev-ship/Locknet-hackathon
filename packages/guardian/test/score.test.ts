import { describe, expect, it } from 'vitest'
import type { Verdict } from '../../../contracts/index.js'
import { riskScore } from '../src/score.js'

const v = (status: Verdict['status'], riskPoints: number): Verdict => ({
  check: 'destination', status, riskPoints, userMessage: '', reasons: [],
})

describe('riskScore', () => {
  it('lista vacía → 0', () => {
    expect(riskScore([])).toBe(0)
  })

  it('suma los riskPoints', () => {
    expect(riskScore([v('warn', 20), v('warn', 30)])).toBe(50)
  })

  it('tope en 100', () => {
    expect(riskScore([v('warn', 80), v('warn', 80)])).toBe(100)
  })

  it('cualquier block → 100 aunque los puntos sumen poco', () => {
    expect(riskScore([v('pass', 0), v('block', 1)])).toBe(100)
  })

  it('sin block, no llega a 100 con puntos bajos', () => {
    expect(riskScore([v('pass', 0), v('warn', 10)])).not.toBe(100)
  })
})
