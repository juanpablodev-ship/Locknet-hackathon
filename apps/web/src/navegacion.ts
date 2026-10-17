import type { Route } from './router.js'
import type { ApiModeInfo } from './api.js'
import { escapeHtml } from './inicio.js'

export function renderBandaRespaldo(
  mode: ApiModeInfo['mode'],
  label?: string,
): string {
  if (mode !== 'fixtures') return ''
  return `<div class="banda-respaldo" role="status">${escapeHtml(
    label ?? 'MODO RESPALDO · respuestas reales grabadas',
  )}</div>`
}

function current(route: Route, item: 'inicio' | 'gasto' | 'unirse' | 'historial'): boolean {
  if (item === 'inicio') return route.name === 'inicio'
  if (item === 'gasto') return route.name === 'gasto-nuevo' || route.name === 'gasto'
  if (item === 'unirse') return route.name === 'unirse' || route.name === 'unirse-volver'
  return route.name === 'historial'
}

export function renderMenuNavegacion(route: Route): string {
  const links: { id: 'inicio' | 'gasto' | 'unirse' | 'historial'; href: string; label: string }[] = [
    { id: 'inicio', href: '#/inicio', label: 'Inicio' },
    { id: 'gasto', href: '#/gasto/nuevo', label: 'Pedir un gasto' },
    { id: 'unirse', href: '#/unirse', label: 'Unirse' },
    { id: 'historial', href: '#/historial', label: 'Historial' },
  ]
  const items = links
    .map((link) => {
      const active = current(route, link.id)
      return `<a class="${active ? 'menu-activo' : ''}" href="${link.href}"${active ? ' aria-current="page"' : ''}>${link.label}</a>`
    })
    .join('')
  return `<nav class="menu-navegacion" aria-label="Navegación principal">${items}</nav>`
}

export function renderAppChrome(
  route: Route,
  mode: ApiModeInfo['mode'],
  label?: string,
  error?: string,
): string {
  const mensaje = error ? `<span role="status">${escapeHtml(error)}</span>` : ''
  return `${renderBandaRespaldo(mode, label)}
    <div class="acciones-demo">
      ${mensaje}
      <button type="button" class="boton-reiniciar-demo" data-accion="reiniciar-demo">Reiniciar</button>
    </div>
    ${renderMenuNavegacion(route)}`
}
