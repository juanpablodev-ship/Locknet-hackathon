import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuthenticatedClient, type AuthenticatedClient, type GrantWithAccessToken, type PendingGrant, type WalletAddress } from '@interledger/open-payments'
import { confirmLimits, finishVerification, readConfig, runVerification, startVerification, verifyInteractionHash } from './verify-outgoing-grant'

vi.mock('@interledger/open-payments', async importOriginal => ({
  ...await importOriginal<typeof import('@interledger/open-payments')>(),
  createAuthenticatedClient: vi.fn(),
}))
afterEach(() => { vi.restoreAllMocks() })

// Datos sintéticos; ningún token o llave real se incluye en estas pruebas.
const env = {
  WALLET_ADDRESS: 'https://wallet.example/client', KEY_ID: 'test-key-id', PRIVATE_KEY_PATH: 'unused.key',
  MEMBER_WALLET_ADDRESS: 'https://wallet.example/member', MEMBER_CAP: '10000',
  MEMBER_INTERVAL: 'R3/2026-10-16T00:00:00Z/P1M',
}
const config = readConfig(env)
const wallet: WalletAddress = { id: env.MEMBER_WALLET_ADDRESS, assetCode: 'COP', assetScale: 2,
  authServer: 'https://auth.example/grant', resourceServer: 'https://resource.example' }
const debit = { value: config.cap, assetCode: wallet.assetCode, assetScale: wallet.assetScale }

function fixture() {
  const pending: PendingGrant = {
    interact: { redirect: 'https://auth.example/consent', finish: randomBytes(16).toString('hex') },
    continue: { uri: 'https://auth.example/continue', access_token: { value: randomBytes(32).toString('hex') } },
  }
  const final: GrantWithAccessToken = {
    continue: pending.continue,
    access_token: { value: randomBytes(32).toString('hex'), manage: 'https://auth.example/manage', access: [{
      type: 'outgoing-payment', identifier: wallet.id, actions: ['read', 'create'],
      limits: { debitAmount: { ...debit }, interval: config.interval },
    }] },
  }
  const client = {
    walletAddress: { get: vi.fn().mockResolvedValue(wallet) },
    grant: { request: vi.fn().mockResolvedValue(pending), continue: vi.fn().mockResolvedValue(final), cancel: vi.fn() },
  } as unknown as AuthenticatedClient
  return { client, pending, final }
}

function callback(session: Awaited<ReturnType<typeof startVerification>>) {
  const ref = randomBytes(16).toString('hex')
  const hash = createHash('sha256').update([session.clientNonce, session.grant.interact.finish, ref, session.grantUri].join('\n')).digest('base64url')
  const url = new URL(`http://localhost:3344/finish`)
  url.search = new URLSearchParams({ state: session.state, interact_ref: ref, hash }).toString()
  return url
}

describe('configuración local', () => {
  it('acepta configuración explícita', () => { expect(readConfig(env).cap).toBe('10000') })
  it.each([
    { KEY_ID: '' }, { MEMBER_CAP: '0' }, { MEMBER_CAP: '1.5' }, { WALLET_ADDRESS: 'http://wallet.example' },
    { MEMBER_WALLET_ADDRESS: 'https://user:password@wallet.example' }, { MEMBERS_VERIFY_PORT: '1' },
    { MEMBER_INTERVAL: 'R/2026-10-16T00:00:00Z/P1M' }, { MEMBER_INTERVAL: 'R1/2026-02-30T00:00:00Z/P1M' },
  ])('rechaza configuración incompleta o inválida: %j', override => {
    expect(() => readConfig({ ...env, ...override })).toThrow()
  })
})

describe('hash de interacción', () => {
  const vector = { clientNonce: 'VJLO6A4CATR0KRO', interactNonce: 'MBDOFXG4Y5CVJCX821LH',
    interactRef: '4IFWWIKYB2PQ6U56NL1', grantUri: 'https://server.example.com/tx',
    hash: 'x-gguKWTj8rQf7d7i3w3UhzvuJ5bpOlKyAlVpLxBffY' }
  it('acepta el vector publicado por GNAP/Open Payments', () => { expect(verifyInteractionHash(vector)).toBe(true) })
  it('rechaza cambios en cada elemento y relleno Base64', () => {
    for (const name of ['clientNonce', 'interactNonce', 'interactRef', 'grantUri', 'hash'] as const) {
      expect(verifyInteractionHash({ ...vector, [name]: vector[name] + 'x' })).toBe(false)
    }
    expect(verifyInteractionHash({ ...vector, hash: vector.hash + '=' })).toBe(false)
    expect(verifyInteractionHash({ ...vector, clientNonce: 'x\ny' })).toBe(false)
  })
})

describe('inicio y límites', () => {
  it('consulta la wallet y pide exactamente tope e intervalo sin destinatario', async () => {
    const { client } = fixture()
    const session = await startVerification(client, config)
    expect(client.walletAddress.get).toHaveBeenCalledWith({ url: config.memberUrl })
    expect(client.grant.request).toHaveBeenCalledWith({ url: wallet.authServer }, {
      access_token: { access: [{ type: 'outgoing-payment', identifier: wallet.id, actions: ['read', 'create'],
        limits: { debitAmount: debit, interval: config.interval } }] },
      interact: { start: ['redirect'], finish: { method: 'redirect', nonce: session.clientNonce,
        uri: `http://localhost:3344/finish?state=${session.state}` } },
    })
    const { final } = fixture()
    expect(confirmLimits(final, wallet, debit, config.interval)).toBe(true)
  })
  it('rechaza una concesión sin interacción', async () => {
    const { client, final } = fixture()
    vi.mocked(client.grant.request).mockResolvedValue(final)
    await expect(startVerification(client, config)).rejects.toThrow()
  })
  it('rechaza wallet inválida y redirección insegura', async () => {
    const { client, pending } = fixture()
    vi.mocked(client.walletAddress.get).mockResolvedValueOnce({ ...wallet, assetScale: -1 })
    await expect(startVerification(client, config)).rejects.toThrow()
    pending.interact.redirect = 'http://auth.example'
    await expect(startVerification(client, config)).rejects.toThrow()
  })
  it('rechaza límites distintos, destinatario y permisos ampliados', () => {
    const { final } = fixture()
    expect(confirmLimits(final, wallet, { ...debit, value: '1' }, config.interval)).toBe(false)
    expect(confirmLimits(final, wallet, debit, 'other')).toBe(false)
    const item = final.access_token.access[0]
    if (item.type !== 'outgoing-payment' || !item.limits) throw new Error('fixture inválido')
    item.limits.receiver = 'https://receiver.example/incoming'
    expect(confirmLimits(final, wallet, debit, config.interval)).toBe(false)
    delete item.limits.receiver
    item.actions.push('list')
    expect(confirmLimits(final, wallet, debit, config.interval)).toBe(false)
  })
})

describe('retorno y continuación', () => {
  it('continúa una sola vez con hash válido y devuelve solo confirmación', async () => {
    const { client } = fixture()
    const session = await startVerification(client, config)
    const url = callback(session)
    const result = await finishVerification(client, session, url)
    expect(result).toContain('Permiso confirmado')
    expect(result).not.toContain(session.grant.continue.access_token.value)
    expect(client.grant.continue).toHaveBeenCalledWith({ url: session.grant.continue.uri,
      accessToken: session.grant.continue.access_token.value }, { interact_ref: url.searchParams.get('interact_ref') })
    await expect(finishVerification(client, session, url)).rejects.toThrow()
    expect(client.grant.continue).toHaveBeenCalledTimes(1)
  })
  it.each(['state', 'hash', 'interact_ref', 'duplicate', 'expired'])('bloquea %s antes de continuar', async field => {
    const { client } = fixture()
    const session = await startVerification(client, config)
    const url = callback(session)
    if (field === 'duplicate') url.searchParams.append('hash', 'invalid')
    else if (field === 'expired') session.requestedAt -= 600_001
    else url.searchParams.set(field, 'invalid')
    await expect(finishVerification(client, session, url)).rejects.toThrow()
    expect(client.grant.continue).not.toHaveBeenCalled()
  })
  it('rechaza concesión todavía pendiente o límites alterados', async () => {
    const { client, pending, final } = fixture()
    vi.mocked(client.grant.continue).mockResolvedValueOnce({ continue: pending.continue })
    const first = await startVerification(client, config)
    await expect(finishVerification(client, first, callback(first))).rejects.toThrow()
    final.access_token.access = []
    const second = await startVerification(client, config)
    await expect(finishVerification(client, second, callback(second))).rejects.toThrow()
  })
})

describe('servidor aislado (SDK simulado, sin Test Wallet)', () => {
  it('sirve redirección y confirma por HTTP sin divulgar tokens', async () => {
    const { client } = fixture()
    vi.mocked(createAuthenticatedClient).mockResolvedValue(client)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const running = runVerification(config)
    await vi.waitFor(() => expect(log).toHaveBeenCalled())
    const start = await fetch('http://localhost:3344/start', { redirect: 'manual' })
    expect(start.status).toBe(303)
    expect(start.headers.get('cache-control')).toBe('no-store')
    const args = vi.mocked(client.grant.request).mock.calls[0][1]
    const finish = args.interact!.finish!
    const pending = await vi.mocked(client.grant.request).mock.results[0].value as PendingGrant
    const url = new URL(finish.uri)
    const ref = randomBytes(16).toString('hex')
    url.searchParams.set('interact_ref', ref)
    url.searchParams.set('hash', createHash('sha256').update([finish.nonce, pending.interact.finish, ref, wallet.authServer].join('\n')).digest('base64url'))
    const response = await fetch(url)
    expect(await response.text()).toContain('Permiso confirmado')
    await running
    expect(createAuthenticatedClient).toHaveBeenCalledWith(expect.objectContaining({ logLevel: 'silent' }))
    expect(JSON.stringify(log.mock.calls)).not.toContain(pending.continue.access_token.value)
  })
  it('rechaza puerto ocupado sin colgar el proceso', async () => {
    const { client } = fixture()
    vi.mocked(createAuthenticatedClient).mockResolvedValue(client)
    const blocker = createServer()
    await new Promise<void>(resolve => blocker.listen(3344, '127.0.0.1', resolve))
    try { await expect(runVerification(config)).rejects.toThrow('puerto local') }
    finally { await new Promise<void>(resolve => blocker.close(() => resolve())) }
  })
})
