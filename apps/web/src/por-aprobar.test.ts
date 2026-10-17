import { describe, expect, it } from 'vitest'
import { ataque, cuidadoDeMama, medicina } from '../../../contracts/ejemplo.js'
import { renderPorAprobar } from './por-aprobar.js'

describe('renderPorAprobar', () => {
  it('muestra una fila por gasto awaiting-approval, con enlace a su gasto', () => {
    const html = renderPorAprobar([ataque], cuidadoDeMama)
    expect(html).toContain('Farmacia (cuenta nueva)')
    expect(html).toContain('Billetera: Cuidado de mamá')
    expect(html).toContain('$120.000')
    expect(html).toContain('Riesgo alto · 94')
    expect(html).toContain(`href="#/gasto/${ataque.id}"`)
    expect(html).toContain('class="pedido"')
  })

  it('no muestra gastos que no están awaiting-approval', () => {
    const html = renderPorAprobar([medicina], cuidadoDeMama)
    expect(html).not.toContain(medicina.destination.name)
    expect(html).toContain('No hay pagos por aprobar')
  })

  it('estado vacío cuando no hay ningún gasto', () => {
    const html = renderPorAprobar([], cuidadoDeMama)
    expect(html).toContain('<p class="vacio" role="status">No hay pagos por aprobar</p>')
  })

  it('escapa los datos de la billetera y del gasto', () => {
    const wallet = structuredClone(cuidadoDeMama)
    wallet.name = '<script>alert(1)</script>'
    const spend = structuredClone(ataque)
    spend.destination.name = '<img src=x>'

    const html = renderPorAprobar([spend], wallet)

    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;img')
  })

  it('no usa la palabra "saldo" ni "multifirma"', () => {
    const html = renderPorAprobar([ataque], cuidadoDeMama).toLowerCase()
    expect(html).not.toContain('saldo')
    expect(html).not.toContain('multifirma')
  })
})
