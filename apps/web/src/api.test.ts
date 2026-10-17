import { describe, expect, it } from 'vitest'
import {
  castApproval,
  createWallet,
  crearTurnos,
  finishJoin,
  getSpend,
  getWallet,
  requestSpend,
  resetMock,
  startJoin,
} from './api.js'

describe('api.ts en modo simulado', () => {
  it('getWallet devuelve una Promise con la billetera', async () => {
    const promesa = getWallet('w-mama')
    expect(promesa).toBeInstanceOf(Promise)

    const wallet = await promesa
    expect(wallet.id).toBe('w-mama')
  })

  it('getWallet("nada") se rechaza con "Grupo no encontrado"', async () => {
    await expect(getWallet('nada')).rejects.toThrow('Grupo no encontrado')
  })

  it('getSpend encuentra gastos de billeteras distintas de w-mama', async () => {
    resetMock()
    const gasto = await requestSpend('w-parque', {
      name: 'Contratista del parque',
      walletAddress: 'https://ilp.interledger-test.dev/contratista-parque',
    }, { value: '5000000', assetCode: 'COP', assetScale: 2 })

    await expect(getSpend(gasto.id)).resolves.toMatchObject({ walletId: 'w-parque' })
    resetMock()
  })

  it('castApproval con voto doble se rechaza con "Ya votó"', async () => {
    resetMock()
    const farmacia = { name: 'Farmacia Medellín', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medellin' }
    const monto250 = { value: '25000000', assetCode: 'COP', assetScale: 2 }

    const spend = await requestSpend('w-mama', farmacia, monto250)
    await castApproval(spend.id, 'm-bogota', true)

    await expect(castApproval(spend.id, 'm-bogota', true)).rejects.toThrow('Ya votó')
    resetMock()
  })

  it('startJoin y finishJoin devuelven promesas en modo simulado', async () => {
    resetMock()
    const resultado = await startJoin('w-mama', {
      name: 'Persona nueva',
      walletAddress: 'https://ilp.interledger-test.dev/persona-nueva',
      assetCode: 'COP',
      cap: { value: '5000000', assetCode: 'COP', assetScale: 2 },
      interval: 'R12/2026-10-16T00:00:00Z/P1M',
    })
    const memberId = new URLSearchParams(resultado.redirectUrl.split('?')[1]).get('miembro')

    expect(resultado.grantWarning.status).toBe('pass')
    expect(memberId).not.toBeNull()
    await expect(finishJoin({ ok: true, memberId: memberId! })).resolves.toMatchObject({ status: 'active' })
    resetMock()
  })

  it('finishJoin con confirmación inválida resuelve un Verdict de bloqueo', async () => {
    await expect(finishJoin({ ok: false, memberId: '' })).resolves.toMatchObject({
      check: 'consent-hash',
      status: 'block',
    })
  })
})

describe('crearTurnos', () => {
  it('solo el último turno pedido queda vigente', () => {
    const turnos = crearTurnos()
    const t1 = turnos.nuevo()
    const t2 = turnos.nuevo()

    expect(turnos.esVigente(t1)).toBe(false)
    expect(turnos.esVigente(t2)).toBe(true)
  })

  it('un turno recién pedido está vigente hasta que se pida otro', () => {
    const turnos = crearTurnos()
    const t1 = turnos.nuevo()

    expect(turnos.esVigente(t1)).toBe(true)
  })

  it('cada instancia de crearTurnos lleva su propio contador', () => {
    const a = crearTurnos()
    const b = crearTurnos()

    const t1 = a.nuevo()
    const t2 = b.nuevo()

    expect(a.esVigente(t1)).toBe(true)
    expect(b.esVigente(t2)).toBe(true)
  })

  it('createWallet crea el grupo en el simulado y getWallet lo encuentra', async () => {
    resetMock()
    const grupo = await createWallet({
      name: 'Medicinas de mamá', currency: 'COP', approvalsRequired: 2,
      aboveAmount: { value: '20000000', assetCode: 'COP', assetScale: 2 },
      knownDestinations: [{ name: 'Farmacia Medellín', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medellin' }],
    })
    expect((await getWallet(grupo.id)).name).toBe('Medicinas de mamá')
    resetMock()
  })

  it('createWallet rechaza un cuerpo inválido con el mensaje del simulado', async () => {
    await expect(createWallet({
      name: '', currency: 'COP', approvalsRequired: 2,
      aboveAmount: { value: '20000000', assetCode: 'COP', assetScale: 2 }, knownDestinations: [],
    })).rejects.toThrow('El nombre debe tener')
  })
})
