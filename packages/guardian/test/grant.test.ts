import { describe, expect, it } from 'vitest'
import type { Money } from '../../../contracts/index.js'
import { checkGrantRequest } from '../src/grant.js'

const cop = (pesos: number, assetScale = 2): Money => ({ value: String(pesos * 10 ** assetScale), assetCode: 'COP', assetScale })
const policy = { maxCap: cop(500_000) }
const interval = 'R12/2026-10-16T00:00:00Z/P1M'

describe('checkGrantRequest', () => {
  it('100.000 COP mensual con tope 500.000 → pass', () => {
    expect(checkGrantRequest({ debitAmount: cop(100_000), interval, policy })).toMatchObject({
      check: 'grant', status: 'pass', riskPoints: 0, userMessage: 'El permiso pide un tope normal.',
    })
  })

  it('el intervalo del snippet oficial (R sin número) es válido', () => {
    expect(checkGrantRequest({ debitAmount: cop(100_000), interval: 'R/2016-08-24T08:00:00Z/P1D', policy }).status).toBe('pass')
  })

  it('5.000.000 COP sin interval → warn con el monto y "sin límite de tiempo"', () => {
    const v = checkGrantRequest({ debitAmount: cop(5_000_000), policy })
    expect(v.status).toBe('warn')
    expect(v.riskPoints).toBe(100)
    expect(v.userMessage).toBe('Esta billetera te pide autorizar hasta $5.000.000 COP sin límite de tiempo. Es mucho más de lo normal.')
  })

  it('sin debitAmount → warn ≥ 80, sin tope', () => {
    const v = checkGrantRequest({ interval, policy })
    expect(v.status).toBe('warn')
    expect(v.riskPoints).toBeGreaterThanOrEqual(80)
    expect(v.userMessage).toBe('Esta billetera te pide autorizar pagos sin tope.')
  })

  it('sin tope y sin intervalo → mensaje combinado', () => {
    expect(checkGrantRequest({ policy }).userMessage).toBe('Esta billetera te pide autorizar pagos sin tope y sin límite de tiempo.')
  })

  it('sobre el tope pero con intervalo → no menciona el tiempo', () => {
    expect(checkGrantRequest({ debitAmount: cop(5_000_000), interval, policy }).userMessage).toBe(
      'Esta billetera te pide autorizar hasta $5.000.000 COP. Es mucho más de lo normal.',
    )
  })

  it('assetScale 2 vs 0 se comparan bien', () => {
    const maxCap = cop(500_000, 0)
    expect(checkGrantRequest({ debitAmount: cop(400_000, 2), interval, policy: { maxCap } }).status).toBe('pass')
    expect(checkGrantRequest({ debitAmount: cop(600_000, 2), interval, policy: { maxCap } })).toMatchObject({ status: 'warn', riskPoints: 60 })
  })

  it('assetCode distinto → warn 30', () => {
    const eur = { value: '100', assetCode: 'EUR', assetScale: 2 }
    expect(checkGrantRequest({ debitAmount: eur, interval, policy })).toMatchObject({
      status: 'warn', riskPoints: 30, userMessage: 'No pudimos comparar el tope con lo normal.',
    })
  })

  it('intervalo con formato inválido → warn 30', () => {
    expect(checkGrantRequest({ debitAmount: cop(1), interval: 'mensual', policy })).toMatchObject({ status: 'warn', riskPoints: 30 })
  })

  it('sin interval y sin mensaje de tope → mensaje propio', () => {
    expect(checkGrantRequest({ debitAmount: cop(1), policy })).toMatchObject({ riskPoints: 40, userMessage: 'El permiso no tiene límite de tiempo.' })
  })

  it('nunca devuelve block y el tope es 100', () => {
    const v = checkGrantRequest({ policy })
    expect(v.status).not.toBe('block')
    expect(v.riskPoints).toBeLessThanOrEqual(100)
  })
})
