import { describe, expect, it } from 'vitest'
import { assertTransition, canTransition } from './state'

describe('máquina de estados del gasto', () => {
  it('permite el camino feliz: requested → approved → paying → paid', () => {
    expect(() => {
      assertTransition('requested', 'approved')
      assertTransition('approved', 'paying')
      assertTransition('paying', 'paid')
    }).not.toThrow()
  })

  it('permite reintentar: paying → incomplete → paying', () => {
    expect(canTransition('paying', 'incomplete')).toBe(true)
    expect(canTransition('incomplete', 'paying')).toBe(true)
  })

  it('nunca marca pagado sin pasar por paying', () => {
    expect(() => assertTransition('requested', 'paid')).toThrow(/requested → paid/)
    expect(() => assertTransition('approved', 'paid')).toThrow()
  })

  it('un gasto bloqueado o rechazado no sale de ahí', () => {
    expect(canTransition('blocked', 'approved')).toBe(false)
    expect(canTransition('rejected', 'paying')).toBe(false)
  })
})
