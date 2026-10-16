import { describe, expect, it } from 'vitest'
import { parseHash } from './router.js'

describe('parseHash', () => {
  it('reconoce un gasto por id', () => {
    expect(parseHash('#/gasto/abc')).toEqual({ name: 'gasto', id: 'abc' })
  })

  it('da inicio cuando no hay hash', () => {
    expect(parseHash('')).toEqual({ name: 'inicio' })
  })

  it('da no-encontrada para una ruta desconocida', () => {
    expect(parseHash('#/xyz')).toEqual({ name: 'no-encontrada' })
  })
})
