import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WalletEvent } from '../contracts/index.js'
import { cuidadoDeMama } from '../contracts/ejemplo.js'
import {
  _testEmitir,
  _testProgramar,
  getSpends,
  getWallet,
  getWallets,
  onEvents,
  playEscenario1,
  playEscenario3,
  resetMock,
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
