import { describe, expect, it } from 'vitest'
import { parseHash } from './router.js'

describe('parseHash', () => {
  it('da inicio cuando no hay hash', () => {
    expect(parseHash('')).toEqual({ name: 'inicio' })
  })

  it('reconoce #/inicio', () => {
    expect(parseHash('#/inicio')).toEqual({ name: 'inicio' })
  })

  it('reconoce #/unirse', () => {
    expect(parseHash('#/unirse')).toEqual({ name: 'unirse' })
  })

  it('reconoce #/crear-grupo', () => {
    expect(parseHash('#/crear-grupo')).toEqual({ name: 'crear-grupo' })
  })

  it('#/crear-grupo/otra-cosa no es la pantalla de crear grupo', () => {
    expect(parseHash('#/crear-grupo/otra-cosa')).toEqual({ name: 'no-encontrada' })
  })

  it('reconoce #/unirse/volver', () => {
    expect(parseHash('#/unirse/volver')).toEqual({ name: 'unirse-volver' })
  })

  it('lee el resultado y miembro de la vuelta del banco', () => {
    expect(parseHash('#/unirse/volver?ok=1&miembro=m-nuevo-1')).toEqual({
      name: 'unirse-volver',
      ok: true,
      memberId: 'm-nuevo-1',
    })
  })

  it('reconoce #/gasto/nuevo como gasto-nuevo, no como un gasto con id "nuevo"', () => {
    expect(parseHash('#/gasto/nuevo')).toEqual({ name: 'gasto-nuevo' })
  })

  it('reconoce un gasto por id', () => {
    expect(parseHash('#/gasto/abc')).toEqual({ name: 'gasto', id: 'abc' })
  })

  it('reconoce #/historial', () => {
    expect(parseHash('#/historial')).toEqual({ name: 'historial' })
  })

  it('reconoce #/por-aprobar, distinta de #/gasto/:id y #/gasto/nuevo', () => {
    expect(parseHash('#/por-aprobar')).toEqual({ name: 'por-aprobar' })
    expect(parseHash('#/gasto/nuevo')).toEqual({ name: 'gasto-nuevo' })
    expect(parseHash('#/gasto/abc')).toEqual({ name: 'gasto', id: 'abc' })
  })

  it('da no-encontrada para una ruta desconocida', () => {
    expect(parseHash('#/xyz')).toEqual({ name: 'no-encontrada' })
  })
})
