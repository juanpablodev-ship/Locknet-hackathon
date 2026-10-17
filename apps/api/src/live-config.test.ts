import { describe, expect, it, vi } from 'vitest'
import type { WalletAddress } from '@interledger/open-payments'
import { loadLiveConfig } from './live-config'

describe('configuracion de wallets realmente consumida', () => {
  it('consulta metadatos publicos y no crea miembros activos ni permisos', async () => {
    const get = vi.fn(async (url: string): Promise<WalletAddress> => ({ id: url, assetCode: url.endsWith('c8b493c2') ? 'EUR' : 'COP', assetScale: 2,
      authServer: 'https://auth.example', resourceServer: 'https://resource.example' }))
    const setup = await loadLiveConfig('demo/live-config.example.json', get, 'https://ilp.interledger-test.dev/locknet-pruebas')
    expect(setup.members).toHaveLength(3); expect(setup.members[2].assetCode).toBe('EUR'); expect(get).toHaveBeenCalledTimes(4)
    expect(JSON.stringify(setup)).not.toContain('active'); expect(setup.interval).toMatch(/^R12\//)
    await expect(loadLiveConfig('demo/live-config.example.json', get, 'https://other.example')).rejects.toThrow('firmante')
  })
  it('rechaza farmacia en otra moneda en lugar de asumir COP', async () => {
    const get = vi.fn(async (url: string): Promise<WalletAddress> => ({ id: url, assetCode: 'EUR', assetScale: 2,
      authServer: 'https://auth.example', resourceServer: 'https://resource.example' }))
    await expect(loadLiveConfig('demo/live-config.example.json', get, 'https://ilp.interledger-test.dev/locknet-pruebas')).rejects.toThrow('monedas')
  })
})
