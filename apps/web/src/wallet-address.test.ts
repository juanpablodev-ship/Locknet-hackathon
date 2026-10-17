import { describe, expect, it } from 'vitest'
import { walletAddressUrl } from './wallet-address.js'

describe('dirección compatible con el SDK', () => {
  it('convierte el payment pointer sin cambiar el destino', () => {
    expect(walletAddressUrl(' $ilp.interledger-test.dev/far ')).toBe('https://ilp.interledger-test.dev/far')
    expect(walletAddressUrl('https://ilp.interledger-test.dev/far')).toBe('https://ilp.interledger-test.dev/far')
  })
  it.each(['http://example.com/far', 'far', '$', 'https://user:password@example.com/far', 'https://example.com/far?token=x', 'https://example.com/far#x'])('rechaza %s', value => {
    expect(() => walletAddressUrl(value)).toThrow()
  })
})
