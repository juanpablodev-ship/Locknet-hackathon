// Entrada aislada: no cambia .env ni los procesos anteriores del equipo.
process.env.PORT = process.env.INTEGRATION_API_PORT ?? '3100'
process.env.HOST = '127.0.0.1'
try {
  const origin = new URL(process.env.INTEGRATION_ORIGIN ?? 'http://localhost:5180')
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
      !(origin.protocol === 'https:' || (origin.protocol === 'http:' && origin.hostname === 'localhost'))) throw new Error('Invalid origin')
  process.env.WEB_URL = origin.origin
} catch { console.error('INTEGRATION_ORIGIN debe ser un origen HTTPS o http://localhost, sin ruta, credenciales ni parámetros.'); process.exit(1) }
process.env.PUBLIC_API_URL = process.env.WEB_URL
process.env.DEMO_MODE = process.env.INTEGRATION_MODE ?? 'live'
process.env.COBROS = 'por-miembro' // flujo familiar: recepción atribuible a cada aporte
void import('./main.js')
