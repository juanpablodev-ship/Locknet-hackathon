export type Tema = 'light' | 'dark'

export interface AlmacenTema {
  getItem(clave: string): string | null
  setItem(clave: string, valor: string): void
}

const CLAVE_TEMA = 'locknet-tema'

function almacenPorDefecto(): AlmacenTema | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

export function siguienteTema(actual: Tema): Tema {
  return actual === 'dark' ? 'light' : 'dark'
}

export function leerTemaGuardado(almacen: AlmacenTema | undefined = almacenPorDefecto()): Tema | null {
  try {
    const valor = almacen?.getItem(CLAVE_TEMA)
    return valor === 'light' || valor === 'dark' ? valor : null
  } catch {
    return null
  }
}

export function guardarTema(tema: Tema, almacen: AlmacenTema | undefined = almacenPorDefecto()): void {
  try {
    almacen?.setItem(CLAVE_TEMA, tema)
  } catch {
    // Sin almacenamiento disponible (modo privado, cuota llena, etc.): seguimos funcionando.
  }
}
