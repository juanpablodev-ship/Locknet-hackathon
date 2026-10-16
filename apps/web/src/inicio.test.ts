import { describe, expect, it } from 'vitest'
import { cuidadoDeMama } from '../../../contracts/ejemplo.js'
import { renderInicio } from './inicio.js'

describe('renderInicio', () => {
  it('muestra la etiqueta y el cupo formateado', () => {
    const html = renderInicio(cuidadoDeMama)
    expect(html).toContain('Cupo autorizado este mes')
    expect(html).toContain('$300.000')
  })

  it('explica que nadie depositó nada', () => {
    expect(renderInicio(cuidadoDeMama)).toContain('Nadie depositó nada')
  })

  it('tiene una tarjeta por miembro con la bandera correcta', () => {
    const html = renderInicio(cuidadoDeMama)
    expect(html).toContain('🇨🇴')
    expect(html).toContain('🇪🇸')
  })

  it('un miembro pending-approval muestra Pendiente', () => {
    const wallet = structuredClone(cuidadoDeMama)
    wallet.members[0].status = 'pending-approval'

    expect(renderInicio(wallet)).toContain('Pendiente')
  })

  it('un nombre con <script> sale escapado', () => {
    const wallet = structuredClone(cuidadoDeMama)
    wallet.members[0].name = '<script>alert(1)</script>'

    const html = renderInicio(wallet)
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
  })

  it('no usa la palabra "saldo" ni "multifirma"', () => {
    const html = renderInicio(cuidadoDeMama).toLowerCase()
    expect(html).not.toContain('saldo')
    expect(html).not.toContain('multifirma')
  })
})
