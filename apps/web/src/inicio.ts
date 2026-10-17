import type { Member, SharedWallet, Spend } from '../../../contracts/index.js'
import { NOMBRE_GUARDIAN } from './config.js'
import { hashUnirse } from './router.js'
import { flagFor, formatMoney, riskLevel } from './format.js'

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
      <p class="miembro-nombre"><span class="marca marca-${estado.tono}"></span>${flagFor(m.assetCode)} ${escapeHtml(m.name)}</p>
      <p>Tope: ${escapeHtml(formatMoney(m.cap))} al mes</p>
      <p>Disponible: ${disponible}</p>
      <p class="estado estado-${estado.tono}">${estado.texto}</p>
    </article>
  `
}

// Una casilla del mismo ancho por miembro; cada una se rellena con SU PROPIO porcentaje
// available/cap (en su propia moneda: nunca se suman monedas distintas en una sola barra).
function renderBarraCupo(members: Member[]): string {
  const casillas = members
    .map((m) => {
      if (!m.available) {
        return `<div class="casilla-cupo" role="img" aria-label="${escapeHtml(m.name)}: disponible desconocido"><span class="casilla-cupo-vacia">—</span></div>`
      }
      const disponible = Number(m.available.value)
      const tope = Number(m.cap.value)
      const porcentaje = tope > 0 ? Math.min(100, Math.max(0, (disponible / tope) * 100)) : 0
      return `<div class="casilla-cupo" role="img" aria-label="${escapeHtml(m.name)}: ${porcentaje.toFixed(0)}% disponible"><span style="width: ${porcentaje}%"></span></div>`
    })
    .join('')
  return `<div class="barra-cupo">${casillas}</div>`
}

// El primer gasto que espera el voto del grupo, si hay alguno: la "tarjeta espera" del borrador.
function renderTarjetaEspera(spends: Spend[]): string {
  const pendiente = spends.find((spend) => spend.status === 'awaiting-approval')
  if (!pendiente) return ''
  const nivel = riskLevel(pendiente.risk)
  return `
    <a class="espera" href="#/gasto/${escapeHtml(pendiente.id)}">
      <span>
        <b>${escapeHtml(pendiente.destination.name)}, ${escapeHtml(formatMoney(pendiente.amount))}</b>
        <small>${escapeHtml(nivel.label)}: esperando aprobación del grupo</small>
      </span>
      <em>Revisar</em>
    </a>
  `
}

export function renderReglas(w: SharedWallet, spends: Spend[]): string {
  if (w.kind === 'care') {
    const approval = w.rules.groupApproval
    const aprobaciones = approval.approvalsRequired === 1 ? '1 aprobación' : `${approval.approvalsRequired} aprobaciones`
    const destinos = w.knownDestinations.map((d) => escapeHtml(d.name)).join(', ') || 'ninguno todavía'
    const filas: Array<[string, string]> = [
      ['Nadie aporta más del tope que autorizó', 'Su propio banco'],
      ['El permiso se renueva cada mes', 'Su propio banco'],
      ['Si alguien se sale, su permiso se cancela al instante', 'Su propio banco'],
      ['El destino recibe el monto exacto, aunque alguien pague en otra moneda', 'La cotización de Open Payments'],
      [
        `Un pago riesgoso o mayor a ${escapeHtml(formatMoney(approval.aboveAmount))} necesita ${aprobaciones} del grupo; un solo rechazo detiene un pago riesgoso`,
        'Kivor',
      ],
      [`Destinos de confianza: ${destinos}`, NOMBRE_GUARDIAN],
      ['Nada se da por pagado sin verificar lo que llegó', NOMBRE_GUARDIAN],
    ]
    return `
      <section class="reglas-billetera contrato-grupo">
        <h2>El contrato del grupo</h2>
        <ul class="contrato-filas">
          ${filas
            .map(([regla, quien]) => `<li><span class="contrato-regla">${regla}</span><b class="contrato-quien">${quien}</b></li>`)
            .join('\n          ')}
        </ul>
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
        <h2>Reglas de este grupo</h2>
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
        <h2>Reglas de este grupo</h2>
        <p>Cada venta devuelve el ${rule.percentPerSale}% hasta ${escapeHtml(formatMoney(rule.cap))}</p>
        <p class="nota-configuracion">Configuración en pantalla: este caso aún no ejecuta pagos reales</p>
      </section>
    `
  }

  return ''
}

export function renderSelectorBilleteras(wallets: SharedWallet[], currentId: string): string {
  return `
    <nav class="selector-billeteras" aria-label="Selector de grupos">
      <p>Mismo motor, otro contrato</p>
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
      ${w.capacityStale ? '<p role="status">No se pudo confirmar todo el cupo. Los importes no consultables se excluyen.</p>' : ''}
      ${w.capacityByAsset?.length ? `<p>Cupos por moneda, sin conversión: ${w.capacityByAsset.map(m => escapeHtml(formatMoney(m))).join(' + ')}</p><p>El total siguiente incluye solo ${escapeHtml(w.currency)}. No se convierte EUR con una tasa inventada.</p>` : ''}
      <p class="cupo">${escapeHtml(formatMoney(w.authorizedCapacity))}</p>
      <p>Nadie depositó nada. Cada uno autorizó un tope desde su banco.</p>
      ${renderBarraCupo(w.members)}
      <div class="miembros">${miembros}</div>
      ${renderTarjetaEspera(spends)}
      ${renderReglas(w, spends)}
      <div class="acciones">
        <a class="boton" href="#/gasto/nuevo">Pedir un gasto</a>
        <a class="boton" href="${escapeHtml(hashUnirse(w.id))}">Invitar a alguien</a>
      </div>
    </div>
  `
}
