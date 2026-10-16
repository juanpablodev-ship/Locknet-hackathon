import { describe, expect, it } from 'vitest'
import type { Money } from '../../../contracts/index.js'
import { reconcile } from '../src/reconcile.js'

const cop = (pesos: number, assetScale = 2): Money => ({ value: String(pesos * 10 ** assetScale), assetCode: 'COP', assetScale })

describe('reconcile', () => {
  it('exacto → pass', () => {
    expect(reconcile({ expected: cop(120_000), received: cop(120_000) })).toMatchObject({
      check: 'reconcile', status: 'pass', riskPoints: 0, userMessage: 'Gasto verificado: llegaron $120.000 COP.',
    })
  })

  it('de más → pass', () => {
    expect(reconcile({ expected: cop(120_000), received: cop(121_000) }).status).toBe('pass')
  })

  it('de menos → warn 50 con la diferencia formateada', () => {
    expect(reconcile({ expected: cop(120_000), received: cop(80_000) })).toMatchObject({
      status: 'warn', riskPoints: 50,
      userMessage: 'Llegaron $80.000 COP de $120.000 COP. Falta $40.000 COP.',
    })
  })

  it('una unidad menos → warn con decimales', () => {
    const v = reconcile({ expected: { value: '12000000', assetCode: 'COP', assetScale: 2 }, received: { value: '11999999', assetCode: 'COP', assetScale: 2 } })
    expect(v.status).toBe('warn')
    expect(v.userMessage).toContain('Falta $0,01 COP.')
  })

  it('moneda distinta → warn 50', () => {
    expect(reconcile({ expected: cop(1000), received: { value: '100000', assetCode: 'EUR', assetScale: 2 } })).toMatchObject({
      status: 'warn', riskPoints: 50, userMessage: 'No pudimos verificar lo que llegó.',
    })
  })

  it('assetScale distintos: 100,00 (escala 2) equivale a 100 (escala 0)', () => {
    expect(reconcile({ expected: cop(100, 2), received: cop(100, 0) }).status).toBe('pass')
    expect(reconcile({ expected: cop(100, 0), received: { value: '9999', assetCode: 'COP', assetScale: 2 } })).toMatchObject({
      status: 'warn', userMessage: 'Llegaron $99,99 COP de $100 COP. Falta $0,01 COP.',
    })
  })
})
