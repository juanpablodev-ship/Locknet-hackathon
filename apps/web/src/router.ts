export type Route =
  | { name: 'inicio' }
  | { name: 'unirse'; grupo?: string }
  | { name: 'crear-grupo' }
  | { name: 'unirse-volver'; ok?: boolean; memberId?: string }
  | { name: 'gasto-nuevo' }
  | { name: 'gasto'; id: string }
  | { name: 'por-aprobar' }
  | { name: 'historial' }
  | { name: 'no-encontrada' }

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?', 2)
  const parts = path.split('/').filter((p) => p.length > 0)

  if (parts.length === 0) return { name: 'inicio' }
  if (parts.length === 1 && parts[0] === 'inicio') return { name: 'inicio' }
  if (parts.length === 1 && parts[0] === 'unirse') {
    const grupo = new URLSearchParams(query).get('grupo')
    return grupo ? { name: 'unirse', grupo } : { name: 'unirse' }
  }
  if (parts.length === 2 && parts[0] === 'unirse' && parts[1] === 'volver') {
    if (!query) return { name: 'unirse-volver' }
    const params = new URLSearchParams(query)
    return {
      name: 'unirse-volver',
      ok: params.get('ok') === '1',
      ...(params.has('miembro') ? { memberId: params.get('miembro') ?? undefined } : {}),
    }
  }
  if (parts.length === 1 && parts[0] === 'crear-grupo') return { name: 'crear-grupo' }
  if (parts.length === 1 && parts[0] === 'por-aprobar') return { name: 'por-aprobar' }
  if (parts.length === 1 && parts[0] === 'historial') return { name: 'historial' }
  if (parts.length === 1 && parts[0] === 'gasto-nuevo') return { name: 'gasto-nuevo' }
  if (parts.length === 2 && parts[0] === 'gasto' && parts[1] === 'nuevo') return { name: 'gasto-nuevo' }
  if (parts.length === 2 && parts[0] === 'gasto') return { name: 'gasto', id: parts[1] }

  return { name: 'no-encontrada' }
}
