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

  it('normaliza un destino antiguo con $ sin mutar el grupo ni crear pagos', async () => {
    const destination = { name: 'Farmacia', walletAddress: '$ilp.interledger-test.dev/far' }
    await api.requestSpend('w-existing', destination, medicina.amount)
    expectRequest('/api/wallets/w-existing/spends', 'POST', { destination: { ...destination, walletAddress: 'https://ilp.interledger-test.dev/far' }, amount: medicina.amount })
    expect(destination.walletAddress).toBe('$ilp.interledger-test.dev/far')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('crear grupo envía el destino HTTPS aunque la entrada use $', async () => {
    await api.createWallet({ name: 'Medicinas', currency: 'COP', approvalsRequired: 2,
      aboveAmount: { value: '20000000', assetCode: 'COP', assetScale: 2 },
      knownDestinations: [{ name: 'Farmacia', walletAddress: '$ilp.interledger-test.dev/far' }] })
    const call = fetchMock.mock.calls[0]
    expect(JSON.parse(call[1]!.body as string).knownDestinations[0].walletAddress).toBe('https://ilp.interledger-test.dev/far')
    expect(call[0]).toBe('/api/wallets')
  })

  it('rechaza destinos inseguros antes de transmitir una solicitud', async () => {
    await expect(api.requestSpend('w-existing', { name: 'X', walletAddress: 'http://example.com/far' }, medicina.amount)).rejects.toThrow('HTTPS')
    expect(fetchMock).not.toHaveBeenCalled()
  })

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
    const nuevo = {
      name: 'Medicinas de mamá', currency: 'COP', approvalsRequired: 2,
      aboveAmount: medicina.amount, knownDestinations: [{ name: 'Farmacia', walletAddress: 'https://a.dev/farmacia' }],
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(201, cuidadoDeMama))
    expect(await api.createWallet(nuevo)).toEqual(cuidadoDeMama)
    expectRequest('/api/wallets', 'POST', nuevo)

    await api.requestSpend('w-mama', destination, medicina.amount)
    expectRequest('/api/wallets/w-mama/spends', 'POST', { destination, amount: medicina.amount })

    fetchMock.mockResolvedValueOnce(jsonResponse(200, medicina))
    fetchMock.mockResolvedValueOnce(jsonResponse(200, []))
    await api.executeSpend('s-medicina')
    expectRequest('/api/spends/s-medicina/execute', 'POST')

    await api.retryShare('s-medicina')
    expectRequest('/api/spends/s-medicina/retry', 'POST')

    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      mode: 'fixtures',
      label: 'Modo respaldo — datos simulados',
      recordedAt: '2026-10-16T21:13:45.876Z',
    }))
    await expect(api.getApiMode()).resolves.toEqual({
      mode: 'fixtures',
      label: 'Modo respaldo — datos simulados',
      recordedAt: '2026-10-16T21:13:45.876Z',
    })
    expectRequest('/api/mode', 'GET')

    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      mode: 'fixtures',
      label: 'Modo respaldo — datos simulados',
      wallets: ['w-mama'],
    }))
    await expect(api.resetDemo()).resolves.toEqual({
      mode: 'fixtures',
      label: 'Modo respaldo — datos simulados',
      wallets: ['w-mama'],
    })
    expectRequest('/api/demo/reset', 'POST')
  })

  it('devuelve el estado final de una consulta sin ejecutar ni reintentar pagos', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, medicina))
    await expect(api.recheckSpend(medicina.id)).resolves.toEqual(medicina)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expectRequest(`/api/spends/${medicina.id}/recheck`, 'POST')
  })

  it('tolera la API anterior con 202 consultando su resultado mediante GET', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(202, { spendId: medicina.id, status: 'paying' }))
    fetchMock.mockResolvedValueOnce(jsonResponse(200, medicina))
    await expect(api.recheckSpend(medicina.id)).resolves.toEqual(medicina)
    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [`/api/spends/${medicina.id}/recheck`, 'POST'],
      [`/api/spends/${medicina.id}`, 'GET'],
    ])
  })

  it('muestra el error de consulta sin reenviar un pago', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: 'Consulta no disponible' }))
    await expect(api.recheckSpend(medicina.id)).rejects.toThrow('Consulta no disponible')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('no envía POST de pago si otro gasto tiene un intento desconocido', async () => {
    const previous = structuredClone(medicina)
    previous.id = 'gasto-anterior'; previous.status = 'incomplete'
    previous.shares[0].status = 'pending'
    previous.shares[0].attempts = [{ incomingPaymentUrl: 'https://test.invalid/incoming-payments/old', status: 'unknown' }]
    fetchMock.mockResolvedValueOnce(jsonResponse(200, medicina))
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [previous]))
    await expect(api.executeSpend(medicina.id)).rejects.toThrow('Otro gasto')
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true)
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

  it('el comando live prevalece sobre una configuracion mock anterior', async () => {
    vi.stubEnv('VITE_API_MODE', 'mock')
    vi.stubEnv('MODE', 'live')
    vi.resetModules()
    api = await import('./api.js')
    expect(api.MODO).toBe('live')
  })

  it('rechaza con el mensaje exacto que devuelve la API', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: 'Ya votó: m1' }))

    await expect(api.castApproval('s-medicina', 'm1', true)).rejects.toThrow('Ya votó: m1')
  })

  it('explica que no se puede reiniciar mientras hay un pago en curso', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: 'No se puede reiniciar con un pago en curso' }))

    await expect(api.resetDemo()).rejects.toThrow('No se puede reiniciar con un pago en curso')
    expectRequest('/api/demo/reset', 'POST')
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

    await api.startJoin('w-mama', member)
    expectRequest('/api/wallets/w-mama/join', 'POST', member)
    expect(fetchMock.mock.calls.at(-1)?.[1]?.credentials).toBe('same-origin')
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

  it('createWallet muestra el mensaje del servidor cuando responde 400', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: 'La moneda debe ser COP, EUR o USD.' }))
    await expect(api.createWallet({
      name: 'X', currency: 'MXN', approvalsRequired: 2, aboveAmount: medicina.amount, knownDestinations: [],
    })).rejects.toThrow('La moneda debe ser COP, EUR o USD.')
  })
})
