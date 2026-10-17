import { describe, expect, it } from 'vitest'
import { cuidadoDeMama } from '../../../contracts/ejemplo.js'
import { previewReparto, renderGastoNuevo } from './gasto-nuevo.js'

describe('renderGastoNuevo', () => {
  it('lista los destinos conocidos de la billetera', () => {
    expect(renderGastoNuevo(cuidadoDeMama)).toContain('Farmacia Medellín')
  })

  it('mantiene los selectores del flujo real dentro del nuevo formulario visual', () => {
    const html = renderGastoNuevo(cuidadoDeMama)
    expect(html).toContain('id="form-gasto"')
    expect(html).toContain('id="destino"')
    expect(html).toContain('id="otro-destino"')
    expect(html).toContain('class="btn lleno" type="submit"')
  })

  it('muestra la moneda actual en el monto', () => {
    const wallet = structuredClone(cuidadoDeMama)
    wallet.currency = 'EUR'

    expect(renderGastoNuevo(wallet)).toContain('Monto en EUR')
  })

  it('muestra el reparto de $120.000 entre tres miembros activos', () => {
    expect(renderGastoNuevo(cuidadoDeMama)).toContain('Cada uno pone: $40.000')
  })

  it('marca con ≈ un reparto no exacto', () => {
    expect(previewReparto(120001, cuidadoDeMama)).toBe('Cada uno pone: ≈$40.000')
  })

  it('no muestra vocabulario prohibido', () => {
    expect(renderGastoNuevo(cuidadoDeMama).toLowerCase()).not.toContain('saldo')
  })

  it('escapa los nombres y direcciones de destinos del contrato', () => {
    const wallet = structuredClone(cuidadoDeMama)
    wallet.knownDestinations[0].name = '<script>'
    wallet.knownDestinations[0].walletAddress = 'https://example.test/?q="x"'

    const html = renderGastoNuevo(wallet)

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&quot;x&quot;')
  })

  it('escapa el código monetario en la vista previa', () => {
    const wallet = structuredClone(cuidadoDeMama)
    wallet.currency = '<img src=x>'

    expect(previewReparto(120000, wallet)).not.toContain('<img')
    expect(renderGastoNuevo(wallet)).not.toContain('<img')
    expect(renderGastoNuevo(wallet)).toContain('&lt;img src=x&gt;')
  })
})
