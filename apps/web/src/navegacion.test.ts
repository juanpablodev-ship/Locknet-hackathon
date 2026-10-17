import { describe, expect, it } from 'vitest'
import { renderAppChrome, renderBandaRespaldo, renderMenuNavegacion } from './navegacion.js'

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

describe('menú de navegación', () => {
  it('muestra cuatro rutas y marca la pantalla actual', () => {
    const html = renderMenuNavegacion({ name: 'historial' })

    expect(html).toContain('href="#/inicio"')
    expect(html).toContain('href="#/gasto/nuevo"')
    expect(html).toContain('href="#/unirse"')
    expect(html).toContain('href="#/historial"')
    expect(html).toContain('Historial</a>')
    expect(html).toContain('aria-current="page"')
  })

  it('mantiene activa la sección de gastos en el detalle', () => {
    const html = renderMenuNavegacion({ name: 'gasto', id: 's-1' })
    expect(html).toContain('class="menu-activo" href="#/gasto/nuevo"')
  })

  it('combina la banda fixtures y el menú en una sola pieza', () => {
    const html = renderAppChrome({ name: 'inicio' }, 'fixtures')
    expect(html.indexOf('MODO RESPALDO')).toBeLessThan(html.indexOf('menu-navegacion'))
  })

  it('muestra el reinicio junto a la navegación tanto en live como en fixtures', () => {
    for (const mode of ['live', 'fixtures'] as const) {
      const html = renderAppChrome({ name: 'inicio' }, mode)
      expect(html).toContain('data-accion="reiniciar-demo">Reiniciar</button>')
    }
  })
})
