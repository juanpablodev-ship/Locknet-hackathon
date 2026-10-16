import { parseHash, type Route } from './router.js'
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
  app.innerHTML = `<h1>${nombres[route.name]}</h1>`
}

window.addEventListener('hashchange', render)
render()
