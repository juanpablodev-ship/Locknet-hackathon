import { describe, expect, it } from 'vitest'
import { moneyFromMajor } from './money-input.js'
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
