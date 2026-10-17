import { describe, expect, it } from 'vitest'
import type { Spend } from '../../../contracts/index.js'
import { ataque, cuidadoDeMama, medicina } from '../../../contracts/ejemplo.js'
import { getWallets } from '../../../mocks/api.mock.js'
import { renderInicio, renderSelectorBilleteras } from './inicio.js'
import { NOMBRE_GUARDIAN } from './config.js'

describe('renderInicio', () => {
  it('"Invitar a alguien" lleva el id del grupo, escapado', () => {
    expect(renderInicio(cuidadoDeMama)).toContain(`href="#/unirse?grupo=${cuidadoDeMama.id}">Invitar a alguien`)
    expect(renderInicio({ ...cuidadoDeMama, id: 'a&b"c' })).toContain('href="#/unirse?grupo=a%26b%22c">Invitar a alguien')
  })

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

  it('muestra una casilla independiente por miembro con su porcentaje available/cap', () => {
    const wallet = structuredClone(cuidadoDeMama)
    wallet.members[0].available = { ...wallet.members[0].cap, value: '2500000' }
    delete wallet.members[1].available

    const html = renderInicio(wallet)
    expect(html.match(/class="casilla-cupo"/g)).toHaveLength(3)
    expect(html).toContain('Hermano en Bogotá: 25% disponible')
    expect(html).toContain('style="width: 25%"')
    expect(html).toContain('Hermana en Medellín: disponible desconocido')
    expect(html).toContain('casilla-cupo-vacia">—')
  })

  it('escapa nombres de miembros en la etiqueta accesible de la barra', () => {
    const wallet = structuredClone(cuidadoDeMama)
    wallet.members[0].name = '<script>alert(1)</script>'

    const html = renderInicio(wallet)

    expect(html).not.toContain('aria-label="<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;: 100% disponible')
  })

  it('muestra un enlace de espera al primer gasto awaiting-approval', () => {
    const secondPending = { ...structuredClone(ataque), id: 's-otro-pendiente' }
    const html = renderInicio(cuidadoDeMama, [medicina, ataque, secondPending])

    expect(html).toContain('class="espera" href="#/gasto/s-ataque"')
    expect(html).toContain('Farmacia (cuenta nueva), $120.000')
    expect(html).toContain('Riesgo alto: esperando aprobación del grupo')
    expect(html).not.toContain('href="#/gasto/s-otro-pendiente"')
  })

  it('no muestra la tarjeta de espera si no hay gastos awaiting-approval', () => {
    expect(renderInicio(cuidadoDeMama, [medicina])).not.toContain('class="espera"')
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

  it('muestra el panel "El contrato del grupo" con la regla y quién la hace cumplir', () => {
    const [care] = getWallets()
    const html = renderInicio(care)

    expect(html).toContain('El contrato del grupo')
    expect(html).toContain('Nadie aporta más del tope que autorizó</span><b class="contrato-quien">Su propio banco')
    expect(html).toContain('El permiso se renueva cada mes</span><b class="contrato-quien">Su propio banco')
    expect(html).toContain('su permiso se cancela al instante</span><b class="contrato-quien">Su propio banco')
    expect(html).toContain('aunque alguien pague en otra moneda</span><b class="contrato-quien">La cotización de Open Payments')
    expect(html).toContain(`Nada se da por pagado sin verificar lo que llegó</span><b class="contrato-quien">${NOMBRE_GUARDIAN}`)
    expect(html).not.toContain('Partes iguales')
  })

  it('el contrato toma monto, aprobaciones y destinos de confianza de la wallet', () => {
    const [care] = getWallets()
    const html = renderInicio(care)

    expect(html).toContain('mayor a $200.000 necesita 2 aprobaciones del grupo; un solo rechazo detiene un pago riesgoso</span><b class="contrato-quien">Kivor')
    for (const d of care.knownDestinations) expect(html).toContain(d.name)
    expect(html).toContain(`Destinos de confianza: ${care.knownDestinations[0].name}`)

    const cambiada = structuredClone(care)
    cambiada.rules.groupApproval.aboveAmount = { value: '50000000', assetCode: 'COP', assetScale: 2 }
    cambiada.rules.groupApproval.approvalsRequired = 3
    cambiada.knownDestinations = [{ name: 'Óptica <Centro>', walletAddress: 'https://ilp.interledger-test.dev/optica' }]
    const html2 = renderInicio(cambiada)
    expect(html2).toContain('mayor a $500.000 necesita 3 aprobaciones')
    expect(html2).toContain('Destinos de confianza: Óptica &lt;Centro&gt;')
    expect(html2).not.toContain('$200.000')
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

    expect(html).toContain('Mismo motor, otro contrato')
    expect(html).toContain('data-wallet-id="w-parque" aria-pressed="true"')
  })
})
