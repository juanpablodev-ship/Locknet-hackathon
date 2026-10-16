import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WalletEvent } from '../contracts/index.js'
import { cuidadoDeMama } from '../contracts/ejemplo.js'
import {
  _testEmitir,
  _testProgramar,
  castApproval,
  executeSpend,
  finishJoin,
  getSpends,
  getWallet,
  getWallets,
  onEvents,
  playEscenario1,
  playEscenario3,
  requestSpend,
  resetMock,
  retryShare,
  setFalloAporte,
  setHashInvalido,
  startJoin,
} from './api.mock.js'

describe('getWallets', () => {
  it('devuelve las tres billeteras con sus kinds', () => {
    const wallets = getWallets()
    expect(wallets).toHaveLength(3)
    expect(wallets.map((w) => w.kind).sort()).toEqual(['care', 'goal', 'investment'])
  })

  it('tiene ids únicos', () => {
    const ids = getWallets().map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('getWallet', () => {
  it('w-mama tiene authorizedCapacity.value "30000000"', () => {
    expect(getWallet('w-mama').authorizedCapacity.value).toBe('30000000')
  })

  it('lanza error si la billetera no existe', () => {
    expect(() => getWallet('nada')).toThrow('Billetera no encontrada')
  })

  it('mutar el resultado no afecta una segunda llamada', () => {
    const primera = getWallet('w-mama')
    primera.name = 'cambiado'
    primera.members.pop()

    const segunda = getWallet('w-mama')
    expect(segunda.name).toBe('Cuidado de mamá')
    expect(segunda.members).toHaveLength(3)
  })
})

describe('getSpends', () => {
  it('w-mama trae la medicina y w-parque no tiene gastos', () => {
    expect(getSpends('w-mama')).toHaveLength(1)
    expect(getSpends('w-mama')[0].id).toBe('s-medicina')
    expect(getSpends('w-parque')).toEqual([])
  })

  it('mutar el resultado no afecta una segunda llamada', () => {
    const primera = getSpends('w-mama')
    primera.pop()

    const segunda = getSpends('w-mama')
    expect(segunda).toHaveLength(1)
  })
})

describe('resetMock', () => {
  it('restaura los datos iniciales después de mutarlos', () => {
    const wallet = getWallet('w-mama')
    wallet.name = 'cambiado'

    const spendsMama = getSpends('w-mama')
    spendsMama.pop()

    resetMock()

    expect(getWallet('w-mama').name).toBe('Cuidado de mamá')
    expect(getSpends('w-mama')).toHaveLength(1)
  })
})

describe('onEvents y emitir', () => {
  beforeEach(() => {
    resetMock()
    vi.useFakeTimers()
  })

  afterEach(() => {
    resetMock()
    vi.useRealTimers()
  })

  it('un callback de w-mama recibe sus eventos y uno de w-parque no', () => {
    const deMama: WalletEvent[] = []
    const deParque: WalletEvent[] = []
    onEvents('w-mama', (e) => deMama.push(e))
    onEvents('w-parque', (e) => deParque.push(e))

    _testEmitir({ walletId: 'w-mama', type: 'member-active', memberId: 'm-x', message: 'x' })

    expect(deMama).toHaveLength(1)
    expect(deParque).toHaveLength(0)
  })

  it('desregistrar con la función devuelta detiene los eventos', () => {
    const recibidos: WalletEvent[] = []
    const off = onEvents('w-mama', (e) => recibidos.push(e))
    off()

    _testEmitir({ walletId: 'w-mama', type: 'member-active', memberId: 'm-x', message: 'x' })

    expect(recibidos).toHaveLength(0)
  })

  it('un timer programado antes de resetMock no dispara después', () => {
    const spy = vi.fn()
    _testProgramar(1000, spy)

    resetMock()
    vi.advanceTimersByTime(5000)

    expect(spy).not.toHaveBeenCalled()
  })
})

describe('playEscenario1', () => {
  beforeEach(() => {
    resetMock()
    vi.useFakeTimers()
  })

  afterEach(() => {
    resetMock()
    vi.useRealTimers()
  })

  it('deja la billetera recién creada de inmediato', () => {
    playEscenario1()

    const wallet = getWallet('w-mama')
    expect(wallet.members.every((m) => m.status === 'pending-approval')).toBe(true)
    expect(wallet.authorizedCapacity.value).toBe('0')
  })

  it('emite 4 eventos en orden al avanzar el reloj', () => {
    const eventos: WalletEvent[] = []
    onEvents('w-mama', (e) => eventos.push(e))

    playEscenario1(1000)
    vi.advanceTimersByTime(4000)

    expect(eventos.map((e) => e.type)).toEqual([
      'member-active',
      'member-active',
      'member-active',
      'capacity-updated',
    ])
  })

  it('al final los 3 miembros quedan active y el cupo vuelve al original', () => {
    playEscenario1(1000)
    vi.advanceTimersByTime(4000)

    const wallet = getWallet('w-mama')
    expect(wallet.members.every((m) => m.status === 'active')).toBe(true)
    expect(wallet.authorizedCapacity).toEqual(cuidadoDeMama.authorizedCapacity)
  })

  it('resetMock a la mitad detiene los eventos y restaura el estado original', () => {
    const eventos: WalletEvent[] = []
    onEvents('w-mama', (e) => eventos.push(e))

    playEscenario1(1000)
    vi.advanceTimersByTime(1500)

    resetMock()
    vi.advanceTimersByTime(10_000)

    expect(eventos).toHaveLength(1)
    expect(getWallet('w-mama')).toEqual(cuidadoDeMama)
  })
})

describe('playEscenario3', () => {
  beforeEach(() => {
    resetMock()
    vi.useFakeTimers()
  })

  afterEach(() => {
    resetMock()
    vi.useRealTimers()
  })

  it('al instante existe el gasto s-ataque con status requested', () => {
    playEscenario3()

    const gasto = getSpends('w-mama').find((s) => s.id === 's-ataque')
    expect(gasto?.status).toBe('requested')
  })

  it('tras avanzar el reloj queda awaiting-approval con riesgo 94 y el verdict de destino', () => {
    playEscenario3(1000)
    vi.advanceTimersByTime(1000)

    const gasto = getSpends('w-mama').find((s) => s.id === 's-ataque')
    expect(gasto?.status).toBe('awaiting-approval')
    expect(gasto?.risk).toBe(94)
    expect(gasto?.verdicts).toEqual([expect.objectContaining({ check: 'destination', status: 'warn' })])
  })

  it('emite exactamente 2 eventos en orden, el segundo con risk 94', () => {
    const eventos: WalletEvent[] = []
    onEvents('w-mama', (e) => eventos.push(e))

    playEscenario3(1000)
    vi.advanceTimersByTime(1000)

    expect(eventos.map((e) => e.type)).toEqual(['spend-requested', 'spend-reviewed'])
    expect(eventos[1].risk).toBe(94)
  })

  it('llamarlo dos veces no deja dos gastos s-ataque', () => {
    playEscenario3()
    playEscenario3()

    const ataques = getSpends('w-mama').filter((s) => s.id === 's-ataque')
    expect(ataques).toHaveLength(1)
  })

  it('resetMock lo elimina', () => {
    playEscenario3()
    resetMock()

    const ataques = getSpends('w-mama').filter((s) => s.id === 's-ataque')
    expect(ataques).toHaveLength(0)
  })
})

describe('castApproval', () => {
  beforeEach(() => {
    resetMock()
    vi.useFakeTimers()
    playEscenario3(100)
    vi.advanceTimersByTime(100)
  })

  afterEach(() => {
    resetMock()
    vi.useRealTimers()
  })

  it('2 votos a favor aprueban el gasto', () => {
    const eventos: WalletEvent[] = []
    onEvents('w-mama', (e) => eventos.push(e))

    castApproval('s-ataque', 'm-bogota', true)
    const resultado = castApproval('s-ataque', 'm-medellin', true)

    expect(resultado.status).toBe('approved')
    expect(eventos.map((e) => e.type)).toEqual(['approval-cast', 'approval-cast', 'spend-approved'])
  })

  it('1 voto en contra no rechaza el gasto', () => {
    const resultado = castApproval('s-ataque', 'm-bogota', false)
    expect(resultado.status).toBe('awaiting-approval')
  })

  it('2 votos en contra rechazan el gasto', () => {
    const eventos: WalletEvent[] = []
    onEvents('w-mama', (e) => eventos.push(e))

    castApproval('s-ataque', 'm-bogota', false)
    const resultado = castApproval('s-ataque', 'm-medellin', false)

    expect(resultado.status).toBe('rejected')
    expect(eventos.map((e) => e.type)).toEqual(['approval-cast', 'approval-cast', 'spend-rejected'])
  })

  it('votar dos veces con el mismo miembro lanza "Ya votó"', () => {
    castApproval('s-ataque', 'm-bogota', true)
    expect(() => castApproval('s-ataque', 'm-bogota', true)).toThrow('Ya votó')
  })

  it('votar sobre un gasto ya rejected lanza el error de estado', () => {
    castApproval('s-ataque', 'm-bogota', false)
    castApproval('s-ataque', 'm-medellin', false)

    expect(() => castApproval('s-ataque', 'm-madrid', true)).toThrow(
      'El gasto no está esperando aprobación (estado: rejected)'
    )
  })

  it('votar con un miembro inexistente lanza "No es miembro activo"', () => {
    expect(() => castApproval('s-ataque', 'm-fantasma', true)).toThrow('No es miembro activo')
  })
})

const FARMACIA_CONOCIDA = { name: 'Farmacia Medellín', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medellin' }
const FARMACIA_PARECIDA = { name: 'Farmacia (cuenta nueva)', walletAddress: 'https://ilp.interledger-test.dev/farmacia-medel1in' }
const CUENTA_NUEVA = { name: 'Supermercado', walletAddress: 'https://ilp.interledger-test.dev/super-mercado' }
const MONTO_120K = { value: '12000000', assetCode: 'COP', assetScale: 2 }
const NUEVO_MIEMBRO = {
  name: 'Persona nueva',
  walletAddress: 'https://ilp.interledger-test.dev/persona-nueva',
  assetCode: 'COP',
  cap: { value: '5000000', assetCode: 'COP', assetScale: 2 },
  interval: 'R12/2026-10-16T00:00:00Z/P1M',
}

describe('startJoin y finishJoin', () => {
  beforeEach(() => resetMock())
  afterEach(() => resetMock())

  it('un tope normal con intervalo recibe un grant pass', () => {
    const resultado = startJoin('w-mama', NUEVO_MIEMBRO)

    expect(resultado.grantWarning.status).toBe('pass')
    expect(resultado.redirectUrl).toMatch(/^#\/unirse\/volver\?ok=1&miembro=/)
  })

  it('un tope de $5.000.000 recibe la advertencia especificada', () => {
    const resultado = startJoin('w-mama', {
      ...NUEVO_MIEMBRO,
      cap: { value: '500000000', assetCode: 'COP', assetScale: 2 },
    })

    expect(resultado.grantWarning.status).toBe('warn')
    expect(resultado.grantWarning.userMessage).toBe(
      'Esta billetera te pide autorizar hasta $5.000.000 sin límite de tiempo. Es mucho más de lo normal.'
    )
  })

  it('sin intervalo advierte aunque el tope sea normal', () => {
    const { interval: _interval, ...sinIntervalo } = NUEVO_MIEMBRO

    expect(startJoin('w-mama', sinIntervalo).grantWarning.status).toBe('warn')
  })

  it('una confirmación válida agrega el miembro y emite los dos eventos', () => {
    const { redirectUrl } = startJoin('w-mama', NUEVO_MIEMBRO)
    const memberId = new URLSearchParams(redirectUrl.split('?')[1]).get('miembro')
    expect(memberId).not.toBeNull()

    const eventos: WalletEvent[] = []
    const dejarDeEscuchar = onEvents('w-mama', (evento) => eventos.push(evento))
    const member = finishJoin({ ok: true, memberId: memberId! })
    dejarDeEscuchar()

    expect('id' in member && member.status).toBe('active')
    expect(getWallet('w-mama').members).toHaveLength(4)
    expect(getWallet('w-mama').authorizedCapacity.value).toBe('35000000')
    expect(eventos.map((evento) => evento.type)).toEqual(['member-active', 'capacity-updated'])
    expect(eventos[1].amount?.value).toBe('35000000')
  })

  it('una confirmación inválida devuelve block sin agregar al miembro', () => {
    const { redirectUrl } = startJoin('w-mama', NUEVO_MIEMBRO)
    const memberId = new URLSearchParams(redirectUrl.split('?')[1]).get('miembro')

    const verdict = finishJoin({ ok: false, memberId: memberId! })

    expect('check' in verdict && verdict.status).toBe('block')
    expect('check' in verdict && verdict.userMessage).toBe(
      'No pudimos confirmar que vienes de tu banco. No te uniste.'
    )
    expect(getWallet('w-mama').members).toHaveLength(3)
  })

  it('el modo de desarrollo puede simular un hash inválido', () => {
    setHashInvalido(true)

    expect(startJoin('w-mama', NUEVO_MIEMBRO).redirectUrl).toBe('#/unirse/volver?ok=0')
  })
})

describe('requestSpend', () => {
  beforeEach(() => {
    resetMock()
    vi.useFakeTimers()
  })

  afterEach(() => {
    resetMock()
    vi.useRealTimers()
  })

  it('a la farmacia conocida con $120.000 queda approved con risk 5 y 3 shares de $40.000', () => {
    const spend = requestSpend('w-mama', FARMACIA_CONOCIDA, MONTO_120K)
    expect(spend.status).toBe('approved')
    expect(spend.risk).toBe(5)
    expect(spend.shares).toHaveLength(3)
    expect(spend.shares.every((s) => s.share.value === '4000000')).toBe(true)
  })

  it('a la farmacia parecida (1→l) queda awaiting-approval con risk 94', () => {
    const spend = requestSpend('w-mama', FARMACIA_PARECIDA, MONTO_120K)
    expect(spend.status).toBe('awaiting-approval')
    expect(spend.risk).toBe(94)
  })

  it('a una cuenta totalmente nueva queda awaiting-approval con risk 45', () => {
    const spend = requestSpend('w-mama', CUENTA_NUEVA, MONTO_120K)
    expect(spend.status).toBe('awaiting-approval')
    expect(spend.risk).toBe(45)
  })

  it('$250.000 a la farmacia conocida queda awaiting-approval por el monto', () => {
    const monto250 = { value: '25000000', assetCode: 'COP', assetScale: 2 }
    const spend = requestSpend('w-mama', FARMACIA_CONOCIDA, monto250)
    expect(spend.status).toBe('awaiting-approval')
    expect(spend.risk).toBe(5)
  })
})

describe('executeSpend y retryShare', () => {
  beforeEach(() => {
    resetMock()
    vi.useFakeTimers()
  })

  afterEach(() => {
    resetMock()
    vi.useRealTimers()
  })

  it('feliz: paga los 3 aportes, el gasto queda paid y la capacidad baja a $180.000', () => {
    const spend = requestSpend('w-mama', FARMACIA_CONOCIDA, MONTO_120K)
    const eventos: WalletEvent[] = []
    onEvents('w-mama', (e) => eventos.push(e))

    executeSpend(spend.id)
    vi.advanceTimersByTime(4500)

    expect(eventos.map((e) => e.type)).toEqual([
      'share-paid',
      'share-paid',
      'share-paid',
      'spend-paid',
      'capacity-updated',
    ])
    expect(getWallet('w-mama').authorizedCapacity.value).toBe('18000000')
  })

  it('con setFalloAporte en m-madrid, falla su aporte y el gasto queda incomplete sin spend-paid', () => {
    const spend = requestSpend('w-mama', FARMACIA_CONOCIDA, MONTO_120K)
    setFalloAporte('m-madrid')
    const eventos: WalletEvent[] = []
    onEvents('w-mama', (e) => eventos.push(e))

    executeSpend(spend.id)
    vi.advanceTimersByTime(4500)

    expect(eventos.some((e) => e.type === 'share-failed')).toBe(true)
    expect(eventos.some((e) => e.type === 'spend-paid')).toBe(false)

    const gasto = getSpends('w-mama').find((s) => s.id === spend.id)
    expect(gasto?.status).toBe('incomplete')
  })

  it('retryShare reintenta el aporte fallido y el gasto termina paid', () => {
    const spend = requestSpend('w-mama', FARMACIA_CONOCIDA, MONTO_120K)
    setFalloAporte('m-madrid')

    executeSpend(spend.id)
    vi.advanceTimersByTime(4500)

    retryShare(spend.id)
    vi.advanceTimersByTime(1500)

    const gasto = getSpends('w-mama').find((s) => s.id === spend.id)
    expect(gasto?.status).toBe('paid')
  })

  it('executeSpend en un gasto awaiting-approval lanza error', () => {
    const spend = requestSpend('w-mama', FARMACIA_PARECIDA, MONTO_120K)
    expect(() => executeSpend(spend.id)).toThrow('no está aprobado')
  })

  it('resetMock cancela los timers pendientes de executeSpend', () => {
    const spend = requestSpend('w-mama', FARMACIA_CONOCIDA, MONTO_120K)
    const eventos: WalletEvent[] = []
    onEvents('w-mama', (e) => eventos.push(e))

    executeSpend(spend.id)
    resetMock()
    vi.advanceTimersByTime(10_000)

    expect(eventos).toHaveLength(0)
  })
})
