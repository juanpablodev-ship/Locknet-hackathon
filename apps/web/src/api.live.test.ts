import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cuidadoDeMama, medicina } from '../../../contracts/ejemplo.js'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

class FakeEventSource {
  static current: FakeEventSource | undefined
  onmessage: ((event: MessageEvent) => void) | null = null
  close = vi.fn()

  constructor(readonly url: string) {
    FakeEventSource.current = this
  }

  send(data: string): void {
    this.onmessage?.({ data } as MessageEvent)
  }
}

describe('api.ts en modo live', () => {
  let api: typeof import('./api.js')
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

  beforeEach(async () => {
    vi.resetModules()
    fetchMock.mockClear()
    vi.stubEnv('VITE_API_MODE', 'live')
    vi.stubEnv('VITE_API_URL', '')
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockImplementation(async () => jsonResponse(200, {}))
    api = await import('./api.js')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  function expectRequest(path: string, method: string, body?: unknown): void {
    const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
    expect(call?.[0]).toBe(path)
    expect(call?.[1]?.method).toBe(method)
    if (body !== undefined) {
      expect(call?.[1]?.headers).toEqual({ 'Content-Type': 'application/json' })
      expect(JSON.parse(call?.[1]?.body as string)).toEqual(body)
    }
  }

  it('llama las rutas existentes con los métodos y cuerpos correspondientes', async () => {
    await api.getWallets()
    expectRequest('/api/wallets', 'GET')

    await api.getWallet('w-mama')
    expectRequest('/api/wallets/w-mama', 'GET')

    await api.getSpends('w-mama')
    expectRequest('/api/wallets/w-mama/spends', 'GET')

    await api.getSpend('s-medicina')
    expectRequest('/api/spends/s-medicina', 'GET')

    await api.castApproval('s-medicina', 'm-bogota', true)
    expectRequest('/api/spends/s-medicina/approvals', 'POST', { memberId: 'm-bogota', yes: true })

    const destination = medicina.destination
    await api.requestSpend('w-mama', destination, medicina.amount)
    expectRequest('/api/wallets/w-mama/spends', 'POST', { destination, amount: medicina.amount })

    await api.executeSpend('s-medicina')
    expectRequest('/api/spends/s-medicina/execute', 'POST')

    await api.retryShare('s-medicina')
    expectRequest('/api/spends/s-medicina/retry', 'POST')
  })

  it('conserva la base VITE_API_URL configurada', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test')
    vi.resetModules()
    api = await import('./api.js')

    await api.getWallets()

    expectRequest('https://api.example.test/api/wallets', 'GET')
  })

  it('permite activar live mediante el modo de Vite', async () => {
    vi.stubEnv('VITE_API_MODE', '')
    vi.stubEnv('MODE', 'live')
    vi.resetModules()
    api = await import('./api.js')

    expect(api.MODO).toBe('live')
  })

  it('rechaza con el mensaje exacto que devuelve la API', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: 'Ya votó: m1' }))

    await expect(api.castApproval('s-medicina', 'm1', true)).rejects.toThrow('Ya votó: m1')
  })

  it('traduce un fallo de red al mensaje acordado', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(api.getWallets()).rejects.toThrow('No se pudo conectar con el servidor')
  })

  it('deja el flujo de unirse pendiente en modo live', async () => {
    const member = {
      name: 'Persona nueva',
      walletAddress: 'https://ilp.interledger-test.dev/persona-nueva',
      assetCode: 'COP',
      cap: { value: '5000000', assetCode: 'COP', assetScale: 2 },
    }

    await expect(api.startJoin('w-mama', member)).rejects.toThrow('Unirse todavía no está conectado a la API')
    await expect(api.finishJoin({ ok: false, memberId: '' })).rejects.toThrow(
      'Unirse todavía no está conectado a la API'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('procesa mensajes SSE válidos, ignora JSON inválido y cierra la conexión', () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const recibidos: unknown[] = []
    const dejarDeEscuchar = api.onEvents('w-mama', (evento) => recibidos.push(evento))
    const source = FakeEventSource.current

    expect(source?.url).toBe('/api/wallets/w-mama/events')
    source?.send(JSON.stringify({ walletId: 'w-mama', type: 'spend-paid', message: 'ok', ts: 1 }))
    source?.send('{json inválido')

    expect(recibidos).toHaveLength(1)
    dejarDeEscuchar()
    expect(source?.close).toHaveBeenCalledOnce()
  })

  it('no oculta errores lanzados por el callback SSE', () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const dejarDeEscuchar = api.onEvents('w-mama', () => {
      throw new Error('falló el suscriptor')
    })

    expect(() => FakeEventSource.current?.send('{}')).toThrow('falló el suscriptor')
    dejarDeEscuchar()
  })

  it('usa datos del contrato como respuesta de las consultas', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [cuidadoDeMama]))
    await expect(api.getWallets()).resolves.toEqual([cuidadoDeMama])
  })
})
