import { describe, expect, it } from 'vitest'
import type { Spend } from '../../../contracts/index.js'
import { ataque, cuidadoDeMama, medicina } from '../../../contracts/ejemplo.js'
import { renderHistorial } from './historial.js'

describe('renderHistorial', () => {
  it('muestra una fila y un enlace por gasto', () => {
    const html = renderHistorial([medicina, ataque], cuidadoDeMama)

    expect(html.match(/class="fila-gasto fila-gasto-/g)).toHaveLength(2)
    expect(html).toContain('class="fila-gasto fila-gasto-verde"')
    expect(html).toContain('class="fila-gasto fila-gasto-ambar"')
    expect(html).toContain('href="#/gasto/s-medicina"')
    expect(html).toContain('href="#/gasto/s-ataque"')
  })

  it('solo muestra el sello de verificación para gastos paid', () => {
    const solicitado: Spend = { ...structuredClone(ataque), status: 'requested' }
    const html = renderHistorial([medicina, solicitado], cuidadoDeMama)

    expect(html.match(/Gasto verificado/g)).toHaveLength(1)
    expect(renderHistorial([solicitado], cuidadoDeMama)).not.toContain('Gasto verificado')
  })

  it('identifica los rechazos del grupo', () => {
    const rechazado: Spend = { ...structuredClone(ataque), status: 'rejected' }
    expect(renderHistorial([rechazado], cuidadoDeMama)).toContain('Rechazado por el grupo')
  })

  it('muestra el estado vacío sin gastos', () => {
    const html = renderHistorial([], cuidadoDeMama)
    expect(html).toContain('class="sin-historial"')
    expect(html).toContain('Todavía no hay gastos en este grupo')
    expect(html).toContain('href="#/gasto/nuevo"')
    expect(html).toContain('class="contador-historial">0 gastos')
  })

  it('resume la cantidad de gastos y da acceso a cada recibo', () => {
    const html = renderHistorial([medicina], cuidadoDeMama)
    expect(html).toContain('class="contador-historial">1 gasto')
    expect(html).toContain('class="btn peq" href="#/gasto/s-medicina"')
  })

  it('escapa el nombre del destino', () => {
    const spend = structuredClone(medicina)
    spend.destination.name = '<script>alert(1)</script>'

    const html = renderHistorial([spend], cuidadoDeMama)

    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapa el código monetario del gasto', () => {
    const spend = structuredClone(medicina)
    spend.amount.assetCode = '<img src=x>'

    expect(renderHistorial([spend], cuidadoDeMama)).not.toContain('<img')
  })
})
