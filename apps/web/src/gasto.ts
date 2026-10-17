import type { Member, SharedWallet, Spend, Verdict } from '../../../contracts/index.js'
import { formatMoney, progressText, riskLevel, statusLabel } from './format.js'
import { escapeHtml } from './inicio.js'
import { NOMBRE_GUARDIAN } from './config.js'
import { cuentaMasParecida, resaltarDiferencias } from './cuenta.js'

type Share = Spend['shares'][number]
type Approval = Spend['approvals'][number]

function peorVerdict(verdicts: Verdict[]): Verdict | undefined {
  return verdicts.reduce<Verdict | undefined>((peor, v) => (!peor || v.riskPoints > peor.riskPoints ? v : peor), undefined)
}

function renderVoto(member: Member, approval?: Approval): string {
  const resultado = approval ? (approval.yes ? 'Aprobó' : 'Rechazó') : 'Pendiente'
  const tono = approval ? (approval.yes ? 'verde' : 'rojo') : 'ambar'
  return `
    <article class="voto voto-${tono}">
      <b>${escapeHtml(member.name)}</b>
      <span>${resultado}</span>
    </article>
  `
}

function botonesVoto(
  spendId: string,
  destacarRechazar: boolean,
  yaVoto: boolean,
  requiereConfirmacion: boolean,
): string {
  if (yaVoto) {
    return `
      <button type="button" class="boton boton-rechazar" disabled>Ya votaste</button>
      <button type="button" class="boton boton-aprobar" disabled>Ya votaste</button>
    `
  }
  const claseRechazar = destacarRechazar ? 'boton boton-rechazar boton-rechazar-destacado' : 'boton boton-rechazar'
  return `
    <button type="button" class="${claseRechazar}" data-accion="rechazar" data-spend="${escapeHtml(spendId)}">Rechazar</button>
    <button type="button" class="boton boton-aprobar" data-accion="${requiereConfirmacion ? 'abrir-confirmacion' : 'aprobar'}" data-spend="${escapeHtml(spendId)}">${requiereConfirmacion ? 'Revisar riesgo y aprobar' : 'Aprobar'}</button>
  `
}

function comparacionCuentas(spend: Spend, wallet: SharedWallet): string {
  const conocida = cuentaMasParecida(wallet.knownDestinations, spend.destination.walletAddress)
  if (!conocida) {
    return `
      <p class="cuenta-nueva">Es una cuenta nueva para este grupo</p>
      <div class="cuenta-dato">
        <b>Cuenta que vas a pagar</b>
        <code>${escapeHtml(spend.destination.walletAddress)}</code>
      </div>
    `
  }

  const diferencias = resaltarDiferencias(conocida.walletAddress, spend.destination.walletAddress)
  return `
    <div class="comparacion-cuentas">
      <div class="cuenta-dato">
        <b>Cuenta conocida · ${escapeHtml(conocida.name)}</b>
        <code>${diferencias.conocidaHtml}</code>
      </div>
      <div class="cuenta-dato">
        <b>Cuenta que vas a pagar</b>
        <code>${diferencias.nuevaHtml}</code>
      </div>
    </div>
  `
}

function dialogoConfirmacion(spend: Spend, wallet: SharedWallet): string {
  return `
    <dialog id="confirmacion-riesgo" class="confirma" role="alertdialog" aria-labelledby="titulo-confirmacion-riesgo">
      <form method="dialog" class="confirma-contenido">
        <h2 id="titulo-confirmacion-riesgo">Revisa el destino antes de aprobar</h2>
        ${comparacionCuentas(spend, wallet)}
        <ul class="avisos-riesgo">
          <li>La cuenta de destino puede ser diferente de una cuenta que el grupo ya conoce.</li>
          <li>La aprobación autoriza este gasto; no confirma que el pago haya llegado.</li>
          <li>Confirma con ${escapeHtml(spend.destination.name)} que esta es su cuenta antes de seguir.</li>
        </ul>
        <label class="aceptar-riesgo">
          <input id="aceptar-riesgo" type="checkbox" required />
          Confirmo que revisé la cuenta y quiero votar a favor de este gasto.
        </label>
        <div class="acciones confirma-acciones">
          <button type="submit" formnovalidate class="boton boton-secundario">Volver</button>
          <button id="aprobar-riesgo" type="button" class="boton boton-peligro" data-accion="aprobar" data-spend="${escapeHtml(spend.id)}" disabled>
            Aprobar ${escapeHtml(formatMoney(spend.amount))} de todos modos
          </button>
        </div>
      </form>
    </dialog>
  `
}

function cuerpoEsperandoAprobacion(spend: Spend, wallet: SharedWallet, votaComo?: string): string {
  const peor = peorVerdict(spend.verdicts)
  const nivel = riskLevel(spend.risk)
  const activos = wallet.members.filter((m) => m.status === 'active')
  const requeridos = wallet.rules.groupApproval.approvalsRequired
  const votosParaRechazar = activos.length - requeridos + 1

  const aFavor = spend.approvals.filter((a) => a.yes).length
  const enContra = spend.approvals.filter((a) => !a.yes).length
  const yaVoto = votaComo ? spend.approvals.some((a) => a.memberId === votaComo) : false
  const requiereConfirmacion = spend.risk >= wallet.rules.groupApproval.riskThreshold

  return `
    <div class="aprobacion-gasto">
      <section class="pedido-gasto">
        <h1>Solicitud de gasto</h1>
        <p class="destino">${escapeHtml(spend.destination.name)}</p>
        <code class="direccion-destino">${escapeHtml(spend.destination.walletAddress)}</code>
        <p class="monto">${escapeHtml(formatMoney(spend.amount))}</p>
        <p>Necesita aprobación del grupo: ${requeridos} de ${activos.length}</p>
      </section>
      <section class="veredicto" aria-label="Veredicto de riesgo">
        <p class="puntaje puntaje-${nivel.tone}">${spend.risk}</p>
        <p class="puntaje-etiqueta puntaje-${nivel.tone}">${nivel.label}</p>
        ${peor ? `<p class="advertencia">⚠ ${escapeHtml(peor.userMessage)}</p>` : ''}
        ${peor ? `<p class="motivos">${peor.reasons.map(escapeHtml).join(' · ')}</p>` : ''}
      </section>
      <section class="votos" aria-label="Votos del grupo">
        <p class="conteo-votos">A favor: ${aFavor} de ${requeridos} · En contra: ${enContra} de ${votosParaRechazar}</p>
        <div class="cuadricula-votos">${activos
          .map((member) => renderVoto(member, spend.approvals.find((a) => a.memberId === member.id)))
          .join('')}</div>
      </section>
      <div class="acciones acciones-aprobacion">
        ${botonesVoto(spend.id, requiereConfirmacion, yaVoto, requiereConfirmacion)}
        ${requiereConfirmacion && !yaVoto ? dialogoConfirmacion(spend, wallet) : ''}
        <div id="mensaje" role="status"></div>
      </div>
    </div>
  `
}

function nombresFaltantes(spend: Spend, wallet: SharedWallet): string[] {
  return spend.shares
    .filter((s) => s.status !== 'paid')
    .map((s) => wallet.members.find((m) => m.id === s.memberId)?.name ?? s.memberId)
}

function estadoAporte(status: Share['status']): { texto: string; tono: 'verde' | 'ambar' | 'rojo' } {
  if (status === 'paid') return { texto: 'Confirmado', tono: 'verde' }
  if (status === 'failed') return { texto: 'Falló', tono: 'rojo' }
  return { texto: 'Pendiente', tono: 'ambar' }
}

function renderAporte(share: Share, wallet: SharedWallet): string {
  const nombre = escapeHtml(wallet.members.find((m) => m.id === share.memberId)?.name ?? share.memberId)
  const estado = estadoAporte(share.status)
  return `
    <div class="aporte aporte-${estado.tono}">
      <p class="aporte-nombre">${nombre}</p>
      <p>Aporta: ${share.debit ? escapeHtml(formatMoney(share.debit)) : '—'}</p>
      <p>Llegó: ${share.received ? escapeHtml(formatMoney(share.received)) : '—'}</p>
      <p class="estado estado-${estado.tono}">${estado.texto}</p>
    </div>
  `
}

function cuerpoProgreso(spend: Spend, wallet: SharedWallet): string {
  const aportes = spend.shares.map((s) => renderAporte(s, wallet)).join('')
  const total = Math.max(0, spend.progress.total)
  const confirmados = Math.max(0, Math.min(spend.progress.confirmed, total))
  const porcentaje = total === 0 ? 0 : Math.round((confirmados / total) * 100)
  const tono = spend.status === 'paid' ? 'verde' : 'ambar'
  return `
    <p class="progreso">${escapeHtml(progressText(spend.progress, nombresFaltantes(spend, wallet)))}</p>
    <div class="barra-progreso" role="progressbar" aria-label="Aportes confirmados" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${confirmados}">
      <span class="barra-progreso-relleno barra-progreso-${tono}" style="width: ${porcentaje}%"></span>
    </div>
    <div class="aportes">${aportes}</div>
  `
}

function cuerpoBloqueado(spend: Spend): string {
  const bloqueante = spend.verdicts.find((v) => v.status === 'block') ?? peorVerdict(spend.verdicts)
  return `
    <div class="panel panel-rojo">
      <p class="panel-titulo">Gasto bloqueado</p>
      ${bloqueante ? `<p>${escapeHtml(bloqueante.userMessage)}</p>` : ''}
      ${bloqueante ? `<p class="motivos">${bloqueante.reasons.map(escapeHtml).join(' · ')}</p>` : ''}
    </div>
  `
}

function cuerpoIncompleto(spend: Spend, wallet: SharedWallet): string {
  const fallido = spend.shares.find((s) => s.status === 'failed')
  const nombreFallido = fallido
    ? escapeHtml(wallet.members.find((m) => m.id === fallido.memberId)?.name ?? fallido.memberId)
    : ''

  return `
    <div class="panel panel-ambar">
      <p class="panel-titulo">Pago incompleto</p>
      ${fallido ? `<p>${nombreFallido}: ${escapeHtml(fallido.failReason ?? 'no se pudo confirmar el aporte')}</p>` : ''}
    </div>
    ${cuerpoProgreso(spend, wallet)}
    ${
      fallido
        ? `<div class="acciones">
             <button type="button" class="boton" data-accion="reintentar" data-spend="${escapeHtml(spend.id)}">Reintentar el aporte de ${nombreFallido}</button>
           </div>`
        : ''
    }
    <div id="mensaje" role="status"></div>
  `
}

function cuerpoPorEstado(spend: Spend, wallet: SharedWallet, votaComo?: string): string {
  switch (spend.status) {
    case 'requested':
      return `<p class="revisando">Revisando el gasto con ${NOMBRE_GUARDIAN}…</p>`
    case 'awaiting-approval':
      return cuerpoEsperandoAprobacion(spend, wallet, votaComo)
    case 'approved':
      return `
        <div class="panel panel-verde">
          <p class="panel-titulo">El grupo aprobó el gasto.</p>
        </div>
        <div class="acciones">
          <button type="button" class="boton" data-accion="pagar" data-spend="${escapeHtml(spend.id)}">Pagar ahora</button>
        </div>
        <div id="mensaje" role="status"></div>
      `
    case 'rejected':
      return `
        <div class="panel panel-rojo">
          <p class="panel-titulo">Rechazado por el grupo</p>
          <p>El gasto no salió. Nadie pagó nada.</p>
        </div>
      `
    case 'blocked':
      return cuerpoBloqueado(spend)
    case 'paying':
      return `
        ${cuerpoProgreso(spend, wallet)}
        <div id="mensaje" role="status"></div>
      `
    case 'incomplete':
      return cuerpoIncompleto(spend, wallet)
    case 'paid':
      return `
        <p class="sello sello-verificado">Gasto verificado: llegó completo a ${escapeHtml(spend.destination.name)}</p>
        ${cuerpoProgreso(spend, wallet)}
      `
    default:
      return `<h1>${statusLabel(spend.status)}</h1>`
  }
}

export function renderGasto(spend: Spend, wallet: SharedWallet, votaComo?: string): string {
  return `
    <div class="contenedor">
      <p class="sello">Protegido por ${NOMBRE_GUARDIAN}</p>
      ${cuerpoPorEstado(spend, wallet, votaComo)}
    </div>
  `
}
