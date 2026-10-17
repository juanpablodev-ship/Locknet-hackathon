import { describe, expect, it } from 'vitest'
import { guardarTema, leerTemaGuardado, siguienteTema, type AlmacenTema } from './tema.js'

describe('siguienteTema', () => {
  it('alterna de claro a oscuro', () => {
    expect(siguienteTema('light')).toBe('dark')
  })

  it('alterna de oscuro a claro', () => {
    expect(siguienteTema('dark')).toBe('light')
  })
})

describe('leerTemaGuardado', () => {
  it('devuelve el tema guardado si es válido', () => {
    const almacen: AlmacenTema = { getItem: () => 'dark', setItem: () => {} }
    expect(leerTemaGuardado(almacen)).toBe('dark')
  })

  it('devuelve null si el valor guardado no es "light" ni "dark"', () => {
    const almacen: AlmacenTema = { getItem: () => 'sepia', setItem: () => {} }
    expect(leerTemaGuardado(almacen)).toBeNull()
  })

  it('devuelve null si el almacén lanza al leer', () => {
    const almacen: AlmacenTema = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {},
    }
    expect(leerTemaGuardado(almacen)).toBeNull()
  })

  it('devuelve null sin almacén disponible', () => {
    expect(leerTemaGuardado(undefined)).toBeNull()
  })
})

describe('guardarTema', () => {
  it('escribe el tema en el almacén', () => {
    let guardado: string | undefined
    const almacen: AlmacenTema = { getItem: () => null, setItem: (_clave, valor) => { guardado = valor } }
    guardarTema('dark', almacen)
    expect(guardado).toBe('dark')
  })

  it('no lanza si el almacén falla al escribir', () => {
    const almacen: AlmacenTema = {
      getItem: () => null,
      setItem: () => {
        throw new Error('bloqueado')
      },
    }
    expect(() => guardarTema('light', almacen)).not.toThrow()
  })

  it('no lanza sin almacén disponible', () => {
    expect(() => guardarTema('light', undefined)).not.toThrow()
  })
})
