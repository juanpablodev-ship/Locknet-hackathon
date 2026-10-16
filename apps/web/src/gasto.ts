import type { SharedWallet, Spend, Verdict } from '../../../contracts/index.js'
import { formatMoney, progressText, riskLevel, statusLabel } from './format.js'
import { escapeHtml } from './inicio.js'
import { NOMBRE_GUARDIAN } from './config.js'

type Share = Spend['shares'][number]

function peorVerdict(verdicts: Verdict[]): Verdict | undefined {
  return verdicts.reduce<Verdict | undefined>((peor, v) => (!peor || v.riskPoints > peor.riskPoints ? v : peor), undefined)
}

function renderVoto(a: Spend['approvals'][number], wallet: SharedWallet): string {
  const miembro = wallet.members.find((m) => m.id === a.memberId)
  const nombre = escapeHtml(miembro ? miembro.name : a.memberId)
  return `<p>${nombre} ${a.yes ? 'aprobó' : 'rechazó'}</p>`
}

function botonesVoto(spendId: string, destacarRechazar: boolean, yaVoto: boolean): string {
  if (yaVoto) {
    return `
      <button type="button" class="boton boton-rechazar" disabled>Ya votaste</button>
      <button type="button" class="boton boton-aprobar" disabled>Ya votaste</button>
    `
  }
  const claseRechazar = destacarRechazar ? 'boton boton-rechazar boton-rechazar-destacado' : 'boton boton-rechazar'
  return `
    <button type="button" class="${claseRechazar}" data-accion="rechazar" data-spend="${escapeHtml(spendId)}">Rechazar</button>
    <button type="button" class="boton boton-aprobar" data-accion="aprobar" data-spend="${escapeHtml(spendId)}">Aprobar</button>
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
  const destacarRechazar = spend.risk >= wallet.rules.groupApproval.riskThreshold

  return `
    <p class="puntaje puntaje-${nivel.tone}">${spend.risk}</p>
    <p class="puntaje-etiqueta puntaje-${nivel.tone}">${nivel.label}</p>
    ${peor ? `<p class="advertencia">⚠ ${escapeHtml(peor.userMessage)}</p>` : ''}
    ${peor ? `<p class="motivos">${peor.reasons.map(escapeHtml).join(' · ')}</p>` : ''}
    <p class="destino">${escapeHtml(spend.destination.name)} · <code>${escapeHtml(spend.destination.walletAddress)}</code></p>
    <p class="monto">${formatMoney(spend.amount)}</p>
    <p>Esto necesita aprobación del grupo: ${requeridos} de ${activos.length}</p>
    <p class="conteo-votos">A favor: ${aFavor} de ${requeridos} · En contra: ${enContra} de ${votosParaRechazar}</p>
    <div class="votos">${spend.approvals.map((a) => renderVoto(a, wallet)).join('')}</div>
    <div class="acciones">${botonesVoto(spend.id, destacarRechazar, yaVoto)}</div>
    <div id="mensaje" role="status"></div>
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
    <div class="aporte">
      <p class="aporte-nombre">${nombre}</p>
      <p>Aporta: ${share.debit ? formatMoney(share.debit) : '—'}</p>
      <p>Llegó: ${share.received ? formatMoney(share.received) : '—'}</p>
      <p class="estado estado-${estado.tono}">${estado.texto}</p>
    </div>
  `
}

function cuerpoProgreso(spend: Spend, wallet: SharedWallet): string {
  const aportes = spend.shares.map((s) => renderAporte(s, wallet)).join('')
  return `
    <p class="progreso">${escapeHtml(progressText(spend.progress, nombresFaltantes(spend, wallet)))}</p>
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
