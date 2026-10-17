import type { SharedWallet } from '../../../contracts/index.js'
import { formatMoney } from './format.js'
import { escapeHtml } from './inicio.js'

export function previewReparto(pesos: number, wallet: SharedWallet): string {
  const activos = wallet.members.filter((member) => member.status === 'active').length
  if (!Number.isSafeInteger(pesos) || pesos <= 0 || activos === 0) return 'Cada uno pone: —'

  const total = BigInt(pesos)
  const miembros = BigInt(activos)
  const parte = (total / miembros).toString()
  const aproximado = total % miembros !== 0n ? '≈' : ''
  const amount = { value: (BigInt(parte) * 100n).toString(), assetCode: wallet.currency, assetScale: 2 }
  return `Cada uno pone: ${aproximado}${escapeHtml(formatMoney(amount))}`
}

export function renderGastoNuevo(wallet: SharedWallet): string {
  const destinos = wallet.knownDestinations
    .map(
      (destination) =>
        `<option value="${escapeHtml(destination.walletAddress)}" data-name="${escapeHtml(destination.name)}">${escapeHtml(destination.name)}</option>`
    )
    .join('')

  return `
    <div class="contenedor">
      <h1>Pedir un gasto</h1>
      <form id="form-gasto" class="formulario">
        <label for="destino">Destino</label>
        <select id="destino" name="destination" required>
          <option value="" disabled selected>Elige un destino</option>
          ${destinos}
          <option value="otra">Otra cuenta</option>
        </select>
        <div id="otro-destino" hidden>
          <label for="nombre-destino">Nombre del destino</label>
          <input id="nombre-destino" name="destinationName" type="text" />
          <label for="direccion-destino">Dirección de la billetera</label>
          <input id="direccion-destino" name="destinationAddress" type="url" />
        </div>
        <label for="monto-gasto">Monto en ${escapeHtml(wallet.currency)}</label>
        <input id="monto-gasto" name="amount" type="number" min="1" step="1" value="120000" required />
        <p id="vista-previa" class="vista-previa">${previewReparto(120000, wallet)}</p>
        <label for="motivo-gasto">Motivo (solo informativo)</label>
        <textarea id="motivo-gasto" name="reason" rows="3"></textarea>
        <div id="mensaje" role="status"></div>
        <button class="boton" type="submit">Pedir el gasto</button>
      </form>
    </div>
  `
}
