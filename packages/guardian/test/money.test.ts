import { describe, expect, it } from 'vitest'
import type { Money } from '../../../contracts/index.js'
import { compareMoney, formatMoney } from '../src/money.js'

const m = (value: string, assetScale: number, assetCode = 'COP'): Money => ({ value, assetCode, assetScale })

describe('compareMoney', () => {
  it('compara montos del mismo asset', () => {
    expect(compareMoney(m('100', 2), m('200', 2))).toBe(-1)
    expect(compareMoney(m('200', 2), m('100', 2))).toBe(1)
    expect(compareMoney(m('100', 2), m('100', 2))).toBe(0)
  })

  it('normaliza assetScale distintos: 500 con escala 2 es 5 con escala 0', () => {
    expect(compareMoney(m('500', 2), m('5', 0))).toBe(0)
    expect(compareMoney(m('501', 2), m('5', 0))).toBe(1)
    expect(compareMoney(m('4', 0), m('500', 2))).toBe(-1)
  })

  it('no pierde precisión con montos enormes', () => {
    expect(compareMoney(m('9007199254740993', 2), m('9007199254740992', 2))).toBe(1)
  })

  it('lanza si el assetCode es distinto', () => {
    expect(() => compareMoney(m('1', 2, 'COP'), m('1', 2, 'EUR'))).toThrow()
  })
})

describe('formatMoney', () => {
  it('punto de miles y sin decimales si son 0', () => {
    expect(formatMoney(m('500000000', 2))).toBe('$5.000.000 COP')
    expect(formatMoney(m('5000000', 0))).toBe('$5.000.000 COP')
  })

  it('muestra decimales solo si existen', () => {
    expect(formatMoney(m('123450', 2))).toBe('$1.234,5 COP')
    expect(formatMoney(m('5', 2, 'EUR'))).toBe('$0,05 EUR')
  })

  it('no agrega separador a montos chicos', () => {
    expect(formatMoney(m('999', 0))).toBe('$999 COP')
  })
})
