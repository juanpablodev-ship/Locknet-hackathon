import { randomUUID } from 'node:crypto'
import type { AuthenticatedClient } from '@interledger/open-payments'
import type { Member, MembersService, Money } from '../../../../contracts/index'
import { guardian } from '../../../../packages/guardian/src/index.js'
import { finishGrantInteraction, startVerification } from './verify-outgoing-grant'
import { createMemberOperations, createMembersStore, membersState, permissionPeriod, type MembersStore } from './member-operations'

// Implementación del contrato compartido. Las concesiones solo viven en el servidor.
export function createMembersJoinService(client: Pick<AuthenticatedClient, 'walletAddress' | 'grant' | 'outgoingPayment'>, options: {
  finishUri: string
  policy: { maxCap: Money }
  sessionId: string
  currentSessionId: () => string | undefined
  now?: () => number
  store?: MembersStore
}): MembersService {
  const callback = new URL(options.finishUri)
  if ((callback.protocol !== 'https:' && !(callback.protocol === 'http:' && callback.hostname === 'localhost')) ||
      callback.username || callback.password || callback.search || callback.hash || !options.sessionId) {
    throw new Error('Configuración de unión inválida')
  }
  // Copias privadas: el llamador no puede cambiar la sesión o política original.
  const sessionId = options.sessionId
  const currentSessionId = options.currentSessionId
  const maxCap = structuredClone(options.policy.maxCap)
  if (!/^[1-9]\d*$/.test(maxCap.value) || !Number.isInteger(maxCap.assetScale) || maxCap.assetScale < 0 || !maxCap.assetCode) {
    throw new Error('Política de cupo inválida')
  }
  const now = options.now ?? Date.now
  const store = options.store ?? createMembersStore()
  const state = membersState(store)
  const { pending } = state

  return {
    ...createMemberOperations(client, store, now),
    async startJoin(walletId, member) {
      if (currentSessionId() !== sessionId || !walletId || state.starting.has(sessionId)) throw new Error('Sesión de unión inválida')
      const input: Omit<Member, 'id' | 'status'> = {
        name: member.name, walletAddress: member.walletAddress, assetCode: member.assetCode,
        cap: structuredClone(member.cap), interval: member.interval,
      }
      permissionPeriod(input.interval, now())
      let wallet: URL
      try { wallet = new URL(input.walletAddress) } catch { throw new Error('Datos de unión inválidos') }
      if (wallet.protocol !== 'https:' || wallet.username || wallet.password || wallet.search || wallet.hash ||
          !input.name?.trim() || !/^[1-9]\d*$/.test(input.cap.value) ||
          !Number.isInteger(input.cap.assetScale) || input.cap.assetScale < 0 ||
          input.assetCode !== input.cap.assetCode || !input.interval || !/^R\d*\/[^/]+\/P/.test(input.interval)) {
        throw new Error('Datos de unión inválidos')
      }
      // Un permiso aún no demuestra capacidad disponible; se recalculará en available().
      const grantWarning = guardian.checkGrantRequest({ debitAmount: input.cap, interval: input.interval, policy: { maxCap } })
      if (grantWarning.status === 'block') throw new Error('Solicitud bloqueada por el guardián')
      // Una sola interacción pendiente por sesión; no se sobrescribe por otro /start.
      for (const [state, entry] of pending) if (entry.expiresAt <= now()) pending.delete(state)
      if ([...pending.values()].some(entry => entry.sessionId === sessionId)) throw new Error('Ya existe una unión pendiente')
      state.starting.add(sessionId)
      const epoch = state.epoch
      try {
        const interaction = await startVerification(client, {
          memberUrl: input.walletAddress, cap: input.cap.value, interval: input.interval,
          finishUri: callback.toString(), expectedDebit: input.cap,
        })
        if (currentSessionId() !== sessionId || state.epoch !== epoch) throw new Error('Sesión de unión inválida')
        pending.set(interaction.state, { walletId, interaction, member: input, expiresAt: now() + 600_000, sessionId })
        return { redirectUrl: interaction.grant.interact.redirect, grantWarning }
      } catch {
        // Nunca propagar respuestas del SDK o sus errores con cabeceras/tokens.
        throw new Error('No se pudo iniciar la unión')
      } finally { if (state.epoch === epoch) state.starting.delete(sessionId) }
    },

    async finishJoin(p) {
      if (currentSessionId() !== sessionId || !p || typeof p.state !== 'string') throw new Error('Sesión de unión inválida')
      const entry = pending.get(p.state)
      if (!entry || entry.sessionId !== sessionId) throw new Error('Unión inexistente o ya utilizada')
      // Consumo síncrono ANTES del guardián o de cualquier await: incluso los
      // intentos con hash inválido no pueden repetirse ni correr en paralelo.
      pending.delete(p.state)
      const epoch = state.epoch
      if (entry.expiresAt <= now() || !p.hash || !p.interactRef) throw new Error('Retorno de unión inválido o vencido')
      try {
        const { grant, hashVerdict } = await finishGrantInteraction(client, entry.interaction, p, undefined,
          () => currentSessionId() === sessionId && entry.expiresAt > now() && state.epoch === epoch)
        if (currentSessionId() !== sessionId || entry.expiresAt <= now() || state.epoch !== epoch) throw new Error('Sesión de unión inválida')
        const member: Member = { ...entry.member, cap: { ...entry.member.cap }, id: randomUUID(), status: 'active' }
        const ttl = grant.access_token.expires_in
        if (ttl !== undefined && (!Number.isFinite(ttl) || ttl <= 0)) throw new Error('Permiso vencido')
        state.records.set(member.id, { walletId: entry.walletId, member: structuredClone(member), grant,
          wallet: entry.interaction.wallet, tokenExpiresAt: ttl === undefined ? Infinity : now() + ttl * 1000 })
        return { member, hashVerdict }
      } catch {
        throw new Error('No se pudo confirmar la unión')
      }
    },

    async startWalletConfirm(memberId, request) {
      const entry = state.records.get(memberId)
      if (currentSessionId() !== sessionId || !entry || entry.member.status !== 'active' || !entry.grant ||
          entry.unavailable || entry.revoking || now() >= entry.tokenExpiresAt) throw new Error('Miembro o sesión no utilizable')
      permissionPeriod(entry.member.interval, now())
      const input = structuredClone(request)
      let receiver: URL
      try { receiver = new URL(input.incomingPaymentUrl) } catch { throw new Error('Permiso específico inválido') }
      // Fuente: esquema oficial incluido en SDK 7.4.0, auth-server.yaml,
      // components.schemas.receiver y limits-outgoing; base grant-outgoing-payment.ts.
      if (receiver.protocol !== 'https:' || receiver.username || receiver.password || receiver.search || receiver.hash ||
          !/\/incoming-payments\/[^/]+$/.test(receiver.pathname) || !/^[1-9]\d*$/.test(input.debit.value) ||
          input.debit.assetCode !== entry.member.cap.assetCode || input.debit.assetScale !== entry.member.cap.assetScale) {
        throw new Error('Permiso específico inválido')
      }
      for (const [key, value] of state.confirmations) if (value.expiresAt <= now()) state.confirmations.delete(key)
      if (state.confirming.has(memberId) || [...state.confirmations.values()].some(value => value.memberId === memberId)) {
        throw new Error('Ya existe una confirmación pendiente')
      }
      const epoch = state.epoch
      state.confirming.add(memberId)
      try {
        const interaction = await startVerification(client, { memberUrl: entry.member.walletAddress, cap: input.debit.value,
          expectedDebit: input.debit, receiver: input.incomingPaymentUrl, finishUri: callback.toString() })
        if (state.epoch !== epoch || currentSessionId() !== sessionId || entry.unavailable || state.records.get(memberId) !== entry) throw new Error('Sesión inválida')
        state.confirmations.set(interaction.state, { memberId, sessionId, interaction, expiresAt: now() + 600_000 })
        return { redirectUrl: interaction.grant.interact.redirect }
      } catch { throw new Error('No se pudo iniciar la confirmación específica') }
      finally { if (state.epoch === epoch) state.confirming.delete(memberId) }
    },

    async finishWalletConfirm(p) {
      const pending = state.confirmations.get(p.state)
      if (currentSessionId() !== sessionId || !pending || pending.sessionId !== sessionId) throw new Error('Confirmación inexistente o sesión inválida')
      state.confirmations.delete(p.state)
      const epoch = state.epoch
      const entry = state.records.get(pending.memberId)
      const valid = () => {
        try { permissionPeriod(entry?.member.interval, now()) } catch { return false }
        return state.epoch === epoch && currentSessionId() === sessionId && pending.expiresAt > now() &&
        !!entry && state.records.get(pending.memberId) === entry && entry.member.status === 'active' &&
        !entry.unavailable && !entry.revoking && now() < entry.tokenExpiresAt
      }
      if (!valid()) throw new Error('Confirmación vencida o permiso no utilizable')
      try {
        const { grant, hashVerdict } = await finishGrantInteraction(client, pending.interaction, p, undefined, valid)
        if (!valid() || (grant.access_token.expires_in !== undefined && (!Number.isFinite(grant.access_token.expires_in) || grant.access_token.expires_in <= 0))) throw new Error('Permiso no utilizable')
        if (grant.access_token.value === entry!.grant!.access_token.value) throw new Error('Se esperaba una concesión independiente')
        entry!.specificGrants ??= []; entry!.specificGrants.push(grant)
        // Contrato: token solo para el consumidor servidor R2. R3 DEBE omitirlo en HTTP/SSE.
        return { memberId: pending.memberId, approved: true, token: grant.access_token.value, hashVerdict }
      } catch { throw new Error('No se pudo confirmar el permiso específico') }
    },
  }
}
