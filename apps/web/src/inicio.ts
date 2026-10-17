import type { Member, SharedWallet, Spend } from '../../../contracts/index.js'
import { NOMBRE_GUARDIAN, NOMBRE_PRODUCTO } from './config.js'
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
    <li>
      <span class="marca marca-${estado.tono}"></span>
      <b>${flagFor(m.assetCode)} ${escapeHtml(m.name)}</b>
      <b>${disponible}</b>
      <small>Tope: ${escapeHtml(formatMoney(m.cap))} al mes · ${estado.texto}</small>
    </li>
  `
}

// Una casilla del mismo ancho por miembro (decisión 8): el relleno es SU propio
// porcentaje available/cap, nunca una suma entre monedas distintas.
function renderCasillas(members: Member[]): string {
  const casillas = members
    .map((m) => {
      if (!m.available) {
        return `<div class="casilla casilla-vacia" role="img" aria-label="${escapeHtml(m.name)}: disponible desconocido">—</div>`
      }
      const disponible = Number(m.available.value)
      const tope = Number(m.cap.value)
      const porcentaje = tope > 0 ? Math.min(100, Math.max(0, (disponible / tope) * 100)) : 0
      return `<div class="casilla" role="img" aria-label="${escapeHtml(m.name)}: ${porcentaje.toFixed(0)}% disponible"><i style="width: ${porcentaje}%"></i></div>`
    })
    .join('')
  return `<div class="casillas" role="img" aria-label="Cupo disponible de cada miembro">${casillas}</div>`
}

// Cupo real del grupo, agrupado por moneda (capacityByAsset): nunca se suman ni
// convierten monedas distintas entre sí.
function renderMonedas(w: SharedWallet): string {
  if (!w.capacityByAsset?.length) return ''
  const conteoPorMoneda = new Map<string, number>()
  for (const m of w.members) conteoPorMoneda.set(m.assetCode, (conteoPorMoneda.get(m.assetCode) ?? 0) + 1)
  const tarjetas = w.capacityByAsset
    .map((monto) => {
      const n = conteoPorMoneda.get(monto.assetCode) ?? 0
      const plural = n === 1 ? 'miembro' : 'miembros'
      return `<div><p class="cupo">${escapeHtml(formatMoney(monto))}</p><p class="cupo-de">${escapeHtml(monto.assetCode)} · ${n} ${plural}</p></div>`
    })
    .join('')
  return `<div class="monedas">${tarjetas}</div>`
}

// El primer gasto que espera el voto del grupo, si hay alguno: la "tarjeta espera" del diseño.
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

function agruparPorQuien(filas: Array<[string, string]>): Map<string, string[]> {
  const grupos = new Map<string, string[]>()
  for (const [regla, quien] of filas) {
    const lista = grupos.get(quien) ?? []
    lista.push(regla)
    grupos.set(quien, lista)
  }
  return grupos
}

function claseGrupo(quien: string): string {
  if (quien === NOMBRE_PRODUCTO) return ' kivor'
  if (quien === NOMBRE_GUARDIAN) return ' sentinels'
  return ''
}

// El contrato del grupo, agrupado por quién hace cumplir cada regla (decisión 6):
// son frases armadas con wallet.rules reales, nunca texto inventado.
function renderContratoCare(w: SharedWallet): string {
  const approval = w.rules.groupApproval
  const aprobaciones = approval.approvalsRequired === 1 ? '1 aprobación' : `${approval.approvalsRequired} aprobaciones`
  const destinos = w.knownDestinations.map((d) => escapeHtml(d.name)).join(', ') || 'ninguno todavía'
  const filas: Array<[string, string]> = [
    ['Nadie aporta más del tope que autorizó', 'Su propio banco'],
    ['El permiso se renueva cada mes', 'Su propio banco'],
    ['Si alguien se sale, su permiso se cancela al instante', 'Su propio banco'],
    ['El destino recibe el monto exacto, aunque alguien pague en otra moneda', 'Open Payments'],
    [
      `Un pago riesgoso o mayor a ${escapeHtml(formatMoney(approval.aboveAmount))} necesita ${aprobaciones} del grupo; un solo rechazo detiene un pago riesgoso`,
      NOMBRE_PRODUCTO,
    ],
    [`Destinos de confianza: ${destinos}`, NOMBRE_GUARDIAN],
    ['Nada se da por pagado sin verificar lo que llegó', NOMBRE_GUARDIAN],
  ]
  const grupos = agruparPorQuien(filas)
  const bloques = [...grupos.entries()]
    .map(
      ([quien, reglas]) => `
        <div class="grupo-c${claseGrupo(quien)}">
          <h3>${escapeHtml(quien)}</h3>
          <ul>${reglas.map((regla) => `<li>${regla}</li>`).join('')}</ul>
        </div>
      `
    )
    .join('')
  return `
    <h2 class="h-sec">El contrato del grupo</h2>
    <p class="sub">Quién hace cumplir cada regla. El verde marca lo que hace ${escapeHtml(NOMBRE_PRODUCTO)}; el rojo, las advertencias.</p>
    <div id="contrato">${bloques}</div>
  `
}

function renderReglas(w: SharedWallet, spends: Spend[]): string {
  if (w.kind === 'care') return renderContratoCare(w)

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
      <h2 class="h-sec">Reglas de este grupo</h2>
      <p>${descripcionMeta}</p>
      <p>${participantes}</p>
      ${barra}
      ${nadieHaPagado ? '<p>Nadie ha pagado todavía</p>' : ''}
      <p class="nota-configuracion">Configuración en pantalla: este caso aún no ejecuta pagos reales</p>
    `
  }

  if (w.kind === 'investment' && w.rules.return) {
    const rule = w.rules.return
    return `
      <h2 class="h-sec">Reglas de este grupo</h2>
      <p>Cada venta devuelve el ${rule.percentPerSale}% hasta ${escapeHtml(formatMoney(rule.cap))}</p>
      <p class="nota-configuracion">Configuración en pantalla: este caso aún no ejecuta pagos reales</p>
    `
  }

  return ''
}

export function renderSelectorBilleteras(wallets: SharedWallet[], currentId: string): string {
  const chips = wallets
    .map(
      (wallet) =>
        `<button type="button" class="chip${wallet.id === currentId ? ' billetera-seleccionada' : ''}" data-wallet-id="${escapeHtml(wallet.id)}" aria-pressed="${wallet.id === currentId}">${escapeHtml(wallet.name)}</button>`
    )
    .join('')
  return `
    <p class="sub">Mismo motor, otro contrato</p>
    <nav class="grupos" role="group" aria-label="Selector de grupos">${chips}</nav>
  `
}

export function renderInicio(w: SharedWallet, spends: Spend[] = [], wallets: SharedWallet[] = [w]): string {
  const miembros = w.members.map(renderMiembro).join('')
  const monedas = renderMonedas(w)
  return `
    <div class="contenedor">
      <h1>Inicio</h1>
      <p class="sub">Cupo autorizado este mes</p>
      <div class="cuerpo">
        ${renderSelectorBilleteras(wallets, w.id)}
        <div class="custodia">
          <p class="c-num">$0</p>
          <p class="c-txt"><b>en custodia de ${escapeHtml(NOMBRE_PRODUCTO)}.</b> Nadie depositó nada: el dinero sigue en el banco de cada miembro y cada uno solo autorizó un tope.</p>
        </div>
        ${monedas || `<p class="cupo">${escapeHtml(formatMoney(w.authorizedCapacity))}</p>`}
        ${w.capacityByAsset && w.capacityByAsset.length > 1 ? '<p class="regla">Son monedas distintas: no se suman.</p>' : ''}
        ${w.capacityStale ? '<p class="regla" role="status">No se pudo confirmar todo el cupo. Los importes no consultables se excluyen.</p>' : ''}
        <button class="btn peq" type="button" id="consultar-cupo">Actualizar cupos</button>
        ${renderCasillas(w.members)}
        <ul class="miembros">${miembros}</ul>
        <div class="acc">
          <div class="dos">
            <a class="btn lleno" href="#/gasto/nuevo">Pedir un gasto</a>
            <a class="btn" href="#/unirse">Invitar a alguien</a>
          </div>
        </div>
        ${renderTarjetaEspera(spends)}
        ${renderReglas(w, spends)}
      </div>
    </div>
  `
}
