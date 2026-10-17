import type { SharedWallet, Spend } from '../../../contracts/index.js'
import { formatMoney, riskLevel } from './format.js'
import { escapeHtml } from './inicio.js'

function renderFila(spend: Spend, walletName: string): string {
  const nivel = riskLevel(spend.risk)
  return `
    <a class="pedido" href="#/gasto/${escapeHtml(spend.id)}">
      <span class="pedido-datos">
        <b class="pedido-destino">${escapeHtml(spend.destination.name)}</b>
        <span class="pedido-billetera">Billetera: ${escapeHtml(walletName)}</span>
      </span>
      <span class="pedido-detalle">
        <b class="pedido-monto">${escapeHtml(formatMoney(spend.amount))}</b>
        <span class="insignia-riesgo riesgo-${nivel.tone}">${escapeHtml(nivel.label)} · ${spend.risk}</span>
      </span>
      <span class="pedido-revisar">Revisar <span aria-hidden="true">→</span></span>
    </a>
  `
}

export function renderPorAprobar(spends: Spend[], wallet: SharedWallet): string {
  const pendientes = spends.filter((spend) => spend.status === 'awaiting-approval')

  if (pendientes.length === 0) {
    return `
      <div class="contenedor">
        <h1>Por aprobar · ${escapeHtml(wallet.name)}</h1>
        <p class="vacio" role="status">No hay pagos por aprobar</p>
      </div>
    `
  }

  return `
    <div class="contenedor">
      <h1>Por aprobar · ${escapeHtml(wallet.name)}</h1>
      <div class="lista-aprobar" aria-label="Gastos pendientes de aprobación">${pendientes.map((spend) => renderFila(spend, wallet.name)).join('')}</div>
    </div>
  `
}
