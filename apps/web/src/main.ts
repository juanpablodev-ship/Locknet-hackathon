import { parseHash, type Route } from './router.js'
import { getWallet, MODO, onEvents, playEscenario1, playEscenario3, resetMock } from './api.js'
import { renderInicio } from './inicio.js'
import './styles.css'

const nombres: Record<Route['name'], string> = {
  inicio: 'inicio',
  unirse: 'unirse',
  'gasto-nuevo': 'gasto-nuevo',
  gasto: 'gasto',
  historial: 'historial',
  'no-encontrada': 'Pantalla no encontrada'
}

let desuscribir: (() => void) | null = null

function panelDevHtml(): string {
  if (MODO !== 'mock') return ''
  return `
    <div class="panel-dev">
      <span>Modo respaldo</span>
      <button type="button" data-accion="escenario1">Escenario 1</button>
      <button type="button" data-accion="escenario3">Escenario 3</button>
      <button type="button" data-accion="reiniciar">Reiniciar</button>
    </div>
  `
}

function enlazarPanelDev(): void {
  if (MODO !== 'mock') return
  const panel = document.querySelector('.panel-dev')
  panel?.addEventListener('click', (ev) => {
    const boton = (ev.target as HTMLElement).closest('button')
    const accion = boton?.dataset.accion
    if (accion === 'escenario1') playEscenario1()
    else if (accion === 'escenario3') playEscenario3()
    else if (accion === 'reiniciar') resetMock()
    else return
    pintarInicio()
  })
}

function pintarInicio(): void {
  const app = document.getElementById('app')
  if (!app) return
  app.innerHTML = renderInicio(getWallet('w-mama')) + panelDevHtml()
  enlazarPanelDev()
}

function render(): void {
  desuscribir?.()
  desuscribir = null

  const app = document.getElementById('app')
  if (!app) return
  const route = parseHash(location.hash)

  if (route.name === 'inicio') {
    pintarInicio()
    desuscribir = onEvents('w-mama', (e) => {
      if (e.type === 'member-active' || e.type === 'member-revoked' || e.type === 'capacity-updated') {
        pintarInicio()
      }
    })
    return
  }

  app.innerHTML = `<h1>${nombres[route.name]}</h1>`
}

window.addEventListener('hashchange', render)
render()
