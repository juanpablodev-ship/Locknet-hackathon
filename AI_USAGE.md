# Uso de IA

> Responsable: R2. Se llena durante el hackatón.

| Rol | Herramienta de IA | Para qué | Archivos | Qué verificamos nosotros |
|---|---|---|---|---|
| R1 | Codex | Miembros y corrección de integración familiar entre módulos, con excepción de roles autorizada por el usuario | `apps/api/src/members`, `apps/api/src/payments`, `apps/api/src/wallet`, `apps/api/src/server.ts`, arranque/configuración, `apps/web`, `/contracts`, `/demo`, `/fixtures`, documentación y pruebas asociadas | Pruebas automatizadas, typecheck y build; metadatos públicos y arranque/formulario local. No se ejecutaron pagos ni autorizaciones reales en esta corrección; pendientes los recorridos humanos del README |
| R2 | Codex | Simulado y servicio de cobro, cotización, pago saliente, seguimiento y lectura del monto recibido | `mocks/payments.mock.ts`, `apps/api/src/payments/` | Pruebas automatizadas y typecheck; pendiente prueba manual con dos pagadores en Test Wallet |
| R3 | Claude Code | | | |
| R4 | | | | |
| R5 | | | | |

## Archivos con poca o ninguna IA

## Qué hicimos nosotros (pruebas, verificación, correcciones)

- R2: se contrastaron las llamadas con las páginas oficiales del SDK de Open Payments para permisos de cobro y cotización, creación/consulta de cobros, cotización y creación/consulta de pagos salientes.
- R2: pruebas de dos aportes parciales en el simulado y de casos fallidos. Verificación local: `npm test` 64/64 aprobadas, `npm run typecheck` aprobado y `git diff --check` aprobado.
- R2: se validó un grant saliente real y se ejecutó una sola prueba de pago en Test Wallet. Según revisión visual, el outgoing payment y el incoming payment terminaron `COMPLETED`; se observaron EUR 2,00 debitados y EUR 1,00 recibidos. La diferencia no se atribuye a ninguna causa: la ejecución anterior no conservó los IDs y no hubo conciliación API retrospectiva. No se ejecutaron pagos adicionales.

## Pendientes de R2

- Confirmar en una ejecución futura el `debitAmount` de la quote y conciliar por API con IDs persistidos, sin reutilizar ni adivinar los IDs de la prueba anterior.
- Verificar en Test Wallet si dos pagadores pueden aportar parcialmente a un mismo cobro usando `incomingAmount` total y `receiveAmount` por parte.
- Si falla esa verificación, coordinar con R3 el plan B de un cobro por miembro.
- Implementar y probar `distributeReturn` después de la puerta de calidad del caso prioritario.
- Acordar con R3 una clasificación estructurada de `failReason` sin inventar campos del contrato.
