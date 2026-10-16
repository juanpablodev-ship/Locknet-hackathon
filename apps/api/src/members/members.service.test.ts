import { createHash, randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenPaymentsClientError, type AuthenticatedClient, type GrantWithAccessToken, type PendingGrant, type WalletAddress } from '@interledger/open-payments'
import type { Member, MembersService } from '../../../../contracts/index'
import { guardian } from '../../../../packages/guardian/src/index.js'
import { createMembersJoinService } from './members.service'
import { createMemberOperations, createMembersStore, listMembers, membersState, permissionPeriod, remainingCapacity, resetMembersStore } from './member-operations'

// Open Sentinels NO se simula. Solo las llamadas de red del SDK.
afterEach(() => { vi.restoreAllMocks() })

function setup() {
  const wallet: WalletAddress = { id: 'https://wallet.example/member', assetCode: 'COP', assetScale: 2,
    authServer: 'https://auth.example/tenant', resourceServer: 'https://resource.example' }
  const member: Omit<Member, 'id' | 'status'> = { name: 'Miembro de prueba', walletAddress: wallet.id,
    assetCode: 'COP', cap: { value: '10000', assetCode: 'COP', assetScale: 2 },
    interval: 'R3/2026-10-16T00:00:00Z/P1M', available: { value: '1', assetCode: 'COP', assetScale: 2 } }
  const pending: PendingGrant = { interact: { redirect: 'https://auth.example/consent', finish: randomBytes(32).toString('hex') },
    continue: { uri: 'https://auth.example/continue', access_token: { value: randomBytes(32).toString('hex') } } }
  const final: GrantWithAccessToken = { continue: pending.continue,
    access_token: { value: randomBytes(32).toString('hex'), manage: 'https://auth.example/manage', access: [{
      type: 'outgoing-payment', identifier: wallet.id, actions: ['read', 'create'],
      limits: { debitAmount: { ...member.cap }, interval: member.interval },
    }] } }
  const get = vi.fn().mockResolvedValue(wallet)
  const request = vi.fn<AuthenticatedClient['grant']['request']>().mockResolvedValue(pending)
  const continuation = vi.fn<AuthenticatedClient['grant']['continue']>().mockResolvedValue(final)
  const spent = vi.fn().mockResolvedValue({ spentDebitAmount: { ...member.cap, value: '100' }, spentReceiveAmount: null })
  const cancel = vi.fn().mockResolvedValue(undefined)
  const client = { walletAddress: { get }, grant: { request, continue: continuation, cancel },
    outgoingPayment: { getGrantSpentAmounts: spent } } as unknown as AuthenticatedClient
  const session = { current: 'server-session', time: Date.now() }
  const options = { finishUri: 'https://app.example/finish', policy: { maxCap: { ...member.cap } },
    sessionId: session.current, currentSessionId: () => session.current, now: () => session.time, store: createMembersStore() }
  const service = createMembersJoinService(client, options)
  return { service, client, get, request, continuation, member, wallet, pending, final, session, options, spent, cancel }
}

async function begin(f: ReturnType<typeof setup>, encoding: 'base64' | 'base64url' = 'base64') {
  const result = await f.service.startJoin('group-1', f.member)
  const finish = f.request.mock.calls[0][1].interact!.finish!
  const state = new URL(finish.uri).searchParams.get('state')!
  const interactRef = randomBytes(16).toString('hex')
  const hash = createHash('sha256').update([finish.nonce, f.pending.interact.finish, interactRef, f.wallet.authServer].join('\n'), 'ascii').digest(encoding)
  return { result, p: { state, interactRef, hash }, finish }
}

describe('unión con Open Sentinels real', () => {
  it.each(['base64', 'base64url'] as const)('startJoin → finishJoin valida %s y activa solo tras continuar', async encoding => {
    const f = setup()
    const check = vi.spyOn(guardian, 'checkGrantRequest')
    const verify = vi.spyOn(guardian, 'verifyInteractionHash') // call-through real
    const { result, p, finish } = await begin(f, encoding)
    expect(result.grantWarning.status).toBe('pass')
    expect(result.redirectUrl).toBe(f.pending.interact.redirect)
    expect(check).toHaveBeenCalledWith({ debitAmount: f.member.cap, interval: f.member.interval, policy: f.options.policy })
    expect(f.request).toHaveBeenCalledWith({ url: f.wallet.authServer }, expect.objectContaining({
      access_token: { access: [{ type: 'outgoing-payment', identifier: f.wallet.id, actions: ['read', 'create'],
        limits: { debitAmount: f.member.cap, interval: f.member.interval } }] },
    }))
    const joined = await f.service.finishJoin(p)
    expect(joined.hashVerdict.status).toBe('pass')
    expect(joined.member).toMatchObject({ name: f.member.name, status: 'active', cap: f.member.cap })
    expect(joined.member.available).toBeUndefined()
    expect(verify).toHaveBeenCalledWith({ clientNonce: finish.nonce, interactNonce: f.pending.interact.finish,
      interactRef: p.interactRef, grantUri: f.wallet.authServer, hash: p.hash })
    expect(verify.mock.invocationCallOrder[0]).toBeLessThan(f.continuation.mock.invocationCallOrder[0])
    expect(f.continuation).toHaveBeenCalledWith({ accessToken: f.pending.continue.access_token.value,
      url: f.pending.continue.uri }, { interact_ref: p.interactRef })
    const serialized = JSON.stringify([result.grantWarning, joined, f.service])
    for (const sensitive of [finish.nonce, f.pending.interact.finish, p.state, p.interactRef, p.hash,
      f.pending.continue.access_token.value, f.final.access_token.value]) expect(serialized).not.toContain(sensitive)
  })

  it('hash alterado: el guardián real bloquea y no se continúa ni se devuelve un miembro activo', async () => {
    const f = setup()
    const verify = vi.spyOn(guardian, 'verifyInteractionHash')
    const { p } = await begin(f)
    const altered = Buffer.from(p.hash, 'base64'); altered[0] ^= 1
    await expect(f.service.finishJoin({ ...p, hash: altered.toString('base64') })).rejects.toThrow('confirmar')
    expect(verify.mock.results[0].value.status).toBe('block')
    expect(f.continuation).not.toHaveBeenCalled()
    await expect(f.service.finishJoin(p)).rejects.toThrow('ya utilizada')
  })

  it.each(['session', 'state', 'expired', 'missing-ref'] as const)('rechaza %s antes del guardián y de grant.continue', async invalid => {
    const f = setup()
    const verify = vi.spyOn(guardian, 'verifyInteractionHash')
    const { p } = await begin(f)
    if (invalid === 'session') f.session.current = 'another-session'
    if (invalid === 'state') p.state = randomBytes(32).toString('hex')
    if (invalid === 'expired') f.session.time += 600_001
    if (invalid === 'missing-ref') p.interactRef = ''
    await expect(f.service.finishJoin(p)).rejects.toThrow()
    expect(verify).not.toHaveBeenCalled()
    expect(f.continuation).not.toHaveBeenCalled()
  })

  it('rechaza callbacks repetidos y concurrentes con una sola continuación', async () => {
    const f = setup()
    const { p } = await begin(f)
    let complete!: (grant: GrantWithAccessToken) => void
    f.continuation.mockReturnValue(new Promise(resolve => { complete = resolve }))
    const first = f.service.finishJoin(p)
    await expect(f.service.finishJoin(p)).rejects.toThrow('ya utilizada')
    expect(f.continuation).toHaveBeenCalledTimes(1)
    complete(f.final)
    await expect(first).resolves.toMatchObject({ member: { status: 'active' } })
    await expect(f.service.finishJoin(p)).rejects.toThrow('ya utilizada')
    expect(f.continuation).toHaveBeenCalledTimes(1)
  })

  it.each(['pending', 'debit', 'receiver', 'wallet', 'actions', 'interval', 'sdk-error'] as const)(
    'no activa un miembro si la continuación resulta %s', async failure => {
      const f = setup()
      const { p } = await begin(f)
      const item = f.final.access_token.access[0]
      if (item.type !== 'outgoing-payment' || !item.limits || !('debitAmount' in item.limits)) throw new Error('fixture inválido')
      if (failure === 'pending') f.continuation.mockResolvedValue({ continue: f.pending.continue })
      if (failure === 'debit') item.limits.debitAmount.value = '1'
      if (failure === 'receiver') item.limits.receiver = 'https://receiver.example/incoming'
      if (failure === 'wallet') item.identifier = 'https://wallet.example/other'
      if (failure === 'actions') item.actions.push('list')
      if (failure === 'interval') item.limits.interval = 'other'
      if (failure === 'sdk-error') f.continuation.mockRejectedValue(new Error(f.final.access_token.value))
      await expect(f.service.finishJoin(p)).rejects.toThrow('No se pudo confirmar la unión')
      await expect(f.service.finishJoin(p)).rejects.toThrow('ya utilizada')
    })

  it('no activa si la sesión cambia durante la continuación', async () => {
    const f = setup()
    const { p } = await begin(f)
    f.continuation.mockImplementation(async () => { f.session.current = 'logged-out'; return f.final })
    await expect(f.service.finishJoin(p)).rejects.toThrow('confirmar')
  })

  it('no continúa si la sesión cambia durante continue.wait', async () => {
    const f = setup()
    f.pending.continue.wait = 0.05
    const { p } = await begin(f)
    const first = f.service.finishJoin(p)
    f.session.current = 'logged-out'
    await expect(first).rejects.toThrow('confirmar')
    expect(f.continuation).not.toHaveBeenCalled()
  })

  it('mantiene los parámetros ya verificados aunque el llamador los modifique durante la espera', async () => {
    const f = setup()
    f.pending.continue.wait = 0.05
    const { p } = await begin(f)
    const originalRef = p.interactRef
    const first = f.service.finishJoin(p)
    p.interactRef = 'changed-after-validation'
    await expect(first).resolves.toMatchObject({ member: { status: 'active' } })
    expect(f.continuation).toHaveBeenCalledWith(expect.anything(), { interact_ref: originalRef })
  })
})

describe('tokenFor, available y revoke con SDK simulado y almacenamiento compartido', () => {
  it('entrega el token solo en la operación interna y consulta el período actual del proveedor', async () => {
    const f = setup(); const { p } = await begin(f); const joined = await f.service.finishJoin(p)
    const r2 = createMemberOperations(f.client, f.options.store, () => f.session.time)
    expect(await r2.tokenFor(joined.member.id)).toBe(f.final.access_token.value)
    expect(f.spent).toHaveBeenCalledWith({ url: f.wallet.resourceServer, accessToken: f.final.access_token.value })
    const publicData = JSON.stringify([joined, listMembers(f.options.store), f.options.store, r2])
    expect(publicData).not.toContain(f.final.access_token.value)
    expect(publicData).not.toContain(f.final.continue.access_token.value)
    await expect(r2.tokenFor('unknown')).rejects.toThrow('no utilizable')
  })
  it('cupo agotado, moneda incompatible, proveedor malformado y red no entregan token', async () => {
    const f = setup(); const { p } = await begin(f); const { member } = await f.service.finishJoin(p)
    f.spent.mockResolvedValueOnce({ spentDebitAmount: { ...member.cap }, spentReceiveAmount: null })
    await expect(f.service.tokenFor(member.id)).rejects.toThrow('agotado')
    f.spent.mockResolvedValueOnce({ spentDebitAmount: { ...member.cap, assetCode: 'EUR' } })
    await expect(f.service.available(member.id)).rejects.toThrow('consultar')
    f.spent.mockResolvedValueOnce({})
    await expect(f.service.available(member.id)).rejects.toThrow('consultar')
    f.spent.mockRejectedValueOnce(new Error(f.final.access_token.value))
    await expect(f.service.tokenFor(member.id)).rejects.toThrow('No se pudo consultar el cupo autorizado')
  })
  it('una renovación consulta gastos nuevos y no conserva el agotamiento local del período previo', async () => {
    const f = setup(); const { p } = await begin(f); const { member } = await f.service.finishJoin(p)
    f.spent.mockResolvedValueOnce({ spentDebitAmount: { ...member.cap } })
    expect((await f.service.available(member.id)).value).toBe('0')
    f.session.time = Date.parse('2026-11-16T00:00:00Z')
    f.spent.mockResolvedValueOnce({ spentDebitAmount: null })
    expect((await f.service.available(member.id)).value).toBe(member.cap.value)
    expect(f.spent).toHaveBeenCalledTimes(2)
  })
  it('no usa una respuesta que cruzó el límite de período durante la consulta', async () => {
    const f = setup(); const { p } = await begin(f); const { member } = await f.service.finishJoin(p)
    f.spent.mockImplementationOnce(async () => {
      f.session.time = Date.parse('2026-11-16T00:00:00Z'); return { spentDebitAmount: null }
    })
    await expect(f.service.available(member.id)).rejects.toThrow('consultar')
  })
  it('rechaza expiración del token, intervalo terminado y revocación externa detectada', async () => {
    const f = setup(); f.final.access_token.expires_in = 10
    const { p } = await begin(f); const { member } = await f.service.finishJoin(p)
    f.session.time += 10_001
    await expect(f.service.tokenFor(member.id)).rejects.toThrow('vencido')
    expect(listMembers(f.options.store)[0].status).toBe('expired')
    const g = setup(); const next = await begin(g); const joined = await g.service.finishJoin(next.p)
    g.spent.mockRejectedValueOnce(new OpenPaymentsClientError('synthetic', { description: 'synthetic', status: 403 }))
    await expect(g.service.available(joined.member.id)).rejects.toThrow('consultar')
    await expect(g.service.tokenFor(joined.member.id)).rejects.toThrow('no utilizable')
    expect(g.spent).toHaveBeenCalledTimes(1)
    expect(() => permissionPeriod(g.member.interval, Date.parse('2027-01-16T00:00:00Z'))).toThrow('vigencia')
  })
  it('revoca con los datos de continuación finales; las llamadas concurrentes y repetidas no duplican cancel', async () => {
    const f = setup(); f.final.continue = { uri: 'https://auth.example/final-continuation', access_token: { value: randomBytes(32).toString('hex') } }
    const { p } = await begin(f); const { member } = await f.service.finishJoin(p)
    await Promise.all([f.service.revoke(member.id), f.service.revoke(member.id)])
    await f.service.revoke(member.id)
    expect(f.cancel).toHaveBeenCalledTimes(1)
    expect(f.cancel).toHaveBeenCalledWith({ url: f.final.continue.uri, accessToken: f.final.continue.access_token.value })
    await expect(f.service.tokenFor(member.id)).rejects.toThrow('no utilizable')
    expect(listMembers(f.options.store)[0].status).toBe('revoked')
    await expect(f.service.revoke('unknown')).rejects.toThrow('no encontrado')
  })
  it('un error de revocación bloquea tokenFor, no finge éxito externo y permite reintento explícito', async () => {
    const f = setup(); const { p } = await begin(f); const { member } = await f.service.finishJoin(p)
    f.cancel.mockRejectedValueOnce(new Error(f.final.access_token.value))
    await expect(f.service.revoke(member.id)).rejects.toThrow('permiso local bloqueado')
    expect(listMembers(f.options.store)[0].status).toBe('active')
    await expect(f.service.tokenFor(member.id)).rejects.toThrow('no utilizable')
    await f.service.revoke(member.id)
    expect(listMembers(f.options.store)[0].status).toBe('revoked')
  })
  it('el reset solo borra estado local, invalida callbacks y operaciones en vuelo, y no cancela permisos', async () => {
    const f = setup(); const { p } = await begin(f)
    resetMembersStore(f.options.store)
    await expect(f.service.finishJoin(p)).rejects.toThrow('inexistente')
    expect(f.cancel).not.toHaveBeenCalled()
    expect(listMembers(f.options.store)).toEqual([])
    expect(() => membersState({ kind: 'members-memory' })).toThrow('inválido')
  })
})

describe('aritmética de cupo y períodos', () => {
  it('usa BigInt, respeta escalas diferentes y redondea el cupo hacia abajo', () => {
    const cap = { value: '9007199254740993', assetCode: 'COP', assetScale: 2 }
    expect(remainingCapacity(cap, { ...cap, value: '1' }).value).toBe('9007199254740992')
    expect(remainingCapacity({ ...cap, value: '100' }, { ...cap, value: '1', assetScale: 3 }).value).toBe('99')
    expect(remainingCapacity({ ...cap, value: '100' }, { ...cap, value: '1', assetScale: 0 }).value).toBe('0')
    expect(remainingCapacity(cap, null)).toEqual(cap)
    expect(() => remainingCapacity(cap, { ...cap, value: '-1' })).toThrow()
  })
  it('reconoce límites diarios, mensuales y repetición indefinida; rechaza formas no soportadas', () => {
    expect(permissionPeriod('R2/2026-10-16T00:00:00Z/P1D', Date.parse('2026-10-17T00:00:00Z'))).toBe('1')
    expect(permissionPeriod('R/2026-10-16T00:00:00Z/P1M', Date.parse('2027-10-16T00:00:00Z'))).toBe('12')
    expect(() => permissionPeriod('R2/2026-10-16T00:00:00Z/P1D', Date.parse('2026-10-18T00:00:00Z'))).toThrow()
    expect(() => permissionPeriod('R2/2026-10-31T00:00:00Z/P1M', Date.parse('2026-11-01T00:00:00Z'))).toThrow('no soportado')
    expect(() => permissionPeriod(undefined, Date.now())).toThrow()
  })
})

describe('validación y aislamiento de startJoin', () => {
  it('rechaza una sesión inválida y una segunda solicitud sin sobrescribir la original', async () => {
    const f = setup()
    f.session.current = 'another-session'
    await expect(f.service.startJoin('group-1', f.member)).rejects.toThrow('Sesión')
    expect(f.request).not.toHaveBeenCalled()
    f.session.current = f.options.sessionId
    const { p } = await begin(f)
    await expect(f.service.startJoin('group-2', f.member)).rejects.toThrow('pendiente')
    await expect(f.service.finishJoin(p)).resolves.toMatchObject({ member: { status: 'active' } })
    expect(f.request).toHaveBeenCalledTimes(1)
  })

  it('rechaza moneda distinta antes de pedir el permiso', async () => {
    const f = setup()
    await expect(f.service.startJoin('group-1', { ...f.member, cap: { ...f.member.cap, assetScale: 3 } })).rejects.toThrow('iniciar')
    expect(f.request).not.toHaveBeenCalled()
  })

  it('bloquea startJoin concurrentes sin generar dos concesiones', async () => {
    const f = setup()
    let ready!: (wallet: WalletAddress) => void
    f.get.mockReturnValue(new Promise(resolve => { ready = resolve }))
    const first = f.service.startJoin('group-1', f.member)
    await expect(f.service.startJoin('group-1', f.member)).rejects.toThrow('Sesión')
    ready(f.wallet)
    await expect(first).resolves.toHaveProperty('redirectUrl')
    expect(f.request).toHaveBeenCalledTimes(1)
  })

  it('aísla por copia los datos originales y sanea errores del SDK', async () => {
    const f = setup()
    Object.assign(f.member, { id: 'supplied-id', status: 'active', extra: randomBytes(32).toString('hex') })
    const { p } = await begin(f)
    f.member.cap.value = '99999'
    f.member.name = 'changed'
    const joined = await f.service.finishJoin(p)
    expect(joined.member.cap.value).toBe('10000')
    expect(joined.member.name).toBe('Miembro de prueba')
    expect(joined.member.id).not.toBe('supplied-id')
    expect(joined.member).not.toHaveProperty('extra')
    const other = setup()
    other.get.mockRejectedValue(new Error(other.pending.continue.access_token.value))
    await expect(other.service.startJoin('group-1', other.member)).rejects.toThrow('No se pudo iniciar la unión')
  })

  it('rechaza configuración y entradas inválidas sin llamadas de red', async () => {
    const f = setup()
    expect(() => createMembersJoinService(f.client, { ...f.options, finishUri: 'http://app.example/finish' })).toThrow()
    expect(() => createMembersJoinService(f.client, { ...f.options, policy: { maxCap: { ...f.member.cap, value: '0' } } })).toThrow()
    await expect(f.service.startJoin('', f.member)).rejects.toThrow()
    await expect(f.service.startJoin('group-1', { ...f.member, interval: undefined })).rejects.toThrow()
    expect(f.request).not.toHaveBeenCalled()
  })
})
