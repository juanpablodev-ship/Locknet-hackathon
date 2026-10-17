import { walletAddressUrl } from './wallet-address.js'
import type { SharedWallet } from '../../../contracts/index.js'
import type { NuevoGrupo } from './api.js'
import { NOMBRE_GUARDIAN } from './config.js'
import { escapeHtml, renderReglas } from './inicio.js'
import { moneyFromMajor } from './money-input.js'

export interface ValoresGrupo {
  nombre: string
  moneda: string
  destinoNombre: string
  destinoDireccion: string
  monto: string          // en unidades mayores, sin separadores de miles ("200000")
  tope: string           // lo que cada uno autoriza al mes, mismo formato que monto
  aprobaciones: string
  riesgo: string
}

export type CampoGrupo = keyof ValoresGrupo
export type ErroresGrupo = Partial<Record<CampoGrupo, string>>

export const VALORES_INICIALES: ValoresGrupo = {
  nombre: '', moneda: 'COP', destinoNombre: '', destinoDireccion: '',
  monto: '200000', tope: '', aprobaciones: '2', riesgo: '60',
}

const MONEDAS = ['COP', 'EUR', 'USD']

function direccionValida(a: string): boolean {
  try { walletAddressUrl(a); return true } catch { return false }
}

// Revisa el formulario antes de enviar. Si todo está bien devuelve el cuerpo de POST /api/wallets.
export function validarGrupo(v: ValoresGrupo): { errores: ErroresGrupo; body?: NuevoGrupo } {
  const errores: ErroresGrupo = {}
  const nombre = v.nombre.trim()
  const destinoNombre = v.destinoNombre.trim()
  const direccion = v.destinoDireccion.trim()
  if (!nombre) errores.nombre = 'Escribe el nombre del grupo.'
  else if (nombre.length > 60) errores.nombre = 'El nombre puede tener hasta 60 caracteres.'
  if (!MONEDAS.includes(v.moneda)) errores.moneda = 'Elige COP, EUR o USD.'
  if (!destinoNombre) errores.destinoNombre = 'Escribe el nombre del destino de confianza.'
  else if (destinoNombre.length > 60) errores.destinoNombre = 'El nombre puede tener hasta 60 caracteres.'
  if (!direccion) errores.destinoDireccion = 'Escribe la dirección de la billetera del destino.'
  else if (!direccionValida(direccion)) errores.destinoDireccion = 'La dirección debe empezar por https:// o $.'
  let aboveAmount
  try { aboveAmount = moneyFromMajor(v.monto.trim(), MONEDAS.includes(v.moneda) ? v.moneda : 'COP', 2) }
  catch { errores.monto = 'Escribe un monto mayor que 0, sin puntos de miles (por ejemplo 200000).' }
  let cap
  try { cap = moneyFromMajor(v.tope.trim(), MONEDAS.includes(v.moneda) ? v.moneda : 'COP', 2) }
  catch { errores.tope = 'Escribe cuánto autoriza cada uno al mes, mayor que 0 y sin puntos de miles (por ejemplo 40000).' }
  const aprobaciones = Number(v.aprobaciones)
  if (!Number.isInteger(aprobaciones) || aprobaciones < 1 || aprobaciones > 3) errores.aprobaciones = 'Elige de 1 a 3 aprobaciones.'
  const riesgo = Number(v.riesgo)
  if (v.riesgo.trim() === '' || !Number.isInteger(riesgo) || riesgo < 1 || riesgo > 100) errores.riesgo = 'El umbral debe ser un número entero de 1 a 100.'
  if (Object.keys(errores).length > 0 || !aboveAmount || !cap) return { errores }
  return {
    errores,
    body: {
      name: nombre, currency: v.moneda, approvalsRequired: aprobaciones, aboveAmount, riskThreshold: riesgo,
      memberCap: { cap }, knownDestinations: [{ name: destinoNombre, walletAddress: walletAddressUrl(direccion) }],
    },
  }
}

// Grupo borrador para la vista previa: tolera valores a medio escribir (nunca lanza).
export function armarBorrador(v: ValoresGrupo): SharedWallet {
  const moneda = MONEDAS.includes(v.moneda) ? v.moneda : 'COP'
  let aboveAmount
  try { aboveAmount = moneyFromMajor(v.monto.trim(), moneda, 2) } catch { aboveAmount = { value: '0', assetCode: moneda, assetScale: 2 } }
  let cap
  try { cap = moneyFromMajor(v.tope.trim(), moneda, 2) } catch { cap = undefined }
  const aprobaciones = Number(v.aprobaciones)
  const riesgo = Number(v.riesgo)
  const destinoNombre = v.destinoNombre.trim()
  return {
    id: 'borrador', name: v.nombre.trim() || 'Tu grupo', currency: moneda, kind: 'care', members: [],
    rules: {
      split: 'equal',
      ...(cap ? { memberCap: { cap, interval: 'R12/2026-01-01T00:00:00Z/P1M' } } : {}),   // el servidor fija el intervalo real
      groupApproval: {
        aboveAmount, approvalsRequired: Number.isInteger(aprobaciones) && aprobaciones >= 1 ? aprobaciones : 2,
        riskThreshold: Number.isInteger(riesgo) && riesgo >= 1 ? riesgo : 60, confirmInWallet: false,
      },
    },
    knownDestinations: destinoNombre ? [{ name: destinoNombre, walletAddress: v.destinoDireccion.trim() }] : [],
    authorizedCapacity: { value: '0', assetCode: moneda, assetScale: 2 },
  }
}

export function renderVistaPreviaContrato(v: ValoresGrupo): string {
  return renderReglas(armarBorrador(v), [])
}

function error(campo: CampoGrupo, errores: ErroresGrupo): string {
  const texto = errores[campo]
  return `<p class="error-campo" id="error-${campo}" role="alert"${texto ? '' : ' hidden'}>${texto ? escapeHtml(texto) : ''}</p>`
}

export function renderCrearGrupo(v: ValoresGrupo = VALORES_INICIALES, errores: ErroresGrupo = {}): string {
  const opcionesMoneda = MONEDAS.map((m) => `<option value="${m}"${m === v.moneda ? ' selected' : ''}>${m}</option>`).join('')
  const opcionesAprobaciones = [1, 2, 3].map((n) => `<option value="${n}"${String(n) === v.aprobaciones ? ' selected' : ''}>${n}</option>`).join('')
  return `
    <div class="contenedor">
      <h1>Crear grupo</h1>
      <p>Define el contrato del grupo. Abajo ves cómo queda antes de guardarlo.</p>
      <form id="form-crear-grupo" class="formulario" novalidate>
        <label for="nombre-grupo">Nombre del grupo</label>
        <input id="nombre-grupo" name="nombre" type="text" maxlength="80" placeholder="Medicinas de mamá" value="${escapeHtml(v.nombre)}" />
        ${error('nombre', errores)}
        <label for="moneda-grupo">Moneda</label>
        <select id="moneda-grupo" name="moneda">${opcionesMoneda}</select>
        ${error('moneda', errores)}
        <label for="destino-nombre">Destino de confianza</label>
        <input id="destino-nombre" name="destinoNombre" type="text" maxlength="80" placeholder="Farmacia Medellín" value="${escapeHtml(v.destinoNombre)}" />
        ${error('destinoNombre', errores)}
        <label for="destino-direccion">Dirección de la billetera del destino</label>
        <input id="destino-direccion" name="destinoDireccion" type="text" placeholder="https://ilp.interledger-test.dev/farmacia-medellin" value="${escapeHtml(v.destinoDireccion)}" />
        ${error('destinoDireccion', errores)}
        <p class="nota-configuracion">${NOMBRE_GUARDIAN} avisa si un pago va a una dirección parecida a esta.</p>
        <label for="monto-aprobacion">Pedir aprobación del grupo para pagos mayores a</label>
        <input id="monto-aprobacion" name="monto" type="text" inputmode="decimal" value="${escapeHtml(v.monto)}" />
        ${error('monto', errores)}
        <label for="tope-persona">Cada uno autoriza hasta (al mes)</label>
        <input id="tope-persona" name="tope" type="text" inputmode="decimal" placeholder="40000" value="${escapeHtml(v.tope)}" />
        ${error('tope', errores)}
        <p class="nota-configuracion">Se renueva cada mes.</p>
        <label for="aprobaciones-grupo">Aprobaciones necesarias</label>
        <select id="aprobaciones-grupo" name="aprobaciones">${opcionesAprobaciones}</select>
        ${error('aprobaciones', errores)}
        <details class="avanzado-grupo"${errores.riesgo ? ' open' : ''}>
          <summary>Avanzado</summary>
          <label for="umbral-riesgo">Umbral de riesgo</label>
          <input id="umbral-riesgo" name="riesgo" type="text" inputmode="numeric" value="${escapeHtml(v.riesgo)}" />
          ${error('riesgo', errores)}
          <p class="nota-configuracion">Un pago con riesgo igual o mayor a este número necesita la aprobación del grupo.</p>
        </details>
        <div id="mensaje" role="status"></div>
        <button class="boton" type="submit">Crear grupo</button>
      </form>
      <div id="vista-contrato" aria-label="Vista previa del contrato del grupo">${renderVistaPreviaContrato(v)}</div>
    </div>
  `
}
