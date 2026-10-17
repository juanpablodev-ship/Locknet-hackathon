import { describe, expect, it } from 'vitest'
import { moneyFromMajor, moneyToMajor } from './money-input.js'
describe('entrada de monto en la escala real de la wallet', () => {
  it('COP y EUR con decimales exactos sin Number', () => {
    expect(moneyFromMajor('40000', 'COP', 2).value).toBe('4000000')
    expect(moneyFromMajor('22,01', 'EUR', 2).value).toBe('2201')
    expect(moneyFromMajor('9007199254740993', 'COP', 0).value).toBe('9007199254740993')
  })
  it('rechaza cero, negativos y mas decimales que la wallet', () => {
    for (const input of ['0', '-1', '1.001', 'NaN']) expect(() => moneyFromMajor(input, 'EUR', 2)).toThrow()
  })
})

describe('moneyToMajor', () => {
  it('es el inverso de moneyFromMajor', () => {
    for (const input of ['40000', '22.01', '22.5', '1']) expect(moneyToMajor(moneyFromMajor(input, 'EUR', 2))).toBe(input)
  })
  it('falla con un valor que no es un entero', () => {
    expect(() => moneyToMajor({ value: 'abc', assetCode: 'COP', assetScale: 2 })).toThrow()
  })
})
