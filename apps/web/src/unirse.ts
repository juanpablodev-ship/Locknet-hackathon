import QRCode from 'qrcode'
import type { SharedWallet, Verdict } from '../../../contracts/index.js'
import { escapeHtml } from './inicio.js'

export function qrComoSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg' })
}

export function renderUnirse(wallet: SharedWallet, qrSvg: string, warning?: Verdict): string {
  const advertencia =
    warning?.status === 'warn'
      ? `
        <div class="panel panel-ambar advertencia-unirse">
          <p class="panel-titulo">Revisa este permiso</p>
          <p>${escapeHtml(warning.userMessage)}</p>
          <div class="acciones">
            <button type="button" class="boton" data-accion="confirmar-unirse">Unirme de todas formas</button>
            <button type="button" class="boton boton-rechazar" data-accion="cancelar-unirse">Cancelar</button>
          </div>
        </div>
      `
      : ''

  return `
    <div class="contenedor">
      <h1>Unirse a ${escapeHtml(wallet.name)}</h1>
      <p>Escanea para unirte a ${escapeHtml(wallet.name)}</p>
      <div class="qr-unirse" aria-label="Código QR para unirse">${qrSvg}</div>
      ${advertencia}
      <form id="form-unirse" class="formulario">
        <label for="nombre-miembro">Nombre</label>
        <input id="nombre-miembro" name="name" type="text" autocomplete="name" required />
        <label for="direccion-miembro">Dirección de la billetera</label>
        <input id="direccion-miembro" name="walletAddress" type="url" required />
        <label for="tope-miembro">Tope mensual en pesos</label>
        <input id="tope-miembro" name="cap" type="number" min="1" step="1" value="50000" required />
        <div id="mensaje" role="status"></div>
        <button class="boton" type="submit">Continuar</button>
      </form>
    </div>
  `
}

export function renderVueltaUnirse(ok: boolean): string {
  return `
    <div class="contenedor">
      <div class="panel ${ok ? 'panel-verde' : 'panel-rojo'}">
        <p class="panel-titulo">${ok ? 'Ya eres parte del grupo' : 'No pudimos confirmar que vienes de tu banco. No te uniste.'}</p>
      </div>
      <a class="boton" href="#/inicio">Volver al inicio</a>
    </div>
  `
}
