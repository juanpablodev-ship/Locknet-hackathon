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
- R2: pruebas de dos aportes parciales en el simulado y de casos fallidos; `npm test` (45 pruebas aprobadas en total, 8 de R2) y `npm run typecheck` (sin errores) ejecutados localmente. No se ejecutaron pagos reales ni pruebas con Test Wallet.

## Pendientes de R2

- Probar el flujo real con un permiso y token propio de prueba, sin guardarlo en el repositorio.
- Verificar en Test Wallet si dos pagadores pueden aportar parcialmente a un mismo cobro usando `incomingAmount` total y `receiveAmount` por parte.
- Si falla esa verificación, coordinar con R3 el plan B de un cobro por miembro.
- Implementar y probar `distributeReturn` después de la puerta de calidad del caso prioritario.
- Acordar con R3 una clasificación estructurada de `failReason` sin inventar campos del contrato.
