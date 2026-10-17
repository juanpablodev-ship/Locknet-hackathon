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
      <a class="boton" href="#/gasto/${escapeHtml(spend.id)}">Ver gasto</a>
    </article>
  `
}

export function renderHistorial(spends: Spend[], wallet: SharedWallet): string {
  if (spends.length === 0) {
    return `
      <div class="contenedor historial">
        <h1>Historial · ${escapeHtml(wallet.name)}</h1>
        <p class="sin-historial">Todavía no hay gastos en este grupo</p>
      </div>
    `
  }

  // Spend no tiene fecha; conservar el orden de la API hasta que R3 agregue ese campo.
  return `
    <div class="contenedor historial">
      <h1>Historial · ${escapeHtml(wallet.name)}</h1>
      <div class="lista-historial">${spends.map(renderFila).join('')}</div>
    </div>
  `
}
