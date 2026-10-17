import type { JoinSetup, Member, SharedWallet, Spend, Verdict } from '../../../contracts/index.js'
import { parseHash, type Route } from './router.js'
import {
  MODO,
  type ApiModeInfo,
  castApproval,
  createWallet,
  crearTurnos,
  executeSpend,
  finishJoin,
  getApiMode, getPaymentBlocker,
  getJoinSetup, cancelJoin, getSession, recheckSpend, revokeMember, refreshCapacity,
  getSpend,
  getWallet,
  getWallets,
  getSpends,
  onEvents,
  playEscenario1,
  playEscenario3,
  requestSpend,
  resetDemo,
  resetMock,
  retryShare,
  setFalloAporte,
  setHashInvalido,
  startJoin
} from './api.js'
import { escapeHtml, renderInicio } from './inicio.js'
import { renderGasto } from './gasto.js'
import { renderCrearGrupo, renderVistaPreviaContrato, validarGrupo, VALORES_INICIALES, type CampoGrupo, type ValoresGrupo } from './crear-grupo.js'
import { previewReparto, renderGastoNuevo } from './gasto-nuevo.js'
import { renderHistorial } from './historial.js'
import { renderPorAprobar } from './por-aprobar.js'
import { DEMO_MODE } from './config.js'
import { renderAppChrome } from './navegacion.js'
import { qrComoSvg, renderUnirse, renderVueltaUnirse } from './unirse.js'
import { getWalletActual, setWalletActual } from './wallet-actual.js'
import { guardarTema, leerTemaGuardado, siguienteTema, type Tema } from './tema.js'
import { moneyFromMajor } from './money-input.js'
import './styles.css'

const nombres: Record<Route['name'], string> = {
  inicio: 'inicio',
  unirse: 'unirse',
  'crear-grupo': 'crear-grupo',
  'unirse-volver': 'unirse-volver',
  'gasto-nuevo': 'gasto-nuevo',
  gasto: 'gasto',
  'por-aprobar': 'por-aprobar',
  historial: 'historial',
  'no-encontrada': 'Pantalla no encontrada'
}

let desuscribir: (() => void) | null = null
let desuscribirChrome: (() => void) | null = null
let votaComoActual: string | undefined
let redireccionUnirsePendiente: string | null = null
let hashInvalidoActual = false
let joinSetup: JoinSetup | undefined
// Id del grupo recién creado en este navegador: la invitación muestra el aviso mientras se siga en ella.
let grupoRecienCreado: string | null = null
let ownedIds: string[] = []
let modoServidor: ApiModeInfo | null = null
let errorModoServidor: string | null = null
const mensajesConsulta = new Map<string, string>()
const consultasEnCurso = new Set<string>()
const turnos = crearTurnos()

function temaPreferidoDelSistema(): Tema {
  try {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

// Se aplica ANTES del primer render (abajo, fuera de cualquier función) para que no parpadee.
let temaActual: Tema = leerTemaGuardado() ?? temaPreferidoDelSistema()
document.documentElement.setAttribute('data-theme', temaActual)

function alternarTema(): void {
  temaActual = siguienteTema(temaActual)
  document.documentElement.setAttribute('data-theme', temaActual)
  guardarTema(temaActual)
  void pintarChrome(parseHash(location.hash))
}

function navegarA(hash: string): void {
  if (location.hash === hash) render()
  else if (/^https:\/\//.test(hash)) location.assign(hash)
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
  const soloMama = getWalletActual() === 'w-mama'
  return `
    <div class="panel-dev">
      <span>Modo MOCK - datos simulados</span>
      ${soloMama ? '<button type="button" data-accion="escenario1">Escenario 1</button>' : ''}
      <button type="button" data-accion="escenario2">Escenario 2</button>
      ${soloMama ? '<button type="button" data-accion="escenario3">Escenario 3</button>' : ''}
      ${soloMama ? `<label class="interruptor">
        <input type="checkbox" id="falla-madrid" />
        Que falle Madrid
      </label>` : ''}
      <label class="interruptor">
        <input type="checkbox" id="hash-invalido" ${hashInvalidoActual ? 'checked' : ''} />
        Simular hash inválido
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
        const walletId = getWalletActual()
        const wallet = await getWallet(walletId)
        const farmacia = wallet.knownDestinations[0]
        const spend = await requestSpend(walletId, farmacia, { value: '12000000', assetCode: wallet.currency, assetScale: 2 })
        navegarA(`#/gasto/${spend.id}`)
      })()
    } else if (accion === 'escenario3') {
      playEscenario3()
      navegarA('#/gasto/s-ataque')
    }
  })

  const interruptor = document.getElementById('falla-madrid') as HTMLInputElement | null
  interruptor?.addEventListener('change', () => {
    setFalloAporte(interruptor.checked ? 'm-madrid' : null)
  })

  const hashInvalido = document.getElementById('hash-invalido') as HTMLInputElement | null
  hashInvalido?.addEventListener('change', () => {
    hashInvalidoActual = hashInvalido.checked
    setHashInvalido(hashInvalido.checked)
  })
}

async function pintarInicio(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) return
  const miTurno = turnos.nuevo()
  pintarCargando(app)

  let wallet: SharedWallet
  let wallets: SharedWallet[]
  let spends: Spend[]
  try {
    wallets = await getWallets()
    const actual = wallets.find((item) => item.id === getWalletActual())
    if (!actual) throw new Error('Grupo no encontrado')
    wallet = actual
    spends = await getSpends(wallet.id)
  } catch (err) {
    if (!turnos.esVigente(miTurno)) return
    pintarError(app, err, () => void pintarInicio())
    return
  }
  if (!turnos.esVigente(miTurno)) return

  if (MODO === 'live') ownedIds = (await getSession()).memberIds
  if (!turnos.esVigente(miTurno)) return
  const result = new URLSearchParams(location.hash.split('?')[1] ?? '').get('union')
  const message = result === 'ok' ? 'Union confirmada; ya puedes actuar como tu miembro.' : result ? 'No se confirmo la union. No se activo un miembro; vuelve a intentarlo desde Unirse.' : ''
  app.innerHTML = renderInicio(wallet, spends, wallets) + `<p role="status">${escapeHtml(message)}</p><button id="consultar-cupo">Consultar cupos</button>` + (MODO === 'live' ? wallet.members.filter(m => ownedIds.includes(m.id) && m.status === 'active').map(m => `<button data-revoke="${escapeHtml(m.id)}">Revocar mi permiso: ${escapeHtml(m.name)}</button>`).join('') : '') + panelDevHtml()
  document.getElementById('consultar-cupo')?.addEventListener('click', () => { void refreshCapacity(wallet.id).then(() => pintarInicio()).catch(err => pintarError(app, err, () => void pintarInicio())) })
  app.querySelectorAll('[data-revoke]').forEach(button => button.addEventListener('click', () => {
    if (confirm('Revocar explicitamente este permiso en la wallet?')) void revokeMember(wallet.id, (button as HTMLElement).dataset.revoke!).then(() => pintarInicio()).catch(err => pintarError(app, err, () => void pintarInicio()))
  }))
  enlazarPanelDev()
  app.querySelector('.selector-billeteras')?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('[data-wallet-id]') as HTMLElement | null
    const walletId = button?.dataset.walletId
    if (walletId && wallets.some((item) => item.id === walletId)) {
      setWalletActual(walletId)
      render()
    }
  })

  desuscribir = onEvents(wallet.id, (e) => {
    if (e.type === 'spend-updated' || e.type === 'member-active' || e.type === 'member-revoked' || e.type === 'capacity-updated') {
      render()
    }
  })
}

function selectVotanteHtml(activos: Member[]): string {
  if (!activos.length) return `<div class="contenedor votante-barra"><p>Autoriza tu wallet en este navegador para aprobar o gestionar pagos. <a href="#/unirse">Unirse al grupo</a></p></div>`
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
  'spend-updated',
  'spend-reviewed',
  'approval-cast',
  'spend-approved',
  'spend-rejected',
  'spend-approved',
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

  if (MODO === 'live') ownedIds = (await getSession()).memberIds
  if (!turnos.esVigente(miTurno)) return
  const activos = wallet.members.filter((m) => m.status === 'active' && (MODO === 'mock' || ownedIds.includes(m.id)))
  if (!votaComoActual || !activos.some((m) => m.id === votaComoActual)) {
    votaComoActual = activos[0]?.id
  }

  let paymentBlocker: Spend | undefined
  if (MODO === 'live' && spend.status === 'approved') {
    try { paymentBlocker = await getPaymentBlocker(spend) }
    catch (error) { if (turnos.esVigente(miTurno)) pintarError(app, error, () => void pintarGasto(id)); return }
    if (!turnos.esVigente(miTurno)) return
  }
  app.innerHTML = selectVotanteHtml(activos) + renderGasto(spend, wallet, votaComoActual, paymentBlocker) + panelDevHtml()
  const consultaMensaje = mensajesConsulta.get(id)
  if (consultaMensaje) {
    let feedback = app.querySelector<HTMLElement>('#mensaje')
    if (!feedback) {
      feedback = document.createElement('p')
      feedback.id = 'mensaje'
      feedback.setAttribute('role', 'status')
      app.querySelector('.contenedor')?.append(feedback)
    }
    feedback.textContent = consultaMensaje
  }
  const consultar = app.querySelector<HTMLButtonElement>('[data-accion="consultar"]')
  if (consultar && consultasEnCurso.has(id)) { consultar.disabled = true; consultar.textContent = 'Consultando…' }

  document.getElementById('votante')?.addEventListener('change', (ev) => {
    votaComoActual = (ev.target as HTMLSelectElement).value
    void pintarGasto(id)
  })

  const checkboxRiesgo = app.querySelector('#aceptar-riesgo') as HTMLInputElement | null
  const botonAprobarRiesgo = app.querySelector('#aprobar-riesgo') as HTMLButtonElement | null
  checkboxRiesgo?.addEventListener('change', () => {
    if (botonAprobarRiesgo) botonAprobarRiesgo.disabled = !checkboxRiesgo.checked
  })

  app.querySelector('.acciones')?.addEventListener('click', (ev) => {
    const boton = (ev.target as HTMLElement).closest('[data-accion]') as HTMLElement | null
    if (!boton) return
    const accion = boton.dataset.accion
    const spendId = boton.dataset.spend
    if (!spendId) return
    if (accion === 'abrir-confirmacion') {
      const dialogo = app.querySelector('#confirmacion-riesgo') as HTMLDialogElement | null
      dialogo?.showModal()
      return
    }

    void (async () => {
      try {
        if (accion === 'aprobar' || accion === 'rechazar') {
          if (!votaComoActual) return
          await castApproval(spendId, votaComoActual, accion === 'aprobar')
        } else if (accion === 'pagar') {
          await executeSpend(spendId)
        } else if (accion === 'consultar') {
          if (consultasEnCurso.has(spendId)) return
          consultasEnCurso.add(spendId)
          mensajesConsulta.set(spendId, 'Consultando los intentos existentes, sin enviar pagos…')
          const feedback = document.getElementById('mensaje')
          if (feedback) feedback.textContent = mensajesConsulta.get(spendId)!
          ;(boton as HTMLButtonElement).disabled = true
          boton.textContent = 'Consultando…'
          try {
            const updated = await recheckSpend(spendId)
            const pending = updated.shares.some(s => s.status === 'pending')
            mensajesConsulta.set(spendId, updated.status === 'paid'
              ? 'Consulta finalizada: pago verificado. No se enviaron nuevos pagos.'
              : pending
                ? 'Consulta finalizada: sigue habiendo resultados pendientes o desconocidos. No se enviaron nuevos pagos.'
                : 'Consulta finalizada: el gasto sigue incompleto. No se enviaron nuevos pagos.')
          } catch (error) {
            mensajesConsulta.set(spendId, error instanceof Error ? error.message : 'No se pudo consultar. No se enviaron nuevos pagos.')
          } finally { consultasEnCurso.delete(spendId) }
          if (parseHash(location.hash).name === 'gasto' && location.hash.endsWith('/' + spendId)) await pintarGasto(spendId)
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
    if (e.type === 'capacity-updated' || (e.type === 'spend-updated' && !e.spendId) || (EVENTOS_GASTO.has(e.type) && e.spendId === id)) {
      render()
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
    wallet = await getWallet(getWalletActual())
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
      if (mensaje) mensaje.textContent = `Escribe un monto mayor que cero en ${wallet.currency} y sin decimales.`
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
        const spend = await requestSpend(wallet.id, { name: nombre, walletAddress }, {
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

interface ValoresUnirse {
  nombre: string
  direccion: string
  tope: string
  interval?: string
}

function leerValoresUnirse(): ValoresUnirse {
  return {
    nombre: (document.getElementById('nombre-miembro') as HTMLInputElement | null)?.value ?? '',
    direccion: (document.getElementById('direccion-miembro') as HTMLInputElement | null)?.value ?? '',
    tope: (document.getElementById('tope-miembro') as HTMLInputElement | null)?.value ?? '',
    interval: (document.getElementById('intervalo-miembro') as HTMLInputElement | null)?.value,
  }
}

function pintarFormularioUnirse(
  wallet: SharedWallet,
  qrSvg: string,
  warning?: Verdict,
  values: ValoresUnirse = { nombre: '', direccion: '', tope: '100000' },
): void {
  const app = document.getElementById('app')
  if (!app) return

  app.innerHTML = renderUnirse(wallet, qrSvg, warning, joinSetup, grupoRecienCreado === wallet.id) + panelDevHtml()
  const form = document.getElementById('form-unirse') as HTMLFormElement | null
  const nombre = document.getElementById('nombre-miembro') as HTMLInputElement | null
  const direccion = document.getElementById('direccion-miembro') as HTMLInputElement | null
  const tope = document.getElementById('tope-miembro') as HTMLInputElement | null
  if (nombre) nombre.value = values.nombre
  if (direccion) direccion.value = values.direccion
  if (values.interval) (document.getElementById('intervalo-miembro') as HTMLInputElement).value = values.interval
  if (tope) tope.value = values.tope
  const updateWallet = () => {
    const m = joinSetup?.members.find(m => m.walletAddress === direccion?.value.trim())
    const label = document.getElementById('moneda-tope'); if (label) label.textContent = m ? `${m.assetCode}, escala ${m.assetScale}` : wallet.currency
  }
  direccion?.addEventListener('input', updateWallet)
  document.getElementById('wallet-configurada')?.addEventListener('change', event => {
    const m = joinSetup?.members.find(m => m.walletAddress === (event.target as HTMLSelectElement).value)
    if (m && direccion && nombre && tope) { direccion.value = m.walletAddress; nombre.value = m.name; tope.value = m.assetCode === 'EUR' ? '22' : '100000'; updateWallet() }
  })
  updateWallet()
  document.getElementById('cancelar-union')?.addEventListener('click', () => {
    void cancelJoin().then(() => {
      const status = document.getElementById('mensaje')
      if (status) status.textContent = 'Interacción local descartada. Puedes iniciar una nueva; los permisos externos no se revocaron.'
    }).catch(error => {
      const status = document.getElementById('mensaje')
      if (status) status.textContent = error instanceof Error ? error.message : 'No se pudo descartar la interacción local.'
    })
  })

  form?.addEventListener('submit', (event) => {
    event.preventDefault()
    const mensaje = document.getElementById('mensaje')
    const publicWallet = joinSetup?.members.find(m => m.walletAddress === direccion?.value.trim())
    let cap: Member['cap']
    try {
      if (MODO === 'live' && !publicWallet) throw new Error('Selecciona una wallet de la configuracion local verificada.')
      cap = moneyFromMajor(tope?.value.trim() ?? '', publicWallet?.assetCode ?? wallet.currency, publicWallet?.assetScale ?? 2)
    } catch (error) { if (mensaje) mensaje.textContent = error instanceof Error ? error.message : 'Monto invalido'; return }

    const memberName = nombre?.value.trim() ?? ''
    const walletAddress = direccion?.value.trim() ?? ''
    if (!memberName || !walletAddress) {
      if (mensaje) mensaje.textContent = 'Escribe tu nombre y la dirección de tu billetera.'
      return
    }

    const miTurno = turnos.nuevo()
    const submitted = { nombre: memberName, direccion: walletAddress, tope: tope?.value ?? '', interval: (document.getElementById('intervalo-miembro') as HTMLInputElement).value.trim() }
    void (async () => {
      try {
        const interval = (document.getElementById('intervalo-miembro') as HTMLInputElement).value.trim()
        const join = await startJoin(wallet.id, {
          name: memberName,
          walletAddress,
          assetCode: cap.assetCode,
          cap,
          ...(interval ? { interval } : {}),
        })
        if (!turnos.esVigente(miTurno)) return

        if (join.grantWarning.status === 'warn') {
          redireccionUnirsePendiente = join.redirectUrl
          pintarFormularioUnirse(wallet, qrSvg, join.grantWarning, submitted)
        } else {
          redireccionUnirsePendiente = join.redirectUrl
          navegarA(join.redirectUrl)
        }
      } catch (err) {
        if (!turnos.esVigente(miTurno) || !mensaje) return
        if (err instanceof Error && err.message === 'Unirse todavía no está conectado a la API') {
          mensaje.textContent = 'Pendiente de conectar'
          mensaje.className = 'estado estado-ambar'
        } else {
          mensaje.textContent = err instanceof Error ? err.message : 'No se pudo iniciar el proceso para unirse.'
          mensaje.className = ''
        }
      }
    })()
  })

  document.querySelector('.advertencia-unirse')?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('[data-accion]') as HTMLElement | null
    const action = button?.dataset.accion
    if (action === 'confirmar-unirse' && redireccionUnirsePendiente) {
      navegarA(redireccionUnirsePendiente)
    } else if (action === 'cancelar-unirse') {
      redireccionUnirsePendiente = null
      void cancelJoin().then(() => pintarFormularioUnirse(wallet, qrSvg, undefined, leerValoresUnirse()))
      return
    }
  })
  enlazarPanelDev()
}

function leerValoresCrearGrupo(form: HTMLFormElement): ValoresGrupo {
  const campo = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? ''
  return {
    nombre: campo('nombre'), moneda: campo('moneda'), destinoNombre: campo('destinoNombre'),
    destinoDireccion: campo('destinoDireccion'), monto: campo('monto'),
    aprobaciones: campo('aprobaciones'), riesgo: campo('riesgo'),
  }
}

function mostrarErroresCrearGrupo(errores: Partial<Record<CampoGrupo, string>>): void {
  for (const campo of Object.keys(VALORES_INICIALES) as CampoGrupo[]) {
    const el = document.getElementById(`error-${campo}`)
    if (!el) continue
    el.textContent = errores[campo] ?? ''
    el.hidden = !errores[campo]
  }
  if (errores.riesgo) document.querySelector<HTMLDetailsElement>('.avanzado-grupo')?.setAttribute('open', '')
}

function pintarCrearGrupo(): void {
  const app = document.getElementById('app')
  if (!app) return
  turnos.nuevo()
  app.innerHTML = renderCrearGrupo()
  const form = document.getElementById('form-crear-grupo') as HTMLFormElement | null
  if (!form) return
  const mensaje = document.getElementById('mensaje')
  form.addEventListener('input', () => {
    const vista = document.getElementById('vista-contrato')
    if (vista) vista.innerHTML = renderVistaPreviaContrato(leerValoresCrearGrupo(form))
  })
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const { errores, body } = validarGrupo(leerValoresCrearGrupo(form))
    mostrarErroresCrearGrupo(errores)
    if (!body) { if (mensaje) mensaje.textContent = ''; return }
    const boton = form.querySelector<HTMLButtonElement>('button[type="submit"]')
    if (boton) boton.disabled = true
    void createWallet(body).then((grupo) => {
      setWalletActual(grupo.id)
      grupoRecienCreado = grupo.id
      navegarA('#/unirse')
    }).catch((err) => {
      if (mensaje) mensaje.textContent = err instanceof Error ? err.message : 'No se pudo crear el grupo.'
      if (boton) boton.disabled = false
    })
  })
}

async function pintarUnirse(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) return
  const miTurno = turnos.nuevo()
  pintarCargando(app)

  try {
    const wallet = await getWallet(getWalletActual())
    joinSetup = await getJoinSetup()
    if (!turnos.esVigente(miTurno)) return
    const qrSvg = await qrComoSvg(`${location.origin}${location.pathname}#/unirse`)
    if (!turnos.esVigente(miTurno)) return
    pintarFormularioUnirse(wallet, qrSvg)
  } catch (err) {
    if (!turnos.esVigente(miTurno)) return
    pintarError(app, err, () => void pintarUnirse())
  }
}

async function pintarHistorial(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) return
  const miTurno = turnos.nuevo()
  pintarCargando(app)

  try {
    const walletId = getWalletActual()
    const [wallet, spends] = await Promise.all([getWallet(walletId), getSpends(walletId)])
    if (!turnos.esVigente(miTurno)) return
    app.innerHTML = renderHistorial(spends, wallet) + panelDevHtml()
    enlazarPanelDev()
  } catch (err) {
    if (!turnos.esVigente(miTurno)) return
    pintarError(app, err, () => void pintarHistorial())
  }
}

async function pintarPorAprobar(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) return
  const miTurno = turnos.nuevo()
  pintarCargando(app)

  let wallet: SharedWallet
  let spends: Spend[]
  try {
    const walletId = getWalletActual()
    const resultado = await Promise.all([getWallet(walletId), getSpends(walletId)])
    wallet = resultado[0]
    spends = resultado[1]
  } catch (err) {
    if (!turnos.esVigente(miTurno)) return
    pintarError(app, err, () => void pintarPorAprobar())
    return
  }
  if (!turnos.esVigente(miTurno)) return

  app.innerHTML = renderPorAprobar(spends, wallet) + panelDevHtml()
  enlazarPanelDev()

  desuscribir = onEvents(wallet.id, () => void pintarPorAprobar())
}

async function pintarVueltaUnirse(route: Extract<Route, { name: 'unirse-volver' }>): Promise<void> {
  const app = document.getElementById('app')
  if (!app) return
  if (route.ok === undefined) {
    app.innerHTML = renderVueltaUnirse(false)
    return
  }

  const miTurno = turnos.nuevo()
  pintarCargando(app)
  try {
    const resultado = await finishJoin({ ok: route.ok, memberId: route.memberId ?? '' })
    if (!turnos.esVigente(miTurno)) return
    app.innerHTML = renderVueltaUnirse(!('check' in resultado))
    redireccionUnirsePendiente = null
  } catch (err) {
    if (!turnos.esVigente(miTurno)) return
    if (err instanceof Error && err.message === 'Unirse todavía no está conectado a la API') {
      app.innerHTML = `
        <div class="contenedor">
          <p id="mensaje" class="estado estado-ambar" role="status">Pendiente de conectar</p>
          <a class="boton" href="#/unirse">Volver</a>
        </div>
      `
    } else {
      pintarError(app, err, () => void pintarVueltaUnirse(route))
    }
  }
}

const EVENTOS_CHROME = new Set([
  'member-active',
  'member-revoked',
  'spend-requested',
  'spend-updated',
  'spend-reviewed',
  'spend-approved',
  'spend-rejected',
  'spend-blocked'
])

async function pintarChrome(route: Route): Promise<void> {
  let shell = document.getElementById('app-shell')
  if (!shell) {
    shell = document.createElement('header')
    shell.id = 'app-shell'
    const app = document.getElementById('app')
    if (!app) return
    document.body.insertBefore(shell, app)
  }
  const mode = MODO === 'mock' ? 'fixtures' : modoServidor?.mode ?? DEMO_MODE

  let nombreBilletera = ''
  let numeroMiembros = 0
  let contadorPorAprobar = 0
  let walletId = ''
  try {
    walletId = getWalletActual()
    const [wallet, spends] = await Promise.all([getWallet(walletId), getSpends(walletId)])
    nombreBilletera = wallet.name
    numeroMiembros = wallet.members.length
    contadorPorAprobar = spends.filter((spend) => spend.status === 'awaiting-approval').length
  } catch {
    // El cuerpo de la pantalla ya muestra el error de carga; el encabezado se degrada sin romperse.
  }

  shell.className = `app-shell${mode === 'fixtures' ? ' app-shell-fixtures' : ''}`
  shell.innerHTML = (MODO === 'live' && mode !== 'fixtures' ? `<p class="banda-live" role="status">${modoServidor ? 'Modo LIVE - Test Wallet. Las acciones pueden mover dinero de prueba.' : 'Comprobando modo del servidor...'}</p>` : '') + renderAppChrome({
    route,
    mode,
    label: MODO === 'mock' ? 'Modo MOCK — datos y pagos simulados, sin backend' : modoServidor?.label,
    error: errorModoServidor ?? undefined,
    nombreBilletera,
    numeroMiembros,
    tema: temaActual,
    contadorPorAprobar
  })
  document.body.dataset.demoMode = mode

  shell.onclick = (event) => {
    const reiniciar = (event.target as HTMLElement).closest('[data-accion="reiniciar-demo"]') as HTMLButtonElement | null
    if (reiniciar) void reiniciarDemo(reiniciar)
    const tema = (event.target as HTMLElement).closest('[data-accion="alternar-tema"]')
    if (tema) alternarTema()
  }

  desuscribirChrome?.()
  if (walletId) {
    desuscribirChrome = onEvents(walletId, (e) => {
      if (EVENTOS_CHROME.has(e.type)) void pintarChrome(route)
    })
  }
}

async function reiniciarDemo(boton: HTMLButtonElement): Promise<void> {
  if (MODO === 'live' && !confirm('Esto elimina estado LOCAL y sesiones. NO revoca permisos externos. No lo hagas con resultados desconocidos. Continuar?')) return
  boton.disabled = true
  try {
    if (MODO === 'mock') {
      resetMock()
      hashInvalidoActual = false
      navegarA('#/inicio')
      return
    }

    const resultado = await resetDemo()
    const wallets = await getWallets()
    if (wallets.length === 0) throw new Error('No hay grupos disponibles después del reinicio.')
    if (!wallets.some((wallet) => wallet.id === getWalletActual())) {
      setWalletActual(wallets[0].id)
    }
    modoServidor = { mode: resultado.mode, label: resultado.label }
    errorModoServidor = null
    hashInvalidoActual = false
    navegarA('#/inicio')
  } catch (err) {
    mostrarErrorModo(err)
  } finally {
    if (boton.isConnected) boton.disabled = false
  }
}

function mostrarErrorModo(err: unknown): void {
  const texto = err instanceof Error ? err.message : 'Ocurrió un error inesperado.'
  errorModoServidor = texto
  void pintarChrome(parseHash(location.hash))
}

async function cargarModoServidor(): Promise<void> {
  try {
    modoServidor = await getApiMode()
    errorModoServidor = null
  } catch (err) {
    mostrarErrorModo(err)
    return
  }
  void pintarChrome(parseHash(location.hash))
}

function render(): void {
  desuscribir?.()
  desuscribir = null

  const app = document.getElementById('app')
  if (!app) return
  const route = parseHash(location.hash)
  if (route.name !== 'unirse' && route.name !== 'unirse-volver') grupoRecienCreado = null
  void pintarChrome(route)

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

  if (route.name === 'crear-grupo') {
    pintarCrearGrupo()
    return
  }

  if (route.name === 'unirse') {
    void pintarUnirse()
    return
  }

  if (route.name === 'unirse-volver') {
    void pintarVueltaUnirse(route)
    return
  }

  if (route.name === 'por-aprobar') {
    void pintarPorAprobar()
    return
  }

  if (route.name === 'historial') {
    void pintarHistorial()
    return
  }

  turnos.nuevo()
  app.innerHTML = `<h1>${nombres[route.name]}</h1>`
}

window.addEventListener('hashchange', render)
render()
if (MODO === 'live') void cargarModoServidor()
