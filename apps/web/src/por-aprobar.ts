import type { SharedWallet, Spend } from '../../../contracts/index.js'
import { formatMoney } from './format.js'
import { escapeHtml } from './inicio.js'

function renderFila(spend: Spend): string {
  return `
    <article class="fila-gasto">
      <div>
        <p class="fila-gasto-destino">${escapeHtml(spend.destination.name)}</p>
      </div>
      <p class="fila-gasto-monto">${escapeHtml(formatMoney(spend.amount))}</p>
      <a class="boton" href="#/gasto/${escapeHtml(spend.id)}">Revisar</a>
    </article>
  `
}

export function renderPorAprobar(spends: Spend[], wallet: SharedWallet): string {
  const pendientes = spends.filter((spend) => spend.status === 'awaiting-approval')

  if (pendientes.length === 0) {
    return `
      <div class="contenedor">
        <h1>Por aprobar · ${escapeHtml(wallet.name)}</h1>
        <p>No hay pagos por aprobar</p>
      </div>
    `
  }

  return `
    <div class="contenedor">
      <h1>Por aprobar · ${escapeHtml(wallet.name)}</h1>
      <div class="lista-historial">${pendientes.map(renderFila).join('')}</div>
    </div>
  `
}
