import { OpenPaymentsClientError, type AuthenticatedClient, type GrantWithAccessToken, type WalletAddress } from '@interledger/open-payments'
import type { Member, MembersService, Money } from '../../../../contracts/index'
import type { startVerification } from './verify-outgoing-grant'

type RecordEntry = {
  walletId: string; member: Member; grant?: GrantWithAccessToken; wallet: WalletAddress
  tokenExpiresAt: number; unavailable?: boolean; revoking?: Promise<void>
  specificGrants?: GrantWithAccessToken[]; revocationRemaining?: GrantWithAccessToken[]
}
type State = {
  epoch: number; records: Map<string, RecordEntry>; starting: Set<string>
  confirming: Set<string>
  confirmations: Map<string, { memberId: string; sessionId: string; interaction: Awaited<ReturnType<typeof startVerification>>; expiresAt: number }>
  pending: Map<string, { walletId: string; member: Omit<Member, 'id' | 'status'>;
    interaction: Awaited<ReturnType<typeof startVerification>>; expiresAt: number; sessionId: string }>
}
const states = new WeakMap<object, State>()

/** Handle sin secretos serializables. Compartir UNO entre R2 y las sesiones de R3. */
export function createMembersStore() {
  const store = Object.freeze({ kind: 'members-memory' as const })
  states.set(store, { epoch: 0, records: new Map(), pending: new Map(), starting: new Set(), confirming: new Set(), confirmations: new Map() })
  return store
}
export type MembersStore = ReturnType<typeof createMembersStore>

/** @internal Solo servidor; no devolver este estado mediante HTTP. */
export function membersState(store: MembersStore): State {
  const state = states.get(store)
  if (!state) throw new Error('Almacén de miembros inválido')
  return state
}
export function listMembers(store: MembersStore): Member[] {
  return [...membersState(store).records.values()].map(entry => structuredClone(entry.member))
}
/** Reinicio local explícito. No cancela permisos externos. Invalida operaciones en vuelo. */
export function resetMembersStore(store: MembersStore): void {
  const state = membersState(store)
  state.epoch++
  state.records.clear(); state.pending.clear(); state.starting.clear(); state.confirming.clear(); state.confirmations.clear()
}

/** Alcance explícito: R[n]/UTC/P1D o P1M; mensual con día 1–28, sin ambigüedad de fin de mes. */
export function permissionPeriod(interval: string | undefined, time: number): string {
  const match = /^R([1-9]\d*)?\/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\/P1([MD])$/.exec(interval ?? '')
  if (!match || !Number.isFinite(time)) throw new Error('Intervalo no soportado')
  const start = new Date(match[2])
  if (!Number.isFinite(start.getTime()) || start.toISOString().replace('.000Z', 'Z') !== match[2] ||
      (match[3] === 'M' && start.getUTCDate() > 28)) throw new Error('Intervalo no soportado')
  let index: number
  if (match[3] === 'D') index = Math.floor((time - start.getTime()) / 86_400_000)
  else {
    const current = new Date(time)
    index = (current.getUTCFullYear() - start.getUTCFullYear()) * 12 + current.getUTCMonth() - start.getUTCMonth()
    const boundary = new Date(start); boundary.setUTCMonth(start.getUTCMonth() + index)
    if (time < boundary.getTime()) index--
  }
  if (index < 0 || (match[1] && BigInt(index) >= BigInt(match[1]))) throw new Error('Permiso fuera de su período de vigencia')
  return String(index)
}

export function remainingCapacity(cap: Money, spent: Money | null): Money {
  const amounts = spent ? [cap, spent] : [cap]
  if (amounts.some(m => !/^\d+$/.test(m.value) || !Number.isInteger(m.assetScale) || m.assetScale < 0 || m.assetScale > 255) ||
      (spent && spent.assetCode !== cap.assetCode)) throw new Error('Montos del proveedor incompatibles')
  const scale = Math.max(cap.assetScale, spent?.assetScale ?? cap.assetScale)
  const factor = 10n ** BigInt(scale - cap.assetScale)
  const left = BigInt(cap.value) * factor - (spent ? BigInt(spent.value) * 10n ** BigInt(scale - spent.assetScale) : 0n)
  return { ...cap, value: String(left > 0n ? left / factor : 0n) }
}

export function createMemberOperations(client: Pick<AuthenticatedClient, 'grant' | 'outgoingPayment'>,
  store: MembersStore, now: () => number = Date.now): Pick<MembersService, 'tokenFor' | 'available' | 'revoke'> {
  const state = membersState(store)
  function usable(id: string): RecordEntry {
    const entry = state.records.get(id)
    if (!entry || entry.member.status !== 'active' || !entry.grant || entry.revoking || entry.unavailable) throw new Error('Permiso no utilizable')
    if (now() >= entry.tokenExpiresAt) { entry.member.status = 'expired'; throw new Error('Permiso vencido') }
    permissionPeriod(entry.member.interval, now())
    return entry
  }
  async function available(id: string): Promise<Money> {
    const entry = usable(id)
    const period = permissionPeriod(entry.member.interval, now())
    try {
      // Fuente: https://openpayments.dev/sdk/outgoing-grant-spent-amounts/
      const spent = await client.outgoingPayment.getGrantSpentAmounts({ url: entry.wallet.resourceServer,
        accessToken: entry.grant!.access_token.value })
      if (!spent || !Object.hasOwn(spent, 'spentDebitAmount')) throw new Error('Respuesta incompleta del proveedor')
      if (state.records.get(id) !== entry || usable(id) !== entry || permissionPeriod(entry.member.interval, now()) !== period) {
        throw new Error('El permiso o período cambió durante la consulta')
      }
      const result = remainingCapacity(entry.member.cap, spent.spentDebitAmount)
      entry.member.available = result
      return { ...result }
    } catch (error) {
      if (error instanceof OpenPaymentsClientError && (error.status === 401 || error.status === 403)) entry.unavailable = true
      throw new Error('No se pudo consultar el cupo autorizado')
    }
  }
  return {
    available,
    async tokenFor(id) {
      const entry = usable(id)
      const left = await available(id)
      if (BigInt(left.value) <= 0n || state.records.get(id) !== entry || usable(id) !== entry) throw new Error('Permiso no utilizable o cupo agotado')
      return entry.grant!.access_token.value // Exclusivamente consumidor interno R2; nunca HTTP/eventos/logs.
    },
    async revoke(id) {
      const entry = state.records.get(id)
      if (!entry) throw new Error('Miembro no encontrado')
      if (entry.member.status === 'revoked') return
      if (entry.revoking) return entry.revoking
      if (!entry.grant?.continue.uri || !entry.grant.continue.access_token.value) throw new Error('Gestión de concesión no disponible')
      entry.unavailable = true // No entregar tokens mientras hay incertidumbre de revocación.
      entry.revocationRemaining ??= [...(entry.specificGrants ?? []), entry.grant]
      entry.revoking = Promise.resolve().then(async () => {
        try {
          // Fuente: https://openpayments.dev/sdk/grant-revoke/ (datos de continue, no access_token.manage).
          while (entry.revocationRemaining!.length) {
            const continuation = entry.revocationRemaining![0].continue
            if (new URL(continuation.uri).protocol !== 'https:') throw new Error('URI de gestión inválida')
            await client.grant.cancel({ url: continuation.uri, accessToken: continuation.access_token.value })
            entry.revocationRemaining!.shift()
          }
          entry.member.status = 'revoked'
          entry.member.available = { ...entry.member.cap, value: '0' }
          entry.grant = undefined
          entry.specificGrants = undefined; entry.revocationRemaining = undefined
        } catch { throw new Error('No se pudo confirmar la revocación; permiso local bloqueado') }
        finally { entry.revoking = undefined }
      })
      return entry.revoking
    },
  }
}
