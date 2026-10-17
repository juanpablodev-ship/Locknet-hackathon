import { describe, expect, it } from 'vitest'
import { renderAppChrome, renderBandaRespaldo, renderEncabezado, renderPestanas } from './navegacion.js'

const base = {
  mode: 'live' as const,
  nombreBilletera: 'Cuidado de mamá',
  numeroMiembros: 3,
  tema: 'light' as const,
  contadorPorAprobar: 0,
}

describe('banda de modo respaldo', () => {
  it('solo aparece en modo fixtures', () => {
    expect(renderBandaRespaldo('fixtures')).toContain('MODO RESPALDO · respuestas reales grabadas')
    expect(renderBandaRespaldo('live')).toBe('')
  })

  it('muestra y escapa la etiqueta completa recibida del servidor', () => {
    expect(renderBandaRespaldo('fixtures', 'Modo respaldo — <datos simulados>')).toContain(
      'Modo respaldo — &lt;datos simulados&gt;',
    )
  })
})

describe('encabezado', () => {
  it('muestra el nombre de la billetera y el número de miembros', () => {
    const html = renderEncabezado('Cuidado de mamá', 3, 'light')
    expect(html).toContain('Cuidado de mamá')
    expect(html).toContain('3 miembros')
  })

  it('muestra "Kivor" junto al nombre del grupo, antes de él', () => {
    const html = renderEncabezado('Cuidado de mamá', 3, 'light')
    expect(html).toContain('<small class="cab-marca">Kivor</small>')
    expect(html.indexOf('Kivor')).toBeLessThan(html.indexOf('Cuidado de mamá'))
  })

  it('escapa el nombre del grupo sin perder la marca', () => {
    const html = renderEncabezado('<img src=x>', 1, 'light')
    expect(html).toContain('Kivor')
    expect(html).not.toContain('<img')
  })

  it('usa el singular con un solo miembro', () => {
    expect(renderEncabezado('Billetera', 1, 'light')).toContain('1 miembro<')
  })

  it('el botón de tema ofrece el tema contrario al actual', () => {
    expect(renderEncabezado('Billetera', 1, 'light')).toContain('Tema oscuro')
    expect(renderEncabezado('Billetera', 1, 'dark')).toContain('Tema claro')
  })
})

describe('pestañas', () => {
  it('muestra las tres pestañas y marca Inicio activa', () => {
    const html = renderPestanas({ name: 'inicio' }, 0)
    expect(html).toContain('href="#/inicio"')
    expect(html).toContain('href="#/por-aprobar"')
    expect(html).toContain('href="#/historial"')
    expect(html).toContain('aria-current="page"')
  })

  it('marca "Por aprobar" activa también en la pantalla de un gasto', () => {
    const html = renderPestanas({ name: 'gasto', id: 's-1' }, 0)
    expect(html).toContain('class="tab-activa" href="#/por-aprobar"')
  })

  it('muestra el contador cuando hay gastos por aprobar y lo omite si es 0', () => {
    expect(renderPestanas({ name: 'inicio' }, 2)).toContain('Por aprobar<i>2</i>')
    expect(renderPestanas({ name: 'inicio' }, 0)).toContain('Por aprobar</a>')
    expect(renderPestanas({ name: 'inicio' }, 0)).not.toContain('<i>0</i>')
  })
})

describe('renderAppChrome', () => {
  it('combina la banda fixtures, el encabezado y las pestañas en ese orden', () => {
    const html = renderAppChrome({ ...base, route: { name: 'inicio' }, mode: 'fixtures' })
    expect(html.indexOf('MODO RESPALDO')).toBeLessThan(html.indexOf('class="cab"'))
    expect(html.indexOf('class="cab"')).toBeLessThan(html.indexOf('class="tabs"'))
  })

  it('muestra el reinicio junto a la navegación tanto en live como en fixtures', () => {
    for (const mode of ['live', 'fixtures'] as const) {
      const html = renderAppChrome({ ...base, route: { name: 'inicio' }, mode })
      expect(html).toContain('data-accion="reiniciar-demo">Reiniciar</button>')
    }
  })
})
