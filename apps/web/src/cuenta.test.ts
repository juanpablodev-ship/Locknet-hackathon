import { describe, expect, it } from 'vitest'
import { cuentaMasParecida, distanciaEdicion, resaltarDiferencias } from './cuenta.js'

describe('distanciaEdicion', () => {
  it('cuenta inserciones, eliminaciones y sustituciones', () => {
    expect(distanciaEdicion('gato', 'gata')).toBe(1)
    expect(distanciaEdicion('gato', 'gatito')).toBe(2)
    expect(distanciaEdicion('gato', 'ato')).toBe(1)
  })
})

describe('cuentaMasParecida', () => {
  const farmacia = { name: 'Farmacia Medellín', walletAddress: 'https://interledger.test/farmacia-medellin' }

  it('elige la cuenta conocida más cercana por distancia de edición', () => {
    const otra = { name: 'Otra cuenta', walletAddress: 'https://interledger.test/otra-cuenta' }

    expect(cuentaMasParecida([otra, farmacia], 'https://interledger.test/farmacia-medel1in')).toBe(farmacia)
  })

  it('devuelve undefined cuando la cuenta nueva no se parece a ninguna conocida', () => {
    expect(cuentaMasParecida([farmacia], 'https://cuentas.nuevas.example/tienda-distinta')).toBeUndefined()
    expect(cuentaMasParecida([], farmacia.walletAddress)).toBeUndefined()
  })
})

describe('resaltarDiferencias', () => {
  it('marca solo el carácter distinto entre farmacia-medellin y farmacia-medel1in', () => {
    const resultado = resaltarDiferencias('farmacia-medellin', 'farmacia-medel1in')

    expect(resultado).toEqual({
      conocidaHtml: 'farmacia-medel<mark>l</mark>in',
      nuevaHtml: 'farmacia-medel<mark>1</mark>in',
    })
  })

  it('marca el segmento distinto cuando las cuentas tienen longitudes diferentes', () => {
    expect(resaltarDiferencias('cuenta-conocida', 'cuenta-nueva-conocida')).toEqual({
      conocidaHtml: 'cuenta-conocida',
      nuevaHtml: 'cuenta-<mark>nueva-</mark>conocida',
    })
  })

  it('escapa HTML de las dos cuentas antes de marcarlo', () => {
    const resultado = resaltarDiferencias('<script>', '<script')

    expect(resultado.conocidaHtml).not.toContain('<script>')
    expect(resultado.nuevaHtml).not.toContain('<script')
    expect(resultado.conocidaHtml).toContain('&lt;script')
    expect(resultado.conocidaHtml).toContain('<mark>&gt;</mark>')
    expect(resultado.nuevaHtml).toContain('&lt;script')
  })
})
