import { describe, expect, it } from 'vitest'
import { ataque, cuidadoDeMama, destinoParecido } from '../../../contracts/ejemplo.js'
import { statusLabel } from './format.js'
import { renderGasto } from './gasto.js'

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

  it('approved muestra el panel verde', () => {
    const spend = { ...ataque, status: 'approved' as const }
    expect(renderGasto(spend, cuidadoDeMama)).toContain('El grupo aprobó el gasto.')
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

  it('paying, paid e incomplete muestran solo el statusLabel', () => {
    for (const status of ['paying', 'paid', 'incomplete'] as const) {
      const html = renderGasto({ ...ataque, status }, cuidadoDeMama)
      expect(html).toContain(statusLabel(status))
    }
  })

  it('paid no muestra la palabra "verificado"', () => {
    const html = renderGasto({ ...ataque, status: 'paid' }, cuidadoDeMama).toLowerCase()
    expect(html).not.toContain('verificado')
  })
})
