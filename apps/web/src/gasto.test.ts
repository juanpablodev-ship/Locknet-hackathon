import { describe, expect, it } from 'vitest'
import type { Spend } from '../../../contracts/index.js'
import { ataque, cuidadoDeMama, destinoParecido, medicina } from '../../../contracts/ejemplo.js'
import { renderGasto } from './gasto.js'

const pesos = (valor: number) => ({ value: String(valor), assetCode: 'COP', assetScale: 2 })

const gastoPagando: Spend = {
  ...structuredClone(ataque),
  status: 'paying',
  shares: [
    { memberId: 'm-bogota', share: pesos(4000000), status: 'paid', debit: pesos(4000000), received: pesos(4000000) },
    { memberId: 'm-medellin', share: pesos(4000000), status: 'paid', debit: pesos(4000000), received: pesos(4000000) },
    { memberId: 'm-madrid', share: pesos(4000000), status: 'pending' },
  ],
  progress: { confirmed: 2, total: 3 },
}

const gastoIncompleto: Spend = {
  ...structuredClone(ataque),
  status: 'incomplete',
  shares: [
    { memberId: 'm-bogota', share: pesos(4000000), status: 'paid', debit: pesos(4000000), received: pesos(4000000) },
    { memberId: 'm-medellin', share: pesos(4000000), status: 'paid', debit: pesos(4000000), received: pesos(4000000) },
    { memberId: 'm-madrid', share: pesos(4000000), status: 'failed', failReason: 'cupo insuficiente' },
  ],
  progress: { confirmed: 2, total: 3 },
}

describe('renderGasto - awaiting-approval', () => {
  it('contiene el riesgo, el nivel, el mensaje del verdict y el sello', () => {
    const html = renderGasto(ataque, cuidadoDeMama)
    expect(html).toContain('94')
    expect(html).toContain('Riesgo alto')
    expect(html).toContain(destinoParecido.userMessage)
    expect(html).toContain('Protegido por Open Sentinels')
  })

  it('los reasons salen en una sola línea separados por " · "', () => {
    const spend = structuredClone(ataque)
    spend.verdicts = [{ ...destinoParecido, reasons: ['razón uno', 'razón dos'] }]

    const html = renderGasto(spend, cuidadoDeMama)
    expect(html).toContain('razón uno · razón dos')
  })

  it('cuenta los votos a favor y en contra', () => {
    const html = renderGasto(ataque, cuidadoDeMama)
    expect(html).toContain('A favor: 0 de 2')
    expect(html).toContain('En contra: 0 de 2')
  })

  it('tiene los dos botones de voto', () => {
    const html = renderGasto(ataque, cuidadoDeMama)
    expect(html).toContain('data-accion="aprobar"')
    expect(html).toContain('data-accion="rechazar"')
  })

  it('deshabilita los botones y muestra "Ya votaste" si votaComo ya votó', () => {
    const spend = structuredClone(ataque)
    spend.approvals = [{ memberId: 'm-bogota', yes: true }]

    const html = renderGasto(spend, cuidadoDeMama, 'm-bogota')
    expect(html).toContain('Ya votaste')
    expect(html).toContain('disabled')
    expect(html).not.toContain('data-accion')
  })

  it('no usa "saldo", "multifirma" ni "verificado"', () => {
    const html = renderGasto(ataque, cuidadoDeMama).toLowerCase()
    expect(html).not.toContain('saldo')
    expect(html).not.toContain('multifirma')
    expect(html).not.toContain('verificado')
  })

  it('escapa un destino con <script>', () => {
    const spend = structuredClone(ataque)
    spend.destination = { name: '<script>alert(1)</script>', walletAddress: spend.destination.walletAddress }

    const html = renderGasto(spend, cuidadoDeMama)
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('renderGasto - otros estados', () => {
  it('requested muestra que se está revisando con el guardián', () => {
    const spend = { ...ataque, status: 'requested' as const }
    expect(renderGasto(spend, cuidadoDeMama)).toContain('Revisando el gasto con Open Sentinels')
  })

  it('rejected muestra el panel rojo y no tiene botones', () => {
    const spend = { ...ataque, status: 'rejected' as const }
    const html = renderGasto(spend, cuidadoDeMama)
    expect(html).toContain('Rechazado por el grupo')
    expect(html).toContain('El gasto no salió. Nadie pagó nada.')
    expect(html).not.toContain('data-accion')
  })

  it('approved muestra el panel verde y el botón "Pagar ahora"', () => {
    const spend = { ...ataque, status: 'approved' as const }
    const html = renderGasto(spend, cuidadoDeMama)
    expect(html).toContain('El grupo aprobó el gasto.')
    expect(html).toContain('Pagar ahora')
    expect(html).toContain('data-accion="pagar"')
  })

  it('"Pagar ahora" solo aparece en approved', () => {
    for (const estado of ['requested', 'paying', 'incomplete', 'paid', 'rejected'] as const) {
      const spend = estado === 'paying' ? gastoPagando : estado === 'incomplete' ? gastoIncompleto : { ...ataque, status: estado }
      expect(renderGasto(spend, cuidadoDeMama)).not.toContain('Pagar ahora')
    }
  })

  it('blocked muestra el panel rojo con el verdict que bloquea', () => {
    const spend = {
      ...ataque,
      status: 'blocked' as const,
      verdicts: [{ ...destinoParecido, status: 'block' as const }],
    }
    const html = renderGasto(spend, cuidadoDeMama)
    expect(html).toContain('Gasto bloqueado')
    expect(html).toContain(destinoParecido.userMessage)
  })

  it('paying muestra el progreso "2 de 3 aportes confirmados · falta Madrid"', () => {
    const html = renderGasto(gastoPagando, cuidadoDeMama)
    expect(html).toContain('2 de 3 aportes confirmados · falta Hermano en Madrid')
  })

  it('incomplete muestra panel ámbar, el motivo del fallo y el botón de reintentar', () => {
    const html = renderGasto(gastoIncompleto, cuidadoDeMama)
    expect(html).toContain('Pago incompleto')
    expect(html).toContain('cupo insuficiente')
    expect(html).toContain('Reintentar el aporte de Hermano en Madrid')
    expect(html).toContain('data-accion="reintentar"')
  })

  it('"Reintentar" solo aparece en incomplete', () => {
    expect(renderGasto({ ...ataque, status: 'approved' as const }, cuidadoDeMama)).not.toContain('Reintentar')
    expect(renderGasto(gastoPagando, cuidadoDeMama)).not.toContain('Reintentar')
    expect(renderGasto(medicina, cuidadoDeMama)).not.toContain('Reintentar')
  })

  it('paid muestra el sello "Gasto verificado"', () => {
    const html = renderGasto(medicina, cuidadoDeMama)
    expect(html).toContain('Gasto verificado: llegó completo a Farmacia Medellín')
  })

  it('"Gasto verificado" solo aparece en paid', () => {
    expect(renderGasto({ ...ataque, status: 'approved' as const }, cuidadoDeMama)).not.toContain('Gasto verificado')
    expect(renderGasto(gastoPagando, cuidadoDeMama)).not.toContain('Gasto verificado')
    expect(renderGasto(gastoIncompleto, cuidadoDeMama)).not.toContain('Gasto verificado')
  })
})
