import { describe, expect, it } from 'vitest'
import type { Spend } from '../../../contracts/index.js'
import { cuidadoDeMama, medicina } from '../../../contracts/ejemplo.js'
import { getWallets } from '../../../mocks/api.mock.js'
import { renderInicio, renderSelectorBilleteras } from './inicio.js'

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

  it('escapa el código monetario devuelto por datos externos', () => {
    const wallet = structuredClone(cuidadoDeMama)
    wallet.authorizedCapacity.assetCode = '<img src=x onerror=alert(1)>'

    const html = renderInicio(wallet)

    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('no usa la palabra "saldo" ni "multifirma"', () => {
    const html = renderInicio(cuidadoDeMama).toLowerCase()
    expect(html).not.toContain('saldo')
    expect(html).not.toContain('multifirma')
  })

  it('muestra las reglas de la billetera de cuidado', () => {
    const [care] = getWallets()
    const html = renderInicio(care)

    expect(html).toContain('Partes iguales')
    expect(html).toContain('aprobación del grupo si pasa de $200.000 o el riesgo llega a 60')
  })

  it('muestra la meta, el progreso 2 de 3 y el aviso mientras no haya pagos', () => {
    const [, goal] = getWallets()
    const html = renderInicio(goal, [])

    expect(html).toContain('Meta: $150.000 con 3 vecinos antes del 31 de octubre de 2026')
    expect(html).toContain('2 de 3 vecinos')
    expect(html).toContain('Nadie ha pagado todavía')
    expect(html).toContain('width: 66.666')
  })

  it('quita el aviso de meta cuando ya hay un gasto paid', () => {
    const [, goal] = getWallets()
    const paid: Spend = { ...structuredClone(medicina), walletId: goal.id }

    expect(renderInicio(goal, [paid])).not.toContain('Nadie ha pagado todavía')
  })

  it('muestra las reglas de devolución de la billetera de inversión', () => {
    const [, , investment] = getWallets()
    const html = renderInicio(investment)

    expect(html).toContain('Cada venta devuelve el 10% hasta $1.500.000')
    expect(html).toContain('Configuración en pantalla: este caso aún no ejecuta pagos reales')
  })

  it('presenta botones de selección y marca la billetera activa', () => {
    const wallets = getWallets()
    const html = renderSelectorBilleteras(wallets, 'w-parque')

    expect(html).toContain('Misma billetera, otra regla')
    expect(html).toContain('data-wallet-id="w-parque" aria-pressed="true"')
  })
})
