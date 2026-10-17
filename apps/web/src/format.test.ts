import { describe, expect, it } from 'vitest'
import { flagFor, formatMoney, progressText, riskLevel, statusLabel } from './format.js'

describe('formatMoney', () => {
  it('conserva centavos COP y enteros grandes sin redondear dinero', () => {
    expect(formatMoney({ value: '150', assetCode: 'COP', assetScale: 2 })).toBe('$1,5')
    expect(formatMoney({ value: '9007199254740993', assetCode: 'COP', assetScale: 0 })).toContain('9.007.199.254.740.993')
    expect(() => formatMoney({ value: 'NaN', assetCode: 'COP', assetScale: 2 })).toThrow()
  })
  it('COP sin decimales', () => {
    expect(formatMoney({ value: '30000000', assetCode: 'COP', assetScale: 2 })).toBe('$300.000')
  })

  it('EUR con dos decimales', () => {
    expect(formatMoney({ value: '2200', assetCode: 'EUR', assetScale: 2 })).toBe('€22,00')
  })

  it('USD con dos decimales', () => {
    expect(formatMoney({ value: '2250', assetCode: 'USD', assetScale: 2 })).toBe('US$22,50')
  })
})

describe('flagFor', () => {
  it('reconoce COP, EUR y USD, y da bandera genérica para el resto', () => {
    expect(flagFor('COP')).toBe('🇨🇴')
    expect(flagFor('EUR')).toBe('🇪🇸')
    expect(flagFor('USD')).toBe('🇺🇸')
    expect(flagFor('GBP')).toBe('🏳️')
  })
})

describe('riskLevel', () => {
  it('39 es riesgo bajo', () => {
    expect(riskLevel(39)).toEqual({ label: 'Riesgo bajo', tone: 'verde' })
  })

  it('40 es riesgo medio', () => {
    expect(riskLevel(40)).toEqual({ label: 'Riesgo medio', tone: 'ambar' })
  })

  it('69 es riesgo medio', () => {
    expect(riskLevel(69)).toEqual({ label: 'Riesgo medio', tone: 'ambar' })
  })

  it('70 es riesgo alto', () => {
    expect(riskLevel(70)).toEqual({ label: 'Riesgo alto', tone: 'rojo' })
  })

  it('94 es riesgo alto', () => {
    expect(riskLevel(94)).toEqual({ label: 'Riesgo alto', tone: 'rojo' })
  })
})

describe('progressText', () => {
  it('con un nombre faltante', () => {
    expect(progressText({ confirmed: 2, total: 3 }, ['Madrid'])).toBe('2 de 3 aportes confirmados · falta Madrid')
  })

  it('con dos nombres faltantes', () => {
    expect(progressText({ confirmed: 1, total: 3 }, ['Madrid', 'Bogotá'])).toBe(
      '1 de 3 aportes confirmados · faltan Madrid y Bogotá'
    )
  })

  it('completo, sin nombres faltantes', () => {
    expect(progressText({ confirmed: 3, total: 3 }, [])).toBe('3 de 3 aportes confirmados')
  })
})

describe('statusLabel', () => {
  it('paid no es igual a incomplete', () => {
    expect(statusLabel('paid')).not.toBe(statusLabel('incomplete'))
  })
})
