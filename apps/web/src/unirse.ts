import QRCode from 'qrcode'
import type { JoinSetup, SharedWallet, Verdict } from '../../../contracts/index.js'
import { escapeHtml } from './inicio.js'

export function qrComoSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg' })
}

export function renderUnirse(wallet: SharedWallet, qrSvg: string, warning?: Verdict, setup?: JoinSetup): string {
  const advertencia =
    warning?.status === 'warn'
      ? `
        <div class="panel panel-ambar advertencia-unirse">
          <p class="panel-titulo">Revisa este permiso</p>
          <p>${escapeHtml(warning.userMessage)}</p>
          <div class="acciones">
            <button type="button" class="btn lleno" data-accion="confirmar-unirse">Unirme de todas formas</button>
            <button type="button" class="btn btn-contorno" data-accion="cancelar-unirse">Cancelar</button>
          </div>
        </div>
      `
      : ''

  return `
    <div class="contenedor pagina-formulario pagina-unirse">
      <header class="encabezado-formulario">
        <p class="formulario-ceja">Invitación al grupo</p>
        <h1>Unirse a ${escapeHtml(wallet.name)}</h1>
        <p>Escanea para unirte a ${escapeHtml(wallet.name)}</p>
      </header>
      <section class="tarjeta-invitacion" aria-label="Invitación con código QR">
        <div class="qr-unirse" aria-label="Código QR para unirse">${qrSvg}</div>
        <p>Tu billetera conserva el dinero. Antes de quedar activo, autorizas un tope y un intervalo.</p>
      </section>
      ${advertencia}
      <form id="form-unirse" class="formulario formulario-panel">
        <h2>Configura tu permiso</h2>
        ${setup ? `<label for="wallet-configurada">Wallet de prueba (sin autorizar todavía)</label><select id="wallet-configurada"><option value="">Selecciona tu propia wallet</option>${setup.members.map(m => `<option value="${escapeHtml(m.walletAddress)}">${escapeHtml(m.name)} · ${escapeHtml(m.assetCode)} · escala ${m.assetScale}</option>`).join('')}</select>` : ''}
        <label for="nombre-miembro">Nombre</label>
        <input id="nombre-miembro" name="name" type="text" autocomplete="name" required />
        <label for="direccion-miembro">Dirección de la billetera</label>
        <input id="direccion-miembro" name="walletAddress" type="url" required />
        <label for="tope-miembro">Tope por período (<span id="moneda-tope">${escapeHtml(wallet.currency)}</span>)</label>
        <input id="tope-miembro" name="cap" type="text" inputmode="decimal" value="100000" required />
        <label for="intervalo-miembro">Intervalo autorizado (UTC)</label>
        <input id="intervalo-miembro" name="interval" type="text" value="${escapeHtml(setup?.interval ?? 'R12/2026-10-17T00:00:00Z/P1M')}" required />
        <p>El tope está en la moneda de tu wallet. Solo quedarás activo después de autorizar.</p>
        <div id="mensaje" role="status"></div>
        <button class="btn lleno" type="submit">Continuar</button>
        <button class="btn btn-contorno" type="button" id="cancelar-union">Descartar unión pendiente local (no revoca permisos)</button>
      </form>
    </div>
  `
}

export function renderVueltaUnirse(ok: boolean): string {
  return `
    <div class="contenedor pagina-formulario resultado-unirse">
      <div class="panel ${ok ? 'panel-verde' : 'panel-rojo'} resultado-unirse-panel">
        <p class="panel-titulo">${ok ? 'Ya eres parte del grupo' : 'No pudimos confirmar que vienes de tu banco. No te uniste.'}</p>
      </div>
      <a class="btn lleno" href="#/inicio">Volver al inicio</a>
    </div>
  `
}
