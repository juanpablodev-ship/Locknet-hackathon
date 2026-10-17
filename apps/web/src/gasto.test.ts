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
    expect(html).toContain('data-accion="abrir-confirmacion"')
    expect(html).toContain('data-accion="aprobar"')
    expect(html).toContain('data-accion="rechazar"')
  })

  it('presenta confirmación accesible de riesgo alto y exige marcar antes de aprobar', () => {
    const html = renderGasto(ataque, cuidadoDeMama)

    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('Cuenta conocida · Farmacia Medellín')
    expect(html).toContain('<mark>l</mark>')
    expect(html).toContain('<mark>1</mark>')
    expect(html).toContain('Confirmo que revisé la cuenta')
    expect(html).toContain('Aprobar $120.000 de todos modos')
    expect(html).toContain('id="aprobar-riesgo"')
    expect(html).toMatch(/id="aprobar-riesgo"[^>]*disabled/)
    expect(html).toContain('<button type="submit" formnovalidate')
    expect(html).toContain(`Confirma con ${ataque.destination.name}`)
  })

  it('muestra una cuenta nueva sin comparar una cuenta no parecida', () => {
    const wallet = structuredClone(cuidadoDeMama)
    wallet.knownDestinations = [{ name: 'Cuenta cercana', walletAddress: 'https://totally-different.example/tienda' }]
    const html = renderGasto(ataque, wallet)

    expect(html).toContain('Es una cuenta nueva para este grupo')
    expect(html).not.toContain('Cuenta conocida ·')
  })

  it('mantiene aprobación de un clic bajo el umbral y activa confirmación desde el umbral', () => {
    const bajoUmbral = { ...ataque, risk: cuidadoDeMama.rules.groupApproval.riskThreshold - 1 }
    const desdeUmbral = { ...ataque, risk: cuidadoDeMama.rules.groupApproval.riskThreshold }

    expect(renderGasto(bajoUmbral, cuidadoDeMama)).toContain('data-accion="aprobar"')
    expect(renderGasto(bajoUmbral, cuidadoDeMama)).not.toContain('role="alertdialog"')
    expect(renderGasto(desdeUmbral, cuidadoDeMama)).toContain('data-accion="abrir-confirmacion"')
    expect(renderGasto(desdeUmbral, cuidadoDeMama)).toContain('role="alertdialog"')
  })

  it('muestra una tarjeta por miembro activo en la cuadrícula de votos', () => {
    const html = renderGasto(ataque, cuidadoDeMama)

    expect(html.match(/class="voto voto-ambar"/g)).toHaveLength(3)
    expect(html).toContain('Hermano en Bogotá')
    expect(html).toContain('Hermana en Medellín')
    expect(html).toContain('Hermano en Madrid')
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

  it('escapa el código monetario del gasto', () => {
    const spend = structuredClone(ataque)
    spend.amount.assetCode = '<img src=x>'

    expect(renderGasto(spend, cuidadoDeMama)).not.toContain('<img')
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

  it('approved muestra el panel verde y el botón "Pagar la cuota del mes"', () => {
    const spend = { ...ataque, status: 'approved' as const }
    const html = renderGasto(spend, cuidadoDeMama)
    expect(html).toContain('El grupo aprobó el gasto.')
    expect(html).toContain('Pagar la cuota del mes')
    expect(html).toContain('data-accion="pagar"')
  })

  it('"Pagar la cuota del mes" solo aparece en approved', () => {
    for (const estado of ['requested', 'paying', 'incomplete', 'paid', 'rejected'] as const) {
      const spend = estado === 'paying' ? gastoPagando : estado === 'incomplete' ? gastoIncompleto : { ...ataque, status: estado }
      expect(renderGasto(spend, cuidadoDeMama)).not.toContain('Pagar la cuota del mes')
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
    expect(html).toContain('class="pasos-gasto"')
    expect(html).toContain('aria-current="step"')
    expect(html).toContain('2 de 3 aportes confirmados · falta Hermano en Madrid')
    expect(html).toContain('aria-valuemax="3" aria-valuenow="2"')
    expect(html).toContain('class="barra-progreso-relleno barra-progreso-ambar" style="width: 67%"')
    expect(html).toContain('class="aporte aporte-verde"')
    expect(html).toContain('class="aporte aporte-ambar"')
  })

  it('muestra el progreso completo y verde solo después del pago', () => {
    const spend = { ...structuredClone(medicina), status: 'paid' as const }
    const html = renderGasto(spend, cuidadoDeMama)

    expect(html).toContain('Gasto verificado: llegó completo a Farmacia Medellín')
    expect(html).toContain('class="recibo"')
    expect(html).toContain('>Recibo</h1>')
    expect(html).toContain('aria-valuemax="3" aria-valuenow="3"')
    expect(html).toContain('class="barra-progreso-relleno barra-progreso-verde" style="width: 100%"')
  })

  it('incomplete muestra panel ámbar, el motivo del fallo y el botón de reintentar', () => {
    const html = renderGasto(gastoIncompleto, cuidadoDeMama)
    expect(html).toContain('Pago incompleto')
    expect(html).toContain('Incompleto: llegaron 2 de 3 aportes.')
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

describe('consulta accesible en gastos incompletos', () => {
  it.each(['failed', 'pending'] as const)('con aporte %s el botón está en el contenedor que escucha clics', status => {
    const spend = structuredClone(gastoIncompleto)
    spend.shares[2].status = status
    const html = renderGasto(spend, cuidadoDeMama)
    const actions = [...html.matchAll(/<div class="acciones">([\s\S]*?)<\/div>/g)].map(m => m[1])
    expect(actions.some(content => content.includes('data-accion="consultar"'))).toBe(true)
    expect(html).toContain('Consultar intentos y recepción (sin pagar)')
  })

  it('paying con una respuesta pendiente permite volver a consultar y no reintentar', () => {
    const html = renderGasto(gastoPagando, cuidadoDeMama)
    expect(html).toContain('No se pudo verificar')
    expect(html).toContain('data-accion="consultar"')
    expect(html).toContain('Volver a consultar')
    expect(html).not.toContain('data-accion="reintentar"')
  })
})

it('muestra enlace al gasto bloqueante y oculta pagar cuando existe otro intento pendiente', () => {
  const approved = structuredClone(medicina)
  approved.status = 'approved'
  const blockedBy = structuredClone(gastoIncompleto)
  blockedBy.id = 'anterior'
  const html = renderGasto(approved, cuidadoDeMama, undefined, blockedBy)
  expect(html).toContain('Hay un pago anterior sin resolver')
  expect(html).toContain('href="#/gasto/anterior"')
  expect(html).not.toContain('data-accion="pagar"')
})
