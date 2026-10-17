# Uso de IA

> Responsable: R2. Se llena durante el hackatón.

| Rol | Herramienta de IA | Para qué | Archivos | Qué verificamos nosotros |
|---|---|---|---|---|
| R1 | Codex | Miembros y corrección de integración familiar entre módulos, con excepción de roles autorizada por el usuario | `apps/api/src/members`, `apps/api/src/payments`, `apps/api/src/wallet`, `apps/api/src/server.ts`, arranque/configuración, `apps/web`, `/contracts`, `/demo`, `/fixtures`, documentación y pruebas asociadas | Pruebas automatizadas, typecheck y build; metadatos públicos y arranque/formulario local. No se ejecutaron pagos ni autorizaciones reales en esta corrección; pendientes los recorridos humanos del README |
| R2 | Codex | Simulado y servicio de cobro, cotización, pago saliente, seguimiento, recuperación de intentos y lectura de lo recibido | `mocks/payments.mock.ts`, `apps/api/src/payments/`, `AI_USAGE.md` | `npm run typecheck` y 54 pruebas locales de pagos aprobadas; 18 pruebas locales de plan B verifican tres cobros separados y conciliación simulada. Pendientes las comprobaciones humanas y financieras de Test Wallet |
| R3 | Claude Code | Motor de la billetera (estados del gasto, reparto, aprobación del grupo, ejecución por aporte, reintento y conciliación con `reconcile`), API REST y SSE, sesiones para unirse, arranque, `/contracts`, revisión e integración de las ramas de los demás roles, ensayos en modo respaldo y documentos de pitch | `/apps/api/src/wallet`, `apps/api/src/server.ts`, `apps/api/src/main.ts`, `/contracts`, `docs/guion-corrida.md`, `docs/diapositivas.md`, `prompts/R3.md` | Pruebas automatizadas, typecheck y build antes de cada fusión a `main`; revisión de cada rama y PR (carpetas tocadas, secretos y conflictos) antes de fusionar; ensayo de 3 corridas seguidas en modo respaldo; verificación en navegador de la web contra la API; barrido de secretos en los 274 commits de todas las ramas. **No verificado por nosotros:** la corrida real contra la Test Wallet con las tres wallets (se hace en vivo con R1 y R2) |
| R4 | | | | |
| R5 | | | | |

## Archivos con poca o ninguna IA

No hay evidencia suficiente para certificar archivos concretos en esta categoría. Cada responsable debe declarar sus archivos manuales o revisados sin IA antes de la entrega.

## Qué hicimos nosotros (pruebas, verificación, correcciones)

- R2: se contrastaron las llamadas con las páginas oficiales del SDK de Open Payments para permisos de cobro y cotización, creación/consulta de cobros, cotización y creación/consulta de pagos salientes.
- R2: las pruebas locales del servicio simulan cotizaciones parciales, rechazan el segundo pago secuencial de una misma cotización y leen la acumulación desde `incomingPayment.get`. La recuperación conserva un resultado desconocido y bloquea reenviarlo; no se ejecutaron pagos en esta revisión.
- R2: `apps/api/src/wallet/execute.test.ts` cubre en memoria el plan B: tres cobros independientes de COP 40.000, 3 de 3 aportes conciliados, recepción corta, fallo de un aporte y reintento solo del aporte faltante. Estas pruebas no sustituyen la verificación de Test Wallet.
- R2: existe un registro histórico de una prueba real anterior con EUR 2,00 debitados y EUR 1,00 recibidos, pero no conservó IDs ni permite conciliación retrospectiva. No se usa como evidencia de la primera cuota actual.

## Pendientes de R2

- Confirmar en una ejecución futura el `debitAmount` de la quote y conciliar por API con IDs persistidos, sin reutilizar ni adivinar los IDs de la prueba anterior.
- Ejecutar la estrategia elegida de un cobro por miembro solo después de que R1 confirme tres consentimientos/callbacks, se confirme una farmacia COP controlada y los dueños autoricen cada operación financiera.
- Verificar con datos reales las tres cotizaciones, especialmente el aporte EUR→COP, y persistir IDs saneados para la conciliación antes de reintentar cualquier resultado ambiguo.
- `distributeReturn` permanece sin implementar: el contrato actual no define destinatarios, importes por inversor ni estrategia de redondeo; debe acordarse con R3 antes de implementarlo.
- Acordar con R3 una clasificación estructurada de `failReason` sin inventar campos del contrato.

## Estado verificable de esta revisión

- La cotización COP → COP permite códigos iguales, convierte 40.000 COP a unidades menores según la escala receptora y nunca llama a `outgoingPayment.create` en las pruebas locales.
- Se añadieron regresiones locales para importes inválidos, escalas distintas, redondeo/truncamiento del porcentaje y el límite estricto del 5 %.
- Las pruebas de pagos parciales cubren cotizaciones independientes, rechazo secuencial de una cotización ya usada, lectura acumulada, vencimientos, recuperación con acceso de lectura y resultados desconocidos. No prueban concurrencia real ni garantizan idempotencia distribuida entre procesos.
- A las 08:48, `npm run typecheck` terminó con código 0; `npx vitest run apps/api/src/payments` terminó con 7 archivos y 54 pruebas aprobadas; y `npx vitest run apps/api/src/wallet/execute.test.ts` terminó con 18 pruebas aprobadas. No se ejecutaron operaciones financieras.
- A las 08:57, `npx vitest run apps/api/src/server.recheck.test.ts` terminó con código 0, un archivo y 3 pruebas aprobadas en un terminal autorizado. Cubre reconsulta de estados `completed` y `pending`, y HTTP 409 cuando un gasto anterior bloquea pagos nuevos. El fallo anterior fue `listen EPERM` del sandbox; no fue un fallo de lógica del servidor.
- `git diff --check` informa espacios finales en `prompts/R2.md`; son parte del registro local y no se corrigieron sin autorización.

## Evidencia real de la cotización R2

- Se ejecutó manualmente y con autorización `npm run op -- apps/api/src/payments/test-wallet.smoke.ts --quote-only`.
- Test Wallet informó pagador COP con escala 2 y farmacia COP con escala 2.
- La quote fue creada con `receiveAmount` de 4.000.000 unidades mínimas COP y `debitAmount` de 4.000.000 unidades mínimas COP.
- La conversión fue COP → COP, con diferencia de 0 COP, coste de 0,00 % y sin superar el 5 %.
- El modo utilizado no ejecutó ningún pago saliente; esta evidencia real es independiente de las pruebas locales con mocks.
- No se conservaron ni se documentan identificadores de recursos, tokens ni credenciales.

## Pendientes y coordinación

- `distributeReturn` continúa pendiente: el contrato actual no fija destinatarios, importes por inversor ni redondeo. Requiere una definición con R3 antes de implementarse.
- Los tests locales cubren el plan B de tres cobros separados, pero no verifican la red ni la idempotencia distribuida. Coordinar con R3 que la configuración real active el modo de cobro por aporte y que el motor conserve los intentos para consulta.
- Coordinar con R3/R5 una clasificación de `failReason` usando únicamente los campos existentes en el contrato; no se añadió ninguna interfaz nueva.
- R1 documentó que las uniones reales están preparadas, pero todavía no aprobadas; faltan las confirmaciones de R3, R4 y R5 para completar su trazabilidad de IA.
