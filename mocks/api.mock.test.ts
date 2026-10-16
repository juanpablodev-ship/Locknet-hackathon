import { describe, expect, it } from 'vitest'
import { getWallet, getWallets } from './api.mock.js'

describe('getWallets', () => {
  it('devuelve las tres billeteras con sus kinds', () => {
    const wallets = getWallets()
    expect(wallets).toHaveLength(3)
    expect(wallets.map((w) => w.kind).sort()).toEqual(['care', 'goal', 'investment'])
  })

  it('tiene ids únicos', () => {
    const ids = getWallets().map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('getWallet', () => {
  it('w-mama tiene authorizedCapacity.value "30000000"', () => {
    expect(getWallet('w-mama').authorizedCapacity.value).toBe('30000000')
  })

  it('lanza error si la billetera no existe', () => {
    expect(() => getWallet('nada')).toThrow('Billetera no encontrada')
  })

  it('mutar el resultado no afecta una segunda llamada', () => {
    const primera = getWallet('w-mama')
    primera.name = 'cambiado'
    primera.members.pop()

    const segunda = getWallet('w-mama')
    expect(segunda.name).toBe('Cuidado de mamá')
    expect(segunda.members).toHaveLength(3)
  })
})
