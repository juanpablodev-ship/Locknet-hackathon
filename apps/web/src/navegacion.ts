import type { Route } from './router.js'
import type { ApiModeInfo } from './api.js'
import { NOMBRE_PRODUCTO } from './config.js'
import { escapeHtml } from './inicio.js'

export function renderBandaRespaldo(mode: ApiModeInfo['mode'], label?: string): string {
  if (mode !== 'fixtures') return ''
  return `<div class="banda-respaldo" role="status">${escapeHtml(
    label ?? 'MODO RESPALDO · respuestas reales grabadas',
  )}</div>`
}

export function renderEncabezado(nombreBilletera: string, numeroMiembros: number): string {
  const plural = numeroMiembros === 1 ? 'miembro' : 'miembros'
  return `
    <header class="cab">
      <div><b>${escapeHtml(NOMBRE_PRODUCTO)}</b><span>${escapeHtml(nombreBilletera)} · ${numeroMiembros} ${plural}</span></div>
    </header>
  `
}

function pestanaActiva(route: Route, tab: 'inicio' | 'por-aprobar' | 'historial'): boolean {
  if (tab === 'inicio') return route.name === 'inicio'
  // La pantalla de un gasto es donde se revisa y se vota un pago pendiente:
  // conceptualmente es parte de "Por aprobar", aunque su ruta sea #/gasto/:id.
  if (tab === 'por-aprobar') return route.name === 'por-aprobar' || route.name === 'gasto'
  return route.name === 'historial'
}

function itemPestana(route: Route, tab: 'inicio' | 'por-aprobar' | 'historial', href: string, etiqueta: string, contador?: number): string {
  const activa = pestanaActiva(route, tab)
  const insignia = contador && contador > 0 ? `<i>${contador}</i>` : ''
  return `<a class="${activa ? 'tab-activa' : ''}" href="${href}"${activa ? ' aria-current="page"' : ''}>${etiqueta}${insignia}</a>`
}

export function renderPestanas(route: Route, contadorPorAprobar: number): string {
  return `
    <nav class="tabs" aria-label="Navegación principal">
      ${itemPestana(route, 'inicio', '#/inicio', 'Inicio')}
      ${itemPestana(route, 'por-aprobar', '#/por-aprobar', 'Por aprobar', contadorPorAprobar)}
      ${itemPestana(route, 'historial', '#/historial', 'Historial')}
    </nav>
  `
}

export interface AppChromeInfo {
  route: Route
  mode: ApiModeInfo['mode']
  label?: string
  error?: string
  nombreBilletera: string
  numeroMiembros: number
  contadorPorAprobar: number
  mostrarReinicio?: boolean
}

export function renderAppChrome(info: AppChromeInfo): string {
  const mensaje = info.error ? `<span role="status">${escapeHtml(info.error)}</span>` : ''
  const reinicio =
    info.mostrarReinicio === false
      ? ''
      : '<button type="button" class="boton-reiniciar-demo" data-accion="reiniciar-demo">Reiniciar</button>'
  const acciones = mensaje || reinicio ? `<div class="acciones-demo">${mensaje}${reinicio}</div>` : ''
  return `${renderBandaRespaldo(info.mode, info.label)}
    ${renderEncabezado(info.nombreBilletera, info.numeroMiembros)}
    ${acciones}
    ${renderPestanas(info.route, info.contadorPorAprobar)}`
}
