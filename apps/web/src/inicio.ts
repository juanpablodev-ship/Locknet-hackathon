import type { Member, SharedWallet } from '../../../contracts/index.js'
import { flagFor, formatMoney } from './format.js'

export function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function estadoDe(status: Member['status']): { texto: string; tono: 'verde' | 'ambar' | 'rojo' } {
  if (status === 'active') return { texto: 'Activo', tono: 'verde' }
  if (status === 'pending-approval') return { texto: 'Pendiente', tono: 'ambar' }
  if (status === 'revoked') return { texto: 'Revocado', tono: 'rojo' }
  return { texto: 'Vencido', tono: 'rojo' }
}

function renderMiembro(m: Member): string {
  const estado = estadoDe(m.status)
  const disponible = m.available ? formatMoney(m.available) : '—'
  return `
    <article class="miembro">
      <p class="miembro-nombre">${flagFor(m.assetCode)} ${escapeHtml(m.name)}</p>
      <p>Tope: ${formatMoney(m.cap)} al mes</p>
      <p>Disponible: ${disponible}</p>
      <p class="estado estado-${estado.tono}">${estado.texto}</p>
    </article>
  `
}

export function renderInicio(w: SharedWallet): string {
  const miembros = w.members.map(renderMiembro).join('')
  return `
    <div class="contenedor">
      <p class="etiqueta">Cupo autorizado este mes</p>
      <p class="cupo">${formatMoney(w.authorizedCapacity)}</p>
      <p>Nadie depositó nada. Cada uno autorizó un tope desde su banco.</p>
      <div class="miembros">${miembros}</div>
      <div class="acciones">
        <a class="boton" href="#/gasto/nuevo">Pedir un gasto</a>
        <a class="boton" href="#/unirse">Invitar a alguien</a>
      </div>
    </div>
  `
}
