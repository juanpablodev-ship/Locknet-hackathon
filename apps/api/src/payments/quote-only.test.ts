import { describe, expect, it, vi } from 'vitest'
import { receiveAmountFromMajor, quoteCost, quoteOnlyConfig, runQuoteOnly } from './quote-only'

const payerUrl = 'https://wallet.example/cuenta-eur'
const receiverUrl = 'https://wallet.example/farmacia-usd'
const config = { memberId: 'cuenta-eur', payerWalletAddress: payerUrl, receiverWalletAddress: receiverUrl, receiveAmountMajor: '10.00' }

function setup(receiverScale = 2, payerAssetCode = 'EUR', receiverAssetCode = 'USD', payerScale = 2, debitAmountValue = '950', receiveAmountValue = '1000') {
  const get = vi.fn(async ({ url }: { url: string }) => ({ id: url, assetCode: url === receiverUrl ? receiverAssetCode : payerAssetCode,
    assetScale: url === receiverUrl ? receiverScale : payerScale,
    authServer: 'https://auth.example', resourceServer: 'https://resource.example' }))
  const request = vi.fn(async () => ({ access_token: { value: 'SENTINEL_TOKEN', access: [] } }))
  const createIncoming = vi.fn(async () => ({ id: 'https://resource.example/incoming/1' }))
  const createQuote = vi.fn(async (_options: unknown, _payload: unknown) => ({ id: 'https://resource.example/quotes/1',
    receiveAmount: { value: receiveAmountValue, assetCode: receiverAssetCode, assetScale: receiverScale },
    debitAmount: { value: debitAmountValue, assetCode: payerAssetCode, assetScale: payerScale } }))
  const outgoingCreate = vi.fn()
  const client = { walletAddress: { get }, grant: { request }, incomingPayment: { create: createIncoming },
    quote: { create: createQuote }, outgoingPayment: { create: outgoingCreate } }
  const lines: string[] = []
  return { client: client as unknown as Parameters<typeof runQuoteOnly>[0], get, request, createIncoming, createQuote, outgoingCreate, lines }
}

describe('--quote-only', () => {
  it('exige configuración explícita del pagador y farmacia', () => {
    expect(() => quoteOnlyConfig({})).toThrow('QUOTE_ONLY_MEMBER_ID')
    expect(quoteOnlyConfig({ QUOTE_ONLY_MEMBER_ID: 'cuenta-eur', QUOTE_ONLY_PAYER_WALLET_ADDRESS: payerUrl,
      QUOTE_ONLY_RECEIVER_WALLET_ADDRESS: receiverUrl, QUOTE_ONLY_RECEIVE_AMOUNT_MAJOR: '10.00' })).toEqual(config)
    expect(() => quoteOnlyConfig({ QUOTE_ONLY_MEMBER_ID: 'otro', QUOTE_ONLY_PAYER_WALLET_ADDRESS: payerUrl,
      QUOTE_ONLY_RECEIVER_WALLET_ADDRESS: receiverUrl, QUOTE_ONLY_RECEIVE_AMOUNT_MAJOR: '10.00' })).toThrow('QUOTE_ONLY_PAYER_WALLET_ADDRESS')
    expect(() => quoteOnlyConfig({ QUOTE_ONLY_MEMBER_ID: 'cuenta-eur', QUOTE_ONLY_PAYER_WALLET_ADDRESS: payerUrl,
      QUOTE_ONLY_RECEIVER_WALLET_ADDRESS: payerUrl, QUOTE_ONLY_RECEIVE_AMOUNT_MAJOR: '10.00' })).toThrow('deben ser distintas')
    expect(() => quoteOnlyConfig({ QUOTE_ONLY_MEMBER_ID: 'cuenta-eur', QUOTE_ONLY_PAYER_WALLET_ADDRESS: payerUrl,
      QUOTE_ONLY_RECEIVER_WALLET_ADDRESS: receiverUrl, QUOTE_ONLY_RECEIVE_AMOUNT_MAJOR: '0' })).toThrow('QUOTE_ONLY_RECEIVE_AMOUNT_MAJOR')
  })

  it('cotiza EUR a USD con un incoming y sin crear pagos ni mostrar secretos', async () => {
    const f = setup()
    await runQuoteOnly(f.client, config, line => f.lines.push(line))
    expect(f.get).toHaveBeenCalledTimes(2)
    expect(f.request).toHaveBeenCalledTimes(2)
    expect(f.createIncoming).toHaveBeenCalledTimes(1)
    expect(f.createQuote).toHaveBeenCalledTimes(1)
    expect(f.createQuote.mock.calls[0]?.[1]).toEqual({ method: 'ilp', walletAddress: payerUrl,
      receiver: 'https://resource.example/incoming/1', receiveAmount: { value: '1000', assetCode: 'USD', assetScale: 2 } })
    expect(f.outgoingCreate).not.toHaveBeenCalled()
    expect(f.lines.join('\n')).toContain('Pagador: EUR, escala 2')
    expect(f.lines.join('\n')).toContain('Farmacia: USD, escala 2')
    expect(f.lines.join('\n')).toContain('Conversión: EUR → USD')
    expect(f.lines.join('\n')).toContain('Comparación directa y límite del 5 %: no aplican')
    expect(f.lines.join('\n')).not.toMatch(/SENTINEL|https:|accessToken|privateKey/)
  })

  it('rechaza un monto con más decimales que la escala antes de crear recursos', async () => {
    const f = setup(0)
    await expect(runQuoteOnly(f.client, config, line => f.lines.push(line))).rejects.toThrow('validación de monedas y escala')
    expect(f.request).not.toHaveBeenCalled()
    expect(f.createIncoming).not.toHaveBeenCalled()
    expect(f.createQuote).not.toHaveBeenCalled()
    expect(f.outgoingCreate).not.toHaveBeenCalled()
  })

  it('cotiza COP a COP con escalas distintas y no crea pagos salientes', async () => {
    const copConfig = { ...config, receiveAmountMajor: '40000' }
    const f = setup(2, 'COP', 'COP', 0, '42000', '4000000')
    await runQuoteOnly(f.client, copConfig, line => f.lines.push(line))
    expect(f.createIncoming).toHaveBeenCalledTimes(1)
    expect(f.createQuote).toHaveBeenCalledTimes(1)
    expect(f.createQuote.mock.calls[0]?.[1]).toMatchObject({ receiveAmount: { value: '4000000', assetCode: 'COP', assetScale: 2 } })
    expect(f.outgoingCreate).not.toHaveBeenCalled()
    expect(f.lines.join('\n')).toContain('Conversión: COP → COP (misma moneda)')
    expect(f.lines.join('\n')).toContain('Diferencia: 2000.00 COP')
    expect(f.lines.join('\n')).toContain('Costo: 5.00%')
    expect(f.lines.join('\n')).toContain('Supera 5 %: no')
  })

  it('acepta una receptora ZAR con la misma configuración de monto', async () => {
    const f = setup(2, 'EUR', 'ZAR')
    await runQuoteOnly(f.client, config, line => f.lines.push(line))
    expect(f.createIncoming).toHaveBeenCalledTimes(1)
    expect(f.createQuote.mock.calls[0]?.[1]).toMatchObject({ receiveAmount: { value: '1000', assetCode: 'ZAR', assetScale: 2 } })
    expect(f.outgoingCreate).not.toHaveBeenCalled()
  })

  it('rechaza un debitAmount en una moneda distinta de la pagadora', async () => {
    const f = setup()
    f.createQuote.mockResolvedValueOnce({ id: 'https://resource.example/quotes/1',
      receiveAmount: receiveAmountFromMajor('10.00', 'USD', 2), debitAmount: { value: '4200000', assetCode: 'COP', assetScale: 2 } })
    await expect(runQuoteOnly(f.client, config, line => f.lines.push(line))).rejects.toThrow('validación de quote')
    expect(f.lines.join('\n')).not.toContain('Quote: creada')
    expect(f.outgoingCreate).not.toHaveBeenCalled()
  })

  it('sanea errores del SDK', async () => {
    const f = setup()
    f.createQuote.mockRejectedValueOnce(new Error('SENTINEL_TOKEN https://secret.example'))
    await expect(runQuoteOnly(f.client, config, line => f.lines.push(line))).rejects.not.toThrow(/SENTINEL|secret/)
    expect(f.lines.join('\n')).not.toContain('SENTINEL')
  })
})

describe('montos de la cotización', () => {
  it('convierte montos de la moneda receptora a unidades mínimas sin redondear', () => {
    expect(receiveAmountFromMajor('40000', 'COP', 2)).toEqual({ value: '4000000', assetCode: 'COP', assetScale: 2 })
    expect(receiveAmountFromMajor('10.00', 'USD', 2)).toEqual({ value: '1000', assetCode: 'USD', assetScale: 2 })
    expect(receiveAmountFromMajor('5', 'JPY', 0)).toEqual({ value: '5', assetCode: 'JPY', assetScale: 0 })
    expect(() => receiveAmountFromMajor('10.01', 'USD', 0)).toThrow()
    expect(() => receiveAmountFromMajor('0', 'USD', 2)).toThrow()
  })

  it('calcula porcentaje con la misma escala y con escalas diferentes', () => {
    expect(quoteCost({ value: '4000000', assetCode: 'COP', assetScale: 2 },
      { value: '4200000', assetCode: 'COP', assetScale: 2 })).toMatchObject({ difference: '2000.00 COP', percent: '5.00', exceedsFivePercent: false })
    expect(quoteCost({ value: '4000000', assetCode: 'COP', assetScale: 2 },
      { value: '43000', assetCode: 'COP', assetScale: 0 })).toMatchObject({ difference: '3000.00 COP', percent: '7.50', exceedsFivePercent: true })
    expect(quoteCost({ value: '4000000', assetCode: 'COP', assetScale: 2 },
      { value: '100', assetCode: 'EUR', assetScale: 2 })).toBeNull()
  })
})
