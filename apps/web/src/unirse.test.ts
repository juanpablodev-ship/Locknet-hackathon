import { describe, expect, it } from 'vitest'
import { cuidadoDeMama, destinoParecido } from '../../../contracts/ejemplo.js'
import { qrComoSvg, renderGrupoNoExiste, renderSinWalletPropia, renderUnirse, renderVueltaUnirse, topeDelContrato, urlInvitacion } from './unirse.js'

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

describe('enlace "Unirse al grupo" cuando no hay wallet propia', () => {
  it('lleva el grupo actual, escapado', () => {
    const html = renderSinWalletPropia('w-mama-a1b2c3')
    expect(html).toContain('href="#/unirse?grupo=w-mama-a1b2c3"')
    expect(renderSinWalletPropia('a&b"c')).toContain('href="#/unirse?grupo=a%26b%22c"')
  })
})

describe('unirse con el tope del contrato', () => {
  const conTope = () => {
    const w = structuredClone(cuidadoDeMama)
    w.rules.memberCap = { cap: { value: '4000000', assetCode: 'COP', assetScale: 2 }, interval: 'R12/2026-10-16T00:00:00Z/P1M' }
    return w
  }

  it('con memberCap, tope e intervalo vienen llenos y en solo lectura, con su texto', () => {
    const html = renderUnirse(conTope(), '<svg></svg>')
    expect(html).toContain('id="tope-miembro" name="cap" type="text" inputmode="decimal" value="40000" readonly')
    expect(html).toContain('id="intervalo-miembro" name="interval" type="text" value="R12/2026-10-16T00:00:00Z/P1M" readonly')
    expect(html).toContain('Lo fija el contrato del grupo.')
    expect(html).not.toContain('<p id="nota-tope-contrato" class="nota-configuracion" hidden>')
  })

  it('sin memberCap los campos siguen editables y sin nota', () => {
    const html = renderUnirse(cuidadoDeMama, '<svg></svg>')
    expect(html).toContain('value="100000" required')
    expect(html).not.toContain('readonly')
    expect(html).toContain('id="nota-tope-contrato" class="nota-configuracion" hidden')
  })

  it('topeDelContrato: fijo en la moneda del grupo; editable, con otra nota, en otra moneda', () => {
    expect(topeDelContrato(conTope(), 'COP')).toEqual({ fijo: true, tope: '40000', interval: 'R12/2026-10-16T00:00:00Z/P1M', nota: 'Lo fija el contrato del grupo.' })
    expect(topeDelContrato(conTope(), 'EUR')).toEqual({ fijo: false, nota: 'En otra moneda, el tope lo defines tú.' })
    expect(topeDelContrato(cuidadoDeMama, 'EUR')).toEqual({ fijo: false, nota: '' })
  })
})
