import { afterEach, describe, expect, it } from 'vitest'
import { getWalletActual, setWalletActual } from './wallet-actual.js'

afterEach(() => setWalletActual('w-mama'))

describe('walletActual', () => {
  it('usa w-mama por defecto', () => {
    expect(getWalletActual()).toBe('w-mama')
  })

  it('permite seleccionar otra billetera', () => {
    setWalletActual('w-parque')
    expect(getWalletActual()).toBe('w-parque')
  })

  it('rechaza un id vacío sin perder la selección actual', () => {
    setWalletActual('w-horno')
    expect(() => setWalletActual('')).toThrow('Selecciona un grupo')
    expect(getWalletActual()).toBe('w-horno')
  })
})
