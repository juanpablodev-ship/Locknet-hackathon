import { describe, expect, it } from 'vitest'
import { armarBorrador, renderCrearGrupo, renderVistaPreviaContrato, validarGrupo, VALORES_INICIALES, type ValoresGrupo } from './crear-grupo.js'

const completo: ValoresGrupo = {
  ...VALORES_INICIALES, nombre: 'Medicinas de mamá', destinoNombre: 'Farmacia Medellín',
  destinoDireccion: 'https://ilp.interledger-test.dev/farmacia-medellin', tope: '40000',
}

describe('renderCrearGrupo', () => {
  it('muestra los campos con sus textos de ayuda y los valores por defecto', () => {
    const html = renderCrearGrupo()
    expect(html).toContain('placeholder="Medicinas de mamá"')
    expect(html).toContain('placeholder="Farmacia Medellín"')
    expect(html).toContain('placeholder="https://ilp.interledger-test.dev/farmacia-medellin"')
    expect(html).toContain('Pedir aprobación del grupo para pagos mayores a')
    expect(html).toContain('value="200000"')
    expect(html).toContain('<option value="COP" selected>')
    expect(html).toContain('<option value="2" selected>')
    expect(html).toMatch(/<option value="3">3<\/option>/)
    expect(html).not.toContain('<option value="4"')
    expect(html).toContain('Open Sentinels')
  })

  it('pliega el umbral de riesgo en Avanzado, con 60 por defecto', () => {
    const html = renderCrearGrupo()
    expect(html).toMatch(/<details class="avanzado-grupo">\s*<summary>Avanzado<\/summary>[\s\S]*value="60"/)
  })

  it('escapa lo que escribió la persona', () => {
    const html = renderCrearGrupo({ ...completo, nombre: '"><script>x</script>' })
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('muestra cada error junto a su campo y abre Avanzado si el error está ahí', () => {
    const html = renderCrearGrupo(completo, { nombre: 'Escribe el nombre del grupo.', riesgo: 'Número inválido' })
    expect(html).toContain('<p class="error-campo" id="error-nombre" role="alert">Escribe el nombre del grupo.</p>')
    expect(html).toContain('<details class="avanzado-grupo" open>')
    expect(html).toContain('id="error-monto" role="alert" hidden')
  })

  it('no usa palabras prohibidas', () => {
    expect(renderCrearGrupo().toLowerCase()).not.toMatch(/saldo|multifirma|billetera compartida/)
  })
})

describe('tope por persona', () => {
  it('el formulario pide cuánto autoriza cada uno al mes, vacío y con ejemplo', () => {
    const html = renderCrearGrupo()
    expect(html).toContain('Cada uno autoriza hasta (al mes)')
    expect(html).toContain('id="tope-persona"')
    expect(html).toContain('placeholder="40000" value=""')
    expect(html).toContain('Se renueva cada mes.')
  })

  it('es obligatorio: vacío da error junto al campo y no hay cuerpo', () => {
    const { errores, body } = validarGrupo({ ...completo, tope: '' })
    expect(body).toBeUndefined()
    expect(errores.tope).toBeDefined()
    expect(renderCrearGrupo(completo, errores)).toContain('id="error-tope" role="alert">')
  })

  it.each(['0', '-1', '40.000', 'abc'])('rechaza el tope %s', (tope) => {
    expect(validarGrupo({ ...completo, tope }).errores.tope).toBeDefined()
  })

  it('se envía en escala 2 y en la moneda elegida', () => {
    expect(validarGrupo({ ...completo, moneda: 'EUR', tope: '25' }).body?.memberCap).toEqual({ cap: { value: '2500', assetCode: 'EUR', assetScale: 2 } })
  })
})

describe('vista previa del contrato', () => {
  it('refleja los valores del borrador', () => {
    const html = renderVistaPreviaContrato({ ...completo, monto: '350000', aprobaciones: '3' })
    expect(html).toContain('El contrato del grupo')
    expect(html).toContain('$350.000')
    expect(html).toContain('3 aprobaciones')
    expect(html).toContain('Destinos de confianza: Farmacia Medellín')
  })

  it('tolera valores a medio escribir sin lanzar', () => {
    const borrador = armarBorrador({ ...VALORES_INICIALES, monto: '20x', aprobaciones: '', riesgo: '' })
    expect(borrador.rules.groupApproval).toMatchObject({ approvalsRequired: 2, riskThreshold: 60, aboveAmount: { value: '0' } })
    expect(renderVistaPreviaContrato(VALORES_INICIALES)).toContain('ninguno todavía')
  })

  it('usa la moneda elegida', () => {
    expect(renderVistaPreviaContrato({ ...completo, moneda: 'EUR', monto: '500' })).toContain('€500')
  })
})

describe('validarGrupo', () => {
  it('con todo bien devuelve el cuerpo para el servidor, en escala 2', () => {
    const { errores, body } = validarGrupo(completo)
    expect(errores).toEqual({})
    expect(body).toEqual({
      name: 'Medicinas de mamá', currency: 'COP', approvalsRequired: 2, riskThreshold: 60,
      aboveAmount: { value: '20000000', assetCode: 'COP', assetScale: 2 },
      memberCap: { cap: { value: '4000000', assetCode: 'COP', assetScale: 2 } },
      knownDestinations: [{ name: 'Farmacia Medellín', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medellin' }],
    })
  })

  it('quita espacios al inicio y al final', () => {
    expect(validarGrupo({ ...completo, nombre: '  Mamá  ' }).body?.name).toBe('Mamá')
  })

  it('acepta direcciones con $', () => {
    expect(validarGrupo({ ...completo, destinoDireccion: '$ilp.example/farmacia' }).body).toBeDefined()
  })

  it('campos vacíos dan un error por campo y no hay cuerpo', () => {
    const { errores, body } = validarGrupo({ ...completo, nombre: '  ', destinoNombre: '', destinoDireccion: '', monto: '' })
    expect(body).toBeUndefined()
    expect(Object.keys(errores).sort()).toEqual(['destinoDireccion', 'destinoNombre', 'monto', 'nombre'])   // el tope ya viene lleno en `completo`
  })

  it.each(['http://a.dev/x', 'farmacia', 'https://'])('rechaza la dirección %s', (direccion) => {
    const { errores, body } = validarGrupo({ ...completo, destinoDireccion: direccion })
    expect(body).toBeUndefined()
    expect(errores.destinoDireccion).toContain('https://')
  })

  it.each(['0', '-5', '200.000', 'abc'])('rechaza el monto %s', (monto) => {
    expect(validarGrupo({ ...completo, monto }).errores.monto).toBeDefined()
  })

  it.each(['0', '4', '1.5', ''])('rechaza %s aprobaciones', (aprobaciones) => {
    expect(validarGrupo({ ...completo, aprobaciones }).errores.aprobaciones).toBeDefined()
  })

  it.each(['0', '101', '50.5', '', 'x'])('rechaza el umbral de riesgo %s', (riesgo) => {
    expect(validarGrupo({ ...completo, riesgo }).errores.riesgo).toBeDefined()
  })
})
