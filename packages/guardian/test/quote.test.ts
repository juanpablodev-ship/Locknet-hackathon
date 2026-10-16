import { describe, expect, it } from 'vitest'
import type { Money } from '../../../contracts/index.js'
import { checkQuote } from '../src/quote.js'

const m = (value: string, assetCode: string, assetScale = 2): Money => ({ value, assetCode, assetScale })
const cop = (v: string, s = 2) => m(v, 'COP', s)
const eur = (v: string, s = 2) => m(v, 'EUR', s)

describe('checkQuote — misma moneda', () => {
  it('2% con maxFee 5 → pass', () => {
    expect(checkQuote({ debitAmount: cop('10200'), receiveAmount: cop('10000'), maxFeePercent: 5 })).toMatchObject({
      check: 'quote', status: 'pass', riskPoints: 0, userMessage: 'Cotización normal.',
    })
  })

  it('23% (escenario 6) → block con "23%" en el mensaje', () => {
    const v = checkQuote({ debitAmount: cop('12300'), receiveAmount: cop('10000'), maxFeePercent: 5 })
    expect(v).toMatchObject({ status: 'block', riskPoints: 100 })
    expect(v.userMessage).toBe('Este aporte costaría 23% más de lo normal. Gasto detenido.')
    expect(v.reasons[0]).toContain('23.00%')
  })

  it('exactamente el máximo no bloquea; un poco más sí', () => {
    expect(checkQuote({ debitAmount: cop('10500'), receiveAmount: cop('10000'), maxFeePercent: 5 }).status).toBe('pass')
    expect(checkQuote({ debitAmount: cop('10501'), receiveAmount: cop('10000'), maxFeePercent: 5 }).status).toBe('block')
  })

  it('debit menor que receive → pass', () => {
    expect(checkQuote({ debitAmount: cop('9000'), receiveAmount: cop('10000'), maxFeePercent: 5 }).status).toBe('pass')
  })

  it('assetScale distintos en la misma moneda se calculan bien', () => {
    // 105,00 vs 100 → 5%
    expect(checkQuote({ debitAmount: cop('10500', 2), receiveAmount: cop('100', 0), maxFeePercent: 5 }).status).toBe('pass')
    // 106,00 vs 100 → 6%
    const v = checkQuote({ debitAmount: cop('10600', 2), receiveAmount: cop('100', 0), maxFeePercent: 5 })
    expect(v.status).toBe('block')
    expect(v.userMessage).toContain('6%')
  })

  it('receiveAmount en 0 → block sin lanzar', () => {
    expect(checkQuote({ debitAmount: cop('100'), receiveAmount: cop('0'), maxFeePercent: 5 }).status).toBe('block')
  })
})

describe('checkQuote — monedas distintas', () => {
  // 1 EUR = 4.500 COP. 10 EUR deberían dar 45.000 COP.
  const debitAmount = eur('1000')

  it('EUR→COP sin referenceRate → pass (el aporte del escenario 2 no se bloquea)', () => {
    const v = checkQuote({ debitAmount, receiveAmount: cop('4455000'), maxFeePercent: 5 })
    expect(v).toMatchObject({ status: 'pass', riskPoints: 0, userMessage: 'Cotización normal.' })
    expect(v.reasons).toEqual(['monedas distintas sin tasa de referencia: no se compara la comisión'])
  })

  it('EUR→COP con referenceRate y pérdida de 1% → pass', () => {
    expect(checkQuote({ debitAmount, receiveAmount: cop('4455000'), referenceRate: 4500, maxFeePercent: 5 }).status).toBe('pass')
  })

  it('EUR→COP con referenceRate y pérdida de 23% → block', () => {
    const v = checkQuote({ debitAmount, receiveAmount: cop('3465000'), referenceRate: 4500, maxFeePercent: 5 })
    expect(v.status).toBe('block')
    expect(v.userMessage).toBe('Este aporte costaría 23% más de lo normal. Gasto detenido.')
  })

  it('referenceRate inválida se ignora → pass', () => {
    expect(checkQuote({ debitAmount, receiveAmount: cop('1'), referenceRate: 0, maxFeePercent: 5 }).status).toBe('pass')
  })
})
