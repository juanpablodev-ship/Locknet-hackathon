import { parseHash, type Route } from './router.js'
import { getWallet } from './api.js'
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

function render(): void {
  const app = document.getElementById('app')
  if (!app) return
  const route = parseHash(location.hash)

  if (route.name === 'inicio') {
    app.innerHTML = renderInicio(getWallet('w-mama'))
    return
  }

  app.innerHTML = `<h1>${nombres[route.name]}</h1>`
}

window.addEventListener('hashchange', render)
render()
