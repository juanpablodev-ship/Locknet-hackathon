import type { SharedWallet, Spend } from '../../../contracts/index.js'
import { formatMoney, statusLabel } from './format.js'
import { escapeHtml } from './inicio.js'

function tonoEstado(status: Spend['status']): 'verde' | 'ambar' | 'rojo' {
  if (status === 'paid') return 'verde'
  if (status === 'rejected' || status === 'blocked') return 'rojo'
  return 'ambar'
}

function renderFila(spend: Spend): string {
  const tone = tonoEstado(spend.status)
  const sello = spend.status === 'paid' ? '<span class="sello sello-verificado">Gasto verificado</span>' : ''
  return `
    <article class="fila-gasto fila-gasto-${tone}">
      <div class="fila-gasto-detalle">
        <p class="fila-gasto-destino">${escapeHtml(spend.destination.name)}</p>
        <p class="estado estado-${tone}">${escapeHtml(statusLabel(spend.status))}</p>
        ${sello}
      </div>
      <p class="fila-gasto-monto">${escapeHtml(formatMoney(spend.amount))}</p>
      <a class="btn peq" href="#/gasto/${escapeHtml(spend.id)}">Ver gasto</a>
    </article>
  `
}

export function renderHistorial(spends: Spend[], wallet: SharedWallet): string {
  const cantidad = spends.length === 1 ? '1 gasto' : `${spends.length} gastos`
  const encabezado = `
    <header class="historial-cabecera">
      <div>
        <p class="historial-ceja">Actividad del grupo</p>
        <h1>Historial</h1>
        <p class="historial-billetera">${escapeHtml(wallet.name)}</p>
      </div>
      <span class="contador-historial">${cantidad}</span>
    </header>
  `

  if (spends.length === 0) {
    return `
      <div class="contenedor historial">
        ${encabezado}
        <section class="estado-vacio-historial">
          <span class="marca-vacio" aria-hidden="true">0</span>
          <p class="sin-historial">Todavía no hay gastos en este grupo</p>
          <p>Cuando alguien pida un gasto, aparecerá aquí con su estado.</p>
          <a class="btn lleno" href="#/gasto/nuevo">Pedir un gasto</a>
        </section>
      </div>
    `
  }

  // Spend no tiene fecha; conservar el orden de la API hasta que R3 agregue ese campo.
  return `
    <div class="contenedor historial">
      ${encabezado}
      <div class="lista-historial" aria-label="Gastos del grupo">${spends.map(renderFila).join('')}</div>
    </div>
  `
}
