import { describe, expect, it } from 'vitest'
import { cuidadoDeMama, destinoParecido } from '../../../contracts/ejemplo.js'
import { qrComoSvg, renderUnirse, renderVueltaUnirse } from './unirse.js'

describe('qrComoSvg', () => {
  it('genera un SVG para la URL de invitación', async () => {
    await expect(qrComoSvg('https://example.test/#/unirse')).resolves.toContain('<svg')
  })
})

describe('renderUnirse', () => {
  it('muestra el QR y el formulario para unirse', () => {
    const html = renderUnirse(cuidadoDeMama, '<svg aria-hidden="true"></svg>')
    expect(html).toContain('Escanea para unirte a Cuidado de mamá')
    expect(html).toContain('name="walletAddress"')
    expect(html).toContain('name="cap"')
    expect(html).toContain('Tope por período')
    expect(html).toContain('class="tarjeta-invitacion"')
    expect(html).toContain('id="cancelar-union"')
  })

  it('solo muestra la advertencia y sus dos botones con status warn', () => {
    const sinAdvertencia = renderUnirse(cuidadoDeMama, '<svg></svg>')
    const conAdvertencia = renderUnirse(cuidadoDeMama, '<svg></svg>', {
      ...destinoParecido,
      check: 'grant',
      userMessage: 'Revisa el permiso antes de seguir.',
    })

    expect(sinAdvertencia).not.toContain('Revisa el permiso')
    expect(conAdvertencia).toContain('Revisa el permiso antes de seguir.')
    expect(conAdvertencia).toContain('Unirme de todas formas')
    expect(conAdvertencia).toContain('Cancelar')
  })

  it('escapa el nombre de la billetera', () => {
    const wallet = structuredClone(cuidadoDeMama)
    wallet.name = '<script>alert(1)</script>'

    const html = renderUnirse(wallet, '<svg></svg>')

    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapa la moneda usada en el tope mensual', () => {
    const wallet = structuredClone(cuidadoDeMama)
    wallet.currency = '<img src=x>'
    const html = renderUnirse(wallet, '<svg></svg>')

    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x&gt;')
  })

  it('muestra los dos resultados de la vuelta del banco', () => {
    expect(renderVueltaUnirse(true)).toContain('Ya eres parte del grupo')
    expect(renderVueltaUnirse(false)).toContain('No pudimos confirmar que vienes de tu banco. No te uniste.')
  })
})
