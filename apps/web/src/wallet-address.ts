/** El formulario admite payment pointers; el SDK recibe siempre una URL HTTPS. */
export function walletAddressUrl(input: string): string {
  const raw = input.trim()
  const url = new URL(raw.startsWith('$') ? `https://${raw.slice(1)}` : raw)
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error('La dirección debe ser HTTPS, sin credenciales, parámetros ni fragmentos.')
  }
  return url.href
}
