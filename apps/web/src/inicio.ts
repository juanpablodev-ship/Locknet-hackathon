import type { Member, SharedWallet, Spend } from '../../../contracts/index.js'
import { flagFor, formatMoney } from './format.js'

export function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function estadoDe(status: Member['status']): { texto: string; tono: 'verde' | 'ambar' | 'rojo' } {
  if (status === 'active') return { texto: 'Activo', tono: 'verde' }
  if (status === 'pending-approval') return { texto: 'Pendiente', tono: 'ambar' }
  if (status === 'revoked') return { texto: 'Revocado', tono: 'rojo' }
  return { texto: 'Vencido', tono: 'rojo' }
}

function renderMiembro(m: Member): string {
  const estado = estadoDe(m.status)
  const disponible = m.available ? escapeHtml(formatMoney(m.available)) : '—'
  return `
    <article class="miembro">
      <p class="miembro-nombre">${flagFor(m.assetCode)} ${escapeHtml(m.name)}</p>
      <p>Tope: ${escapeHtml(formatMoney(m.cap))} al mes</p>
      <p>Disponible: ${disponible}</p>
      <p class="estado estado-${estado.tono}">${estado.texto}</p>
    </article>
  `
}

function renderReglas(w: SharedWallet, spends: Spend[]): string {
  if (w.kind === 'care') {
    const approval = w.rules.groupApproval
    return `
      <section class="reglas-billetera">
        <h2>Reglas de esta billetera</h2>
        <p>Partes iguales · aprobación del grupo si pasa de ${escapeHtml(formatMoney(approval.aboveAmount))} o el riesgo llega a ${approval.riskThreshold}</p>
      </section>
    `
  }

  if (w.kind === 'goal' && w.rules.goal) {
    const goal = w.rules.goal
    const activos = w.members.filter((member) => member.status === 'active').length
    const avance = goal.members ? Math.min(100, (activos / goal.members) * 100) : 0
    const fecha = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: 'UTC' }).format(
      new Date(goal.deadline)
    )
    const nadieHaPagado = !spends.some((spend) => spend.status === 'paid')
    const descripcionMeta = [
      goal.amount ? `Meta: ${escapeHtml(formatMoney(goal.amount))}` : '',
      goal.members !== undefined ? `con ${goal.members} vecinos` : '',
      `antes del ${fecha}`,
    ]
      .filter(Boolean)
      .join(' ')
    const participantes = goal.members === undefined ? `${activos} miembros activos` : `${activos} de ${goal.members} vecinos`
    const barra = goal.members
      ? `<div class="barra-meta" role="progressbar" aria-valuenow="${activos}" aria-valuemin="0" aria-valuemax="${goal.members}">
           <span style="width: ${avance}%"></span>
         </div>`
      : ''
    return `
      <section class="reglas-billetera">
        <h2>Reglas de esta billetera</h2>
        <p>${descripcionMeta}</p>
        <p>${participantes}</p>
        ${barra}
        ${nadieHaPagado ? '<p>Nadie ha pagado todavía</p>' : ''}
        <p class="nota-configuracion">Configuración en pantalla: este caso aún no ejecuta pagos reales</p>
      </section>
    `
  }

  if (w.kind === 'investment' && w.rules.return) {
    const rule = w.rules.return
    return `
      <section class="reglas-billetera">
        <h2>Reglas de esta billetera</h2>
        <p>Cada venta devuelve el ${rule.percentPerSale}% hasta ${escapeHtml(formatMoney(rule.cap))}</p>
        <p class="nota-configuracion">Configuración en pantalla: este caso aún no ejecuta pagos reales</p>
      </section>
    `
  }

  return ''
}

export function renderSelectorBilleteras(wallets: SharedWallet[], currentId: string): string {
  return `
    <nav class="selector-billeteras" aria-label="Selector de billeteras">
      <p>Misma billetera, otra regla</p>
      <div class="acciones">
        ${wallets
          .map(
            (wallet) =>
              `<button type="button" class="boton${wallet.id === currentId ? ' billetera-seleccionada' : ''}" data-wallet-id="${escapeHtml(wallet.id)}" aria-pressed="${wallet.id === currentId}">${escapeHtml(wallet.name)}</button>`
          )
          .join('')}
      </div>
    </nav>
  `
}

export function renderInicio(w: SharedWallet, spends: Spend[] = [], wallets: SharedWallet[] = [w]): string {
  const miembros = w.members.map(renderMiembro).join('')
  return `
    <div class="contenedor">
      ${renderSelectorBilleteras(wallets, w.id)}
      <p class="etiqueta">Cupo autorizado este mes</p>
      <p class="cupo">${escapeHtml(formatMoney(w.authorizedCapacity))}</p>
      <p>Nadie depositó nada. Cada uno autorizó un tope desde su banco.</p>
      <div class="miembros">${miembros}</div>
      ${renderReglas(w, spends)}
      <div class="acciones">
        <a class="boton" href="#/gasto/nuevo">Pedir un gasto</a>
        <a class="boton" href="#/unirse">Invitar a alguien</a>
      </div>
    </div>
  `
}
