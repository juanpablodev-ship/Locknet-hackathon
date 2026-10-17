import { escapeHtml } from './inicio.js'

export interface CuentaConocida {
  name: string
  walletAddress: string
}

export function distanciaEdicion(a: string, b: string): number {
  let corta = a
  let larga = b
  if (corta.length > larga.length) [corta, larga] = [larga, corta]

  let anterior = Array.from({ length: corta.length + 1 }, (_, index) => index)
  for (let fila = 1; fila <= larga.length; fila += 1) {
    const actual = [fila]
    for (let columna = 1; columna <= corta.length; columna += 1) {
      const costo = larga[fila - 1] === corta[columna - 1] ? 0 : 1
      actual[columna] = Math.min(
        actual[columna - 1] + 1,
        anterior[columna] + 1,
        anterior[columna - 1] + costo,
      )
    }
    anterior = actual
  }
  return anterior[corta.length]
}

export function cuentaMasParecida(
  conocidas: CuentaConocida[],
  nueva: string,
): CuentaConocida | undefined {
  let masCercana: CuentaConocida | undefined
  let distancia = Number.POSITIVE_INFINITY
  for (const cuenta of conocidas) {
    const actual = distanciaEdicion(cuenta.walletAddress, nueva)
    if (actual < distancia) {
      masCercana = cuenta
      distancia = actual
    }
  }

  if (!masCercana) return undefined
  const longitud = Math.max(masCercana.walletAddress.length, nueva.length)
  return distancia <= Math.max(1, Math.floor(longitud * 0.1)) ? masCercana : undefined
}

function marcar(texto: string): string {
  return texto ? `<mark>${escapeHtml(texto)}</mark>` : ''
}

export function resaltarDiferencias(
  conocida: string,
  nueva: string,
): { conocidaHtml: string; nuevaHtml: string } {
  if (conocida.length === nueva.length) {
    let conocidaHtml = ''
    let nuevaHtml = ''
    for (let index = 0; index < conocida.length; index += 1) {
      if (conocida[index] === nueva[index]) {
        conocidaHtml += escapeHtml(conocida[index])
        nuevaHtml += escapeHtml(nueva[index])
      } else {
        conocidaHtml += marcar(conocida[index])
        nuevaHtml += marcar(nueva[index])
      }
    }
    return { conocidaHtml, nuevaHtml }
  }

  let prefijo = 0
  while (
    prefijo < conocida.length &&
    prefijo < nueva.length &&
    conocida[prefijo] === nueva[prefijo]
  ) {
    prefijo += 1
  }

  let sufijo = 0
  while (
    sufijo < conocida.length - prefijo &&
    sufijo < nueva.length - prefijo &&
    conocida[conocida.length - 1 - sufijo] === nueva[nueva.length - 1 - sufijo]
  ) {
    sufijo += 1
  }

  const conocidaFin = conocida.length - sufijo
  const nuevaFin = nueva.length - sufijo
  return {
    conocidaHtml:
      escapeHtml(conocida.slice(0, prefijo)) +
      marcar(conocida.slice(prefijo, conocidaFin)) +
      escapeHtml(conocida.slice(conocidaFin)),
    nuevaHtml:
      escapeHtml(nueva.slice(0, prefijo)) +
      marcar(nueva.slice(prefijo, nuevaFin)) +
      escapeHtml(nueva.slice(nuevaFin)),
  }
}
