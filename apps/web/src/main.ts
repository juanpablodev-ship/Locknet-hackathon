import type { Member, SharedWallet, Spend } from '../../../contracts/index.js'
import { parseHash, type Route } from './router.js'
import {
  MODO,
  castApproval,
  crearTurnos,
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
import { previewReparto, renderGastoNuevo } from './gasto-nuevo.js'
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
const turnos = crearTurnos()

function navegarA(hash: string): void {
  if (location.hash === hash) render()
  else location.hash = hash
}

function pintarCargando(app: HTMLElement): void {
  app.innerHTML = '<div class="contenedor"><p class="cargando">Cargando…</p></div>'
}

function pintarError(app: HTMLElement, err: unknown, reintentar: () => void): void {
  const texto = err instanceof Error ? err.message : 'Ocurrió un error inesperado.'
  app.innerHTML = `
    <div class="contenedor">
      <p id="mensaje" role="status">${escapeHtml(texto)}</p>
      <button type="button" class="boton" id="reintentar-carga">Reintentar</button>
    </div>
  `
  document.getElementById('reintentar-carga')?.addEventListener('click', reintentar)
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
      void (async () => {
        const wallet = await getWallet('w-mama')
        const farmacia = wallet.knownDestinations[0]
        const spend = await requestSpend('w-mama', farmacia, { value: '12000000', assetCode: 'COP', assetScale: 2 })
        navegarA(`#/gasto/${spend.id}`)
      })()
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

async function pintarInicio(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) return
  const miTurno = turnos.nuevo()
  pintarCargando(app)

  let wallet: SharedWallet
  try {
    wallet = await getWallet('w-mama')
  } catch (err) {
    if (!turnos.esVigente(miTurno)) return
    pintarError(app, err, () => void pintarInicio())
    return
  }
  if (!turnos.esVigente(miTurno)) return

  app.innerHTML = renderInicio(wallet) + panelDevHtml()
  enlazarPanelDev()

  desuscribir = onEvents('w-mama', (e) => {
    if (e.type === 'member-active' || e.type === 'member-revoked' || e.type === 'capacity-updated') {
      void pintarInicio()
    }
  })
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

const EVENTOS_GASTO = new Set([
  'spend-reviewed',
  'approval-cast',
  'spend-approved',
  'spend-rejected',
  'share-paid',
  'share-failed',
  'spend-paid'
])

async function pintarGasto(id: string): Promise<void> {
  const app = document.getElementById('app')
  if (!app) return
  const miTurno = turnos.nuevo()
  pintarCargando(app)

  let spend: Spend
  try {
    spend = await getSpend(id)
  } catch (err) {
    if (!turnos.esVigente(miTurno)) return
    if (err instanceof Error && err.message === 'Gasto no encontrado') {
      app.innerHTML = `
        <div class="contenedor">
          <p>Gasto no encontrado</p>
          <a class="boton" href="#/inicio">Volver al inicio</a>
        </div>
      `
    } else {
      pintarError(app, err, () => void pintarGasto(id))
    }
    return
  }
  if (!turnos.esVigente(miTurno)) return

  let wallet: SharedWallet
  try {
    wallet = await getWallet(spend.walletId)
  } catch (err) {
    if (!turnos.esVigente(miTurno)) return
    pintarError(app, err, () => void pintarGasto(id))
    return
  }
  if (!turnos.esVigente(miTurno)) return

  const activos = wallet.members.filter((m) => m.status === 'active')
  if (!votaComoActual || !activos.some((m) => m.id === votaComoActual)) {
    votaComoActual = activos[0]?.id
  }

  app.innerHTML = selectVotanteHtml(activos) + renderGasto(spend, wallet, votaComoActual) + panelDevHtml()

  document.getElementById('votante')?.addEventListener('change', (ev) => {
    votaComoActual = (ev.target as HTMLSelectElement).value
    void pintarGasto(id)
  })

  app.querySelector('.acciones')?.addEventListener('click', (ev) => {
    const boton = (ev.target as HTMLElement).closest('[data-accion]') as HTMLElement | null
    if (!boton) return
    const accion = boton.dataset.accion
    const spendId = boton.dataset.spend
    if (!spendId) return

    void (async () => {
      try {
        if (accion === 'aprobar' || accion === 'rechazar') {
          if (!votaComoActual) return
          await castApproval(spendId, votaComoActual, accion === 'aprobar')
        } else if (accion === 'pagar') {
          await executeSpend(spendId)
        } else if (accion === 'reintentar') {
          await retryShare(spendId)
        }
      } catch (err) {
        const mensaje = document.getElementById('mensaje')
        if (mensaje) mensaje.textContent = err instanceof Error ? err.message : 'No se pudo completar la acción.'
      }
    })()
  })

  enlazarPanelDev()

  // Se suscribe al final, ya con el turno todavía vigente: evita dejar una suscripción
  // de un pintado que quedó obsoleto mientras se esperaban las promesas de arriba.
  desuscribir = onEvents(wallet.id, (e) => {
    if (e.type === 'capacity-updated' || (EVENTOS_GASTO.has(e.type) && e.spendId === id)) {
      void pintarGasto(id)
    }
  })
}

async function pintarFormularioGasto(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) return
  const miTurno = turnos.nuevo()
  pintarCargando(app)

  let wallet: SharedWallet
  try {
    wallet = await getWallet('w-mama')
  } catch (err) {
    if (!turnos.esVigente(miTurno)) return
    pintarError(app, err, () => void pintarFormularioGasto())
    return
  }
  if (!turnos.esVigente(miTurno)) return

  app.innerHTML = renderGastoNuevo(wallet) + panelDevHtml()
  const formulario = document.getElementById('form-gasto') as HTMLFormElement | null
  const selector = document.getElementById('destino') as HTMLSelectElement | null
  const otroDestino = document.getElementById('otro-destino')
  const monto = document.getElementById('monto-gasto') as HTMLInputElement | null
  const vistaPrevia = document.getElementById('vista-previa')

  selector?.addEventListener('change', () => {
    if (otroDestino) otroDestino.hidden = selector.value !== 'otra'
  })
  monto?.addEventListener('input', () => {
    if (vistaPrevia) vistaPrevia.textContent = previewReparto(Number(monto.value), wallet)
  })
  formulario?.addEventListener('submit', (event) => {
    event.preventDefault()
    const mensaje = document.getElementById('mensaje')
    const valorPesos = Number(monto?.value)
    if (!Number.isSafeInteger(valorPesos) || valorPesos <= 0) {
      if (mensaje) mensaje.textContent = 'Escribe un monto mayor que cero en pesos enteros.'
      return
    }

    const destinoElegido = selector?.value
    const conocido = wallet.knownDestinations.find((destination) => destination.walletAddress === destinoElegido)
    const nombre = conocido?.name ?? (document.getElementById('nombre-destino') as HTMLInputElement | null)?.value.trim()
    const walletAddress =
      conocido?.walletAddress ?? (document.getElementById('direccion-destino') as HTMLInputElement | null)?.value.trim()
    if (!nombre || !walletAddress) {
      if (mensaje) mensaje.textContent = 'Elige un destino o escribe su nombre y dirección.'
      return
    }

    void (async () => {
      try {
        const spend = await requestSpend('w-mama', { name: nombre, walletAddress }, {
          value: (BigInt(valorPesos) * 100n).toString(),
          assetCode: wallet.currency,
          assetScale: 2,
        })
        navegarA(`#/gasto/${spend.id}`)
      } catch (err) {
        if (mensaje) mensaje.textContent = err instanceof Error ? err.message : 'No se pudo pedir el gasto.'
      }
    })()
  })
  enlazarPanelDev()
}

function render(): void {
  desuscribir?.()
  desuscribir = null

  const app = document.getElementById('app')
  if (!app) return
  const route = parseHash(location.hash)

  if (route.name === 'inicio') {
    void pintarInicio()
    return
  }

  if (route.name === 'gasto') {
    void pintarGasto(route.id)
    return
  }

  if (route.name === 'gasto-nuevo') {
    void pintarFormularioGasto()
    return
  }

  turnos.nuevo()
  app.innerHTML = `<h1>${nombres[route.name]}</h1>`
}

window.addEventListener('hashchange', render)
render()
