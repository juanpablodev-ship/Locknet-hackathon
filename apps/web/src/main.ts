import type { Member } from '../../../contracts/index.js'
import { parseHash, type Route } from './router.js'
import {
  MODO,
  castApproval,
  executeSpend,
  getSpend,
  getWallet,
  onEvents,
  playEscenario1,
  playEscenario3,
  requestSpend,
  resetMock,
  retryShare,
  setFalloAporte
} from './api.js'
import { escapeHtml, renderInicio } from './inicio.js'
import { renderGasto } from './gasto.js'
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
let votaComoActual: string | undefined

function navegarA(hash: string): void {
  if (location.hash === hash) render()
  else location.hash = hash
}

function panelDevHtml(): string {
  if (MODO !== 'mock') return ''
  return `
    <div class="panel-dev">
      <span>Modo respaldo</span>
      <button type="button" data-accion="escenario1">Escenario 1</button>
      <button type="button" data-accion="escenario2">Escenario 2</button>
      <button type="button" data-accion="escenario3">Escenario 3</button>
      <button type="button" data-accion="reiniciar">Reiniciar</button>
      <label class="interruptor">
        <input type="checkbox" id="falla-madrid" />
        Que falle Madrid
      </label>
    </div>
  `
}

function enlazarPanelDev(): void {
  if (MODO !== 'mock') return
  const panel = document.querySelector('.panel-dev')
  panel?.addEventListener('click', (ev) => {
    const boton = (ev.target as HTMLElement).closest('button')
    const accion = boton?.dataset.accion
    if (accion === 'escenario1') {
      playEscenario1()
      navegarA('#/inicio')
    } else if (accion === 'escenario2') {
      const wallet = getWallet('w-mama')
      const farmacia = wallet.knownDestinations[0]
      const spend = requestSpend('w-mama', farmacia, { value: '12000000', assetCode: 'COP', assetScale: 2 })
      navegarA(`#/gasto/${spend.id}`)
    } else if (accion === 'escenario3') {
      playEscenario3()
      navegarA('#/gasto/s-ataque')
    } else if (accion === 'reiniciar') {
      resetMock()
      navegarA('#/inicio')
    }
  })

  const interruptor = document.getElementById('falla-madrid') as HTMLInputElement | null
  interruptor?.addEventListener('change', () => {
    setFalloAporte(interruptor.checked ? 'm-madrid' : null)
  })
}

function pintarInicio(): void {
  const app = document.getElementById('app')
  if (!app) return
  app.innerHTML = renderInicio(getWallet('w-mama')) + panelDevHtml()
  enlazarPanelDev()
}

function selectVotanteHtml(activos: Member[]): string {
  const opciones = activos
    .map(
      (m) =>
        `<option value="${escapeHtml(m.id)}" ${m.id === votaComoActual ? 'selected' : ''}>${escapeHtml(m.name)}</option>`
    )
    .join('')
  return `
    <div class="contenedor votante-barra">
      <label class="votante">
        Votas como:
        <select id="votante">${opciones}</select>
      </label>
    </div>
  `
}

function pintarGasto(id: string): void {
  const app = document.getElementById('app')
  if (!app) return

  let spend
  try {
    spend = getSpend(id)
  } catch {
    app.innerHTML = `
      <div class="contenedor">
        <p>Gasto no encontrado</p>
        <a class="boton" href="#/inicio">Volver al inicio</a>
      </div>
    `
    return
  }

  const wallet = getWallet(spend.walletId)
  const activos = wallet.members.filter((m) => m.status === 'active')
  if (!votaComoActual || !activos.some((m) => m.id === votaComoActual)) {
    votaComoActual = activos[0]?.id
  }

  app.innerHTML = selectVotanteHtml(activos) + renderGasto(spend, wallet, votaComoActual) + panelDevHtml()

  document.getElementById('votante')?.addEventListener('change', (ev) => {
    votaComoActual = (ev.target as HTMLSelectElement).value
    pintarGasto(id)
  })

  app.querySelector('.acciones')?.addEventListener('click', (ev) => {
    const boton = (ev.target as HTMLElement).closest('[data-accion]') as HTMLElement | null
    if (!boton) return
    const accion = boton.dataset.accion
    const spendId = boton.dataset.spend
    if (!spendId) return

    try {
      if (accion === 'aprobar' || accion === 'rechazar') {
        if (!votaComoActual) return
        castApproval(spendId, votaComoActual, accion === 'aprobar')
      } else if (accion === 'pagar') {
        executeSpend(spendId)
      } else if (accion === 'reintentar') {
        retryShare(spendId)
      }
    } catch (err) {
      const mensaje = document.getElementById('mensaje')
      if (mensaje) mensaje.textContent = err instanceof Error ? err.message : 'No se pudo completar la acción.'
    }
  })

  enlazarPanelDev()
}

function tryGetSpend(id: string) {
  try {
    return getSpend(id)
  } catch {
    return null
  }
}

const EVENTOS_GASTO = new Set([
  'spend-reviewed',
  'approval-cast',
  'spend-approved',
  'spend-rejected',
  'share-paid',
  'share-failed',
  'spend-paid'
])

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

  if (route.name === 'gasto') {
    pintarGasto(route.id)
    const spend = tryGetSpend(route.id)
    if (spend) {
      desuscribir = onEvents(spend.walletId, (e) => {
        if (e.type === 'capacity-updated' || (EVENTOS_GASTO.has(e.type) && e.spendId === route.id)) {
          pintarGasto(route.id)
        }
      })
    }
    return
  }

  app.innerHTML = `<h1>${nombres[route.name]}</h1>`
}

window.addEventListener('hashchange', render)
render()
