import { readFile } from 'node:fs/promises'
import type { WalletAddress } from '@interledger/open-payments'

/** Solo metadatos públicos mediante walletAddress.get del SDK oficial. */
export async function loadLiveConfig(path: string, getWallet: (url: string) => Promise<WalletAddress>, signer: string) {
  const input = JSON.parse(await readFile(path, 'utf8'))
  const url = (s: unknown): string => {
    if (typeof s !== 'string') throw new Error('Configuracion de wallet invalida')
    const u = new URL(s)
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw new Error('Configuracion de wallet invalida')
    return s
  }
  if (!Array.isArray(input.members) || input.members.length !== 3 || url(input.application) !== signer) throw new Error('La wallet firmante no coincide con la configuracion publica; revisa tu configuracion local sin compartir llaves.')
  const members = await Promise.all(input.members.map(async (m: { name: string; walletAddress: string }) => {
    const w = await getWallet(url(m.walletAddress))
    return { name: String(m.name).slice(0, 80), walletAddress: w.id, assetCode: w.assetCode, assetScale: w.assetScale }
  }))
  const pharmacy = await getWallet(url(input.pharmacy))
  if (pharmacy.assetCode !== 'COP' || members.filter(m => m.assetCode === 'COP').length !== 2 || members.filter(m => m.assetCode === 'EUR').length !== 1) throw new Error('Las monedas publicas no corresponden al caso COP/COP/EUR hacia COP.')
  if ([pharmacy, ...members].some(w => !Number.isInteger(w.assetScale) || w.assetScale < 0 || w.assetScale > 20)) throw new Error('Escala de wallet no soportada')
  const now = new Date(); now.setUTCDate(Math.min(now.getUTCDate(), 28)); now.setUTCHours(0, 0, 0, 0)
  return { members, pharmacy: { name: 'Farmacia', walletAddress: pharmacy.id, assetCode: pharmacy.assetCode, assetScale: pharmacy.assetScale },
    interval: `R12/${now.toISOString().replace('.000Z', 'Z')}/P1M` }
}
