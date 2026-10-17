# Uso de IA

> Responsable: R2. Se llena durante el hackatón.

| Rol | Herramienta de IA | Para qué | Archivos | Qué verificamos nosotros |
|---|---|---|---|---|
| R1 | | | | |
| R2 | Codex | Simulado y servicio de cobro, cotización, pago saliente, seguimiento y lectura del monto recibido | `mocks/payments.mock.ts`, `apps/api/src/payments/` | Pruebas automatizadas y typecheck; pendiente prueba manual con dos pagadores en Test Wallet |
| R3 | Claude Code | | | |
| R4 | | | | |
| R5 | | | | |

## Archivos con poca o ninguna IA

## Qué hicimos nosotros (pruebas, verificación, correcciones)

- R2: se contrastaron las llamadas con las páginas oficiales del SDK de Open Payments para permisos de cobro y cotización, creación/consulta de cobros, cotización y creación/consulta de pagos salientes.
- R2: las pruebas locales del servicio simulan dos cotizaciones parciales contra el mismo cobro, rechazan el segundo pago secuencial de una misma cotización y leen la acumulación desde `incomingPayment.get`. La concurrencia real y la idempotencia entre procesos siguen dependiendo de la coordinación de R3; no se ejecutaron pagos.
- R2: se validó un grant saliente real y se ejecutó una sola prueba de pago en Test Wallet. Según revisión visual, el outgoing payment y el incoming payment terminaron `COMPLETED`; se observaron EUR 2,00 debitados y EUR 1,00 recibidos. La diferencia no se atribuye a ninguna causa: la ejecución anterior no conservó los IDs y no hubo conciliación API retrospectiva. No se ejecutaron pagos adicionales.

## Pendientes de R2

- Confirmar en una ejecución futura el `debitAmount` de la quote y conciliar por API con IDs persistidos, sin reutilizar ni adivinar los IDs de la prueba anterior.
- Verificar en Test Wallet si dos pagadores pueden aportar parcialmente a un mismo cobro usando `incomingAmount` total y `receiveAmount` por parte.
- Si falla esa verificación, coordinar con R3 el plan B de un cobro por miembro.
- `distributeReturn` permanece sin implementar: el contrato actual no define destinatarios, importes por inversor ni estrategia de redondeo; debe acordarse con R3 antes de implementarlo.
- Acordar con R3 una clasificación estructurada de `failReason` sin inventar campos del contrato.

## Estado verificable de esta revisión

- La cotización COP → COP permite códigos iguales, convierte 40.000 COP a unidades menores según la escala receptora y nunca llama a `outgoingPayment.create` en las pruebas locales.
- Se añadieron regresiones locales para importes inválidos, escalas distintas, redondeo/truncamiento del porcentaje y el límite estricto del 5 %.
- Las pruebas de pagos parciales cubren cotizaciones independientes para dos miembros sobre un mismo cobro, rechazo secuencial de una cotización ya usada y lectura de acumulación reportada por el proveedor. No prueban concurrencia real ni garantizan idempotencia distribuida.
- La suite completa ejecutada en esta revisión tuvo cinco fallos ajenos a R2 en `apps/api/src/members/verify-*` y quedó detenida después de esos fallos; no se modificaron esos archivos.
- `npm test -- apps/api/src/payments` terminó con 6 archivos y 47 pruebas aprobadas; después de los cambios, `npm run typecheck` y `git diff --check` también terminaron correctamente.
- La prueba real de Test Wallet sigue pendiente y no se ejecutó en esta revisión.

## Evidencia real de la cotización R2

- Se ejecutó manualmente y con autorización `npm run op -- apps/api/src/payments/test-wallet.smoke.ts --quote-only`.
- Test Wallet informó pagador COP con escala 2 y farmacia COP con escala 2.
- La quote fue creada con `receiveAmount` de 4.000.000 unidades mínimas COP y `debitAmount` de 4.000.000 unidades mínimas COP.
- La conversión fue COP → COP, con diferencia de 0 COP, coste de 0,00 % y sin superar el 5 %.
- El modo utilizado no ejecutó ningún pago saliente; esta evidencia real es independiente de las pruebas locales con mocks.
- No se conservaron ni se documentan identificadores de recursos, tokens ni credenciales.

## Pendientes y coordinación

- `distributeReturn` continúa pendiente: el contrato actual no fija destinatarios, importes por inversor ni redondeo. Requiere una definición con R3 antes de implementarse.
- Los tests locales cubren dos cotizaciones parciales sobre un mismo cobro y la lectura de acumulación del proveedor, pero no verifican concurrencia real ni idempotencia distribuida. Coordinar con R3 la estrategia de estado y conciliación.
- Coordinar con R3/R5 una clasificación de `failReason` usando únicamente los campos existentes en el contrato; no se añadió ninguna interfaz nueva.
- La validación real de dos pagadores parciales sigue abierta.
