import { describe, expect, it } from 'vitest'
import { cuidadoDeMama, destinoParecido } from '../../../contracts/ejemplo.js'
import { LOOKALIKE_POINTS, NEW_DESTINATION_POINTS, checkDestination } from '../src/destination.js'

const known = cuidadoDeMama.knownDestinations
const farmacia = known[0]

describe('checkDestination', () => {
  it('sin https → block 100', () => {
    const v = checkDestination({ walletAddress: 'http://ilp.interledger-test.dev/farmacia-medellin', known })
    expect(v).toMatchObject({
      check: 'destination', status: 'block', riskPoints: 100,
      userMessage: 'Este destino no usa una conexión segura. Gasto bloqueado.',
    })
  })

  it('https no bloquea', () => {
    expect(checkDestination({ walletAddress: farmacia.walletAddress, known }).status).not.toBe('block')
  })

  it('destino conocido → pass 0', () => {
    const v = checkDestination({ walletAddress: farmacia.walletAddress, known })
    expect(v).toMatchObject({ status: 'pass', riskPoints: 0, userMessage: 'Destino conocido: Farmacia Medellín.' })
  })

  it('coincidencia exacta gana aunque otro conocido se parezca', () => {
    const lista = [
      { name: 'Parecida', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medel1in' },
      farmacia,
    ]
    expect(checkDestination({ walletAddress: farmacia.walletAddress, known: lista }).status).toBe('pass')
  })

  it('farmacia-medel1in contra la lista de ejemplo.ts → warn 94 con el veredicto esperado', () => {
    const v = checkDestination({ walletAddress: 'https://ilp.interledger-test.dev/farmacia-medel1in', known })
    expect(v.status).toBe(destinoParecido.status)
    expect(v.riskPoints).toBe(destinoParecido.riskPoints)
    expect(v.riskPoints).toBe(LOOKALIKE_POINTS)
    expect(v.userMessage).toBe('Esta cuenta se parece a la de Farmacia Medellín, pero no es la misma.')
    expect(v.reasons).toEqual(['farmacia-medel1in ≈ farmacia-medellin (iguales tras normalizar)'])
  })

  it('mismo nombre en otro servidor → warn 94 y lo dice en reasons', () => {
    const v = checkDestination({ walletAddress: 'https://otro-banco.dev/farmacia-medellin', known })
    expect(v.status).toBe('warn')
    expect(v.reasons).toEqual(['mismo nombre en otro servidor: otro-banco.dev vs ilp.interledger-test.dev'])
  })

  it('destino nuevo → warn 20', () => {
    const v = checkDestination({ walletAddress: 'https://ilp.interledger-test.dev/panaderia-centro', known })
    expect(v).toMatchObject({
      status: 'warn', riskPoints: NEW_DESTINATION_POINTS,
      userMessage: 'Es la primera vez que el grupo le paga a este destino.',
    })
  })

  it('known vacío → warn 20', () => {
    const v = checkDestination({ walletAddress: 'https://ilp.interledger-test.dev/farmacia-medellin', known: [] })
    expect(v).toMatchObject({ status: 'warn', riskPoints: 20 })
  })
})
