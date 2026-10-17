import type { Route } from './router.js'
import type { ApiModeInfo } from './api.js'
import type { Tema } from './tema.js'
import { escapeHtml } from './inicio.js'

export function renderBandaRespaldo(mode: ApiModeInfo['mode'], label?: string): string {
  if (mode !== 'fixtures') return ''
  return `<div class="banda-respaldo" role="status">${escapeHtml(
    label ?? 'MODO RESPALDO · respuestas reales grabadas',
  )}</div>`
}

export function renderEncabezado(nombreBilletera: string, numeroMiembros: number, tema: Tema): string {
  const plural = numeroMiembros === 1 ? 'miembro' : 'miembros'
  return `
    <header class="cab">
      <div><small class="cab-marca">Kivor</small><b>${escapeHtml(nombreBilletera)}</b><span>${numeroMiembros} ${plural}</span></div>
      <button id="tema" type="button" data-accion="alternar-tema">${tema === 'dark' ? 'Tema claro' : 'Tema oscuro'}</button>
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
  tema: Tema
  contadorPorAprobar: number
}

export function renderAppChrome(info: AppChromeInfo): string {
  const mensaje = info.error ? `<span role="status">${escapeHtml(info.error)}</span>` : ''
  return `${renderBandaRespaldo(info.mode, info.label)}
    ${renderEncabezado(info.nombreBilletera, info.numeroMiembros, info.tema)}
    <div class="acciones-demo">
      ${mensaje}
      <button type="button" class="boton-reiniciar-demo" data-accion="reiniciar-demo">Reiniciar</button>
    </div>
    ${renderPestanas(info.route, info.contadorPorAprobar)}`
}
