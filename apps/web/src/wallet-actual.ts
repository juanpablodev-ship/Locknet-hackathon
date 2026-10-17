let actualId = 'w-mama'

export function getWalletActual(): string {
  return actualId
}

export function setWalletActual(id: string): void {
  if (!id) throw new Error('Selecciona un grupo')
  actualId = id
}
