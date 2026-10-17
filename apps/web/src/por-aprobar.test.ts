import { describe, expect, it } from 'vitest'
import { ataque, cuidadoDeMama, medicina } from '../../../contracts/ejemplo.js'
import { renderPorAprobar } from './por-aprobar.js'

describe('renderPorAprobar', () => {
  it('muestra una fila por gasto awaiting-approval, con enlace a su gasto', () => {
    const html = renderPorAprobar([ataque], cuidadoDeMama)
    expect(html).toContain('Farmacia (cuenta nueva)')
    expect(html).toContain(`href="#/gasto/${ataque.id}"`)
  })

  it('no muestra gastos que no están awaiting-approval', () => {
    const html = renderPorAprobar([medicina], cuidadoDeMama)
    expect(html).not.toContain(medicina.destination.name)
    expect(html).toContain('No hay pagos por aprobar')
  })

  it('estado vacío cuando no hay ningún gasto', () => {
    const html = renderPorAprobar([], cuidadoDeMama)
    expect(html).toContain('No hay pagos por aprobar')
  })

  it('no usa la palabra "saldo" ni "multifirma"', () => {
    const html = renderPorAprobar([ataque], cuidadoDeMama).toLowerCase()
    expect(html).not.toContain('saldo')
    expect(html).not.toContain('multifirma')
  })
})
