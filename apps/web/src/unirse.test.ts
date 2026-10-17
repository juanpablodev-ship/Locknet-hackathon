import { describe, expect, it } from 'vitest'
import { cuidadoDeMama, destinoParecido } from '../../../contracts/ejemplo.js'
import { qrComoSvg, renderGrupoNoExiste, renderUnirse, renderVueltaUnirse, urlInvitacion } from './unirse.js'

describe('qrComoSvg', () => {
  it('genera un SVG para la URL de invitación', async () => {
    await expect(qrComoSvg('https://example.test/#/unirse')).resolves.toContain('<svg')
  })
})

describe('renderUnirse', () => {
  it('muestra el aviso de grupo creado solo cuando se pide', () => {
    const aviso = 'Grupo creado. Comparte esta invitación; empieza por unirte tú.'
    expect(renderUnirse(cuidadoDeMama, '<svg></svg>', undefined, undefined, true)).toContain(aviso)
    expect(renderUnirse(cuidadoDeMama, '<svg></svg>')).not.toContain('Grupo creado')
  })

  it('muestra el QR y el formulario para unirse', () => {
    const html = renderUnirse(cuidadoDeMama, '<svg aria-hidden="true"></svg>')
    expect(html).toContain('Escanea para unirte a Cuidado de mamá')
    expect(html).toContain('name="walletAddress"')
    expect(html).toContain('name="cap"')
    expect(html).toContain('Tope por período')
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

describe('invitación con el grupo', () => {
  it('la URL incluye el id del grupo', () => {
    expect(urlInvitacion('https://kivor.test/app', 'w-mama-a1b2c3')).toBe('https://kivor.test/app#/unirse?grupo=w-mama-a1b2c3')
  })

  it('el id se escapa para no romper la URL', () => {
    const url = urlInvitacion('https://kivor.test/', 'a&b=c#d e')
    expect(url).toBe('https://kivor.test/#/unirse?grupo=a%26b%3Dc%23d%20e')
    expect(url.split('#')).toHaveLength(2)
  })

  it('renderUnirse muestra el enlace para copiar, escapado, solo si se pasa', () => {
    const con = renderUnirse(cuidadoDeMama, '<svg></svg>', undefined, undefined, false, 'https://k.test/#/unirse?grupo="x"')
    expect(con).toContain('id="enlace-invitacion"')
    expect(con).toContain('grupo=&quot;x&quot;')
    expect(renderUnirse(cuidadoDeMama, '<svg></svg>')).not.toContain('enlace-invitacion')
  })

  it('avisa cuando el grupo no existe y enlaza al inicio', () => {
    const html = renderGrupoNoExiste()
    expect(html).toContain('Este grupo no existe o el servidor se reinició.')
    expect(html).toContain('href="#/inicio"')
  })
})
