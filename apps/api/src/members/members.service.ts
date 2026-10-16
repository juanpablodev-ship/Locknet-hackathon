import { randomUUID } from 'node:crypto'
import type { AuthenticatedClient, GrantWithAccessToken } from '@interledger/open-payments'
import type { Member, MembersService, Money } from '../../../../contracts/index'
import { guardian } from '../../../../packages/guardian/src/index.js'
import { finishGrantInteraction, startVerification } from './verify-outgoing-grant'

// Firmas compartidas sin copiar ni ampliar MembersService. Las demás operaciones
// del contrato quedan para otra tarea; no se proporcionan implementaciones falsas.
export function createMembersJoinService(client: Pick<AuthenticatedClient, 'walletAddress' | 'grant'>, options: {
  finishUri: string
  policy: { maxCap: Money }
  sessionId: string
  currentSessionId: () => string | undefined
  now?: () => number
}): Pick<MembersService, 'startJoin' | 'finishJoin'> {
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
  const pending = new Map<string, {
    walletId: string
    interaction: Awaited<ReturnType<typeof startVerification>>
    member: Omit<Member, 'id' | 'status'>
    expiresAt: number
  }>()
  // Capacidad mínima server-side para conservar la concesión confirmada. No se
  // serializa ni expone; tokenFor y persistencia durable quedan fuera de esta tarea.
  const active = new Map<string, { walletId: string; member: Member; grant: GrantWithAccessToken }>()
  let starting = false

  return {
    async startJoin(walletId, member) {
      if (currentSessionId() !== sessionId || !walletId || starting) throw new Error('Sesión de unión inválida')
      const input: Omit<Member, 'id' | 'status'> = {
        name: member.name, walletAddress: member.walletAddress, assetCode: member.assetCode,
        cap: structuredClone(member.cap), interval: member.interval,
      }
      const wallet = new URL(input.walletAddress)
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
      if (pending.size) throw new Error('Ya existe una unión pendiente')
      starting = true
      try {
        const interaction = await startVerification(client, {
          memberUrl: input.walletAddress, cap: input.cap.value, interval: input.interval,
          finishUri: callback.toString(), expectedDebit: input.cap,
        })
        if (currentSessionId() !== sessionId) throw new Error('Sesión de unión inválida')
        pending.set(interaction.state, { walletId, interaction, member: input, expiresAt: now() + 600_000 })
        return { redirectUrl: interaction.grant.interact.redirect, grantWarning }
      } catch {
        // Nunca propagar respuestas del SDK o sus errores con cabeceras/tokens.
        throw new Error('No se pudo iniciar la unión')
      } finally { starting = false }
    },

    async finishJoin(p) {
      if (currentSessionId() !== sessionId || !p || typeof p.state !== 'string') throw new Error('Sesión de unión inválida')
      const entry = pending.get(p.state)
      if (!entry) throw new Error('Unión inexistente o ya utilizada')
      // Consumo síncrono ANTES del guardián o de cualquier await: incluso los
      // intentos con hash inválido no pueden repetirse ni correr en paralelo.
      pending.delete(p.state)
      if (entry.expiresAt <= now() || !p.hash || !p.interactRef) throw new Error('Retorno de unión inválido o vencido')
      try {
        const { grant, hashVerdict } = await finishGrantInteraction(client, entry.interaction, p, undefined,
          () => currentSessionId() === sessionId && entry.expiresAt > now())
        if (currentSessionId() !== sessionId || entry.expiresAt <= now()) throw new Error('Sesión de unión inválida')
        const member: Member = { ...entry.member, cap: { ...entry.member.cap }, id: randomUUID(), status: 'active' }
        active.set(member.id, { walletId: entry.walletId, member: structuredClone(member), grant })
        return { member, hashVerdict }
      } catch {
        throw new Error('No se pudo confirmar la unión')
      }
    },
  }
}
