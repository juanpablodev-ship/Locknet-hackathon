# Reglas para agentes de IA en este repositorio

## Proyecto
Billetera compartida que no guarda dinero (Open Payments) + "guardián", una librería
abierta de verificaciones de seguridad. Plan completo: /docs/plan-v6.md.

## Antes de cada tarea
1. Pregunta (o lee del primer mensaje) qué rol tiene tu usuario: R1, R2, R3, R4 o R5.
2. Agrega el prompt del usuario, TEXTUAL y completo, a /prompts/<ROL>.md con la hora
   (formato: "### HH:MM" + el prompt). Es obligatorio por las reglas del hackatón.
   Si el prompt contiene una llave, token o URL privada, reemplázala por [REDACTADO].
   Si la tarea toca Open Payments, agrega debajo del prompt una línea
   "Fuente: <ruta en ../open-payments-snippets> | <enlace a la guía>" (tabla de abajo).
   Si no hay snippet, escribe "Fuente: sin snippet | <enlace a la guía>".
3. Propón un plan corto (máx. 5 pasos) y espera aprobación antes de escribir código.

## Carpetas por rol (solo puedes modificar la de tu rol)
- R1: /apps/api/src/members, /mocks/members.mock.ts, /demo, /fixtures
- R2: /apps/api/src/payments, /mocks/payments.mock.ts, /fixtures, AI_USAGE.md
- R3: /apps/api/src/wallet, /apps/api/src/server.ts, /contracts
- R4: /apps/web, /mocks/api.mock.ts
- R5: /packages/guardian, /mocks/guardian.mock.ts
Si necesitas cambiar otra carpeta o /contracts: DETENTE y dile al usuario que lo pida a
la persona dueña. No lo hagas tú.

## /contracts manda
- Usa exactamente los tipos de /contracts. No los copies ni los redefinas.
- Si algo del contrato no alcanza, dilo; no inventes campos.

## Open Payments: prohibido inventar la API
- Usa solo el SDK oficial `@interledger/open-payments`.
- Antes de escribir una llamada, busca el ejemplo equivalente en ../open-payments-snippets
  o en https://openpayments.dev/es/ y cita qué archivo o página usaste.
- Si no encuentras un ejemplo, dilo. No adivines nombres de métodos ni parámetros.

### Fuentes por flujo (snippets en ../open-payments-snippets)
| Flujo | Snippet oficial | Guía |
|---|---|---|
| Cliente autenticado | wallet-address/wallet-address-get.ts | https://openpayments.dev/es/overview/getting-started/ |
| Flujo completo de ejemplo | examples/payment-flow.md | https://openpayments.dev/es/overview/getting-started/ |
| Unirse: permiso saliente sin destinatario con tope e intervalo (R1) | grant/grant-outgoing-payment-interval.ts | https://openpayments.dev/es/guides/outgoing-grant-future-payments/ |
| Volver del banco: continuar el permiso (R1) | grant/grant-continuation.ts (trae "@TODO: Verify hash") | https://openpayments.dev/es/identity/hash-verification/ |
| Verificar el hash de interacción (R5) | sin snippet | https://openpayments.dev/es/identity/hash-verification/ |
| Montos gastados del permiso / cupo (R1) | sin snippet | https://openpayments.dev/es/guides/outgoing-grant-future-payments/ |
| Permiso de un solo pago con limits.receiver (R1, 6.1) | sin snippet (base: grant/grant-outgoing-payment.ts) | https://openpayments.dev/es/guides/outgoing-grant-future-payments/ |
| Revocar permiso (R1) | grant/grant-revoke.ts | https://openpayments.dev/es/guides/outgoing-grant-future-payments/ |
| Crear cobro (R2) | grant/grant-incoming-payment.ts + incoming-payment/incoming-payment-create.ts | https://openpayments.dev/es/guides/onetime-remittance-fixed-receive/ |
| Cotizar con receiveAmount (R2) | grant/grant-quote.ts + quote/quote-create-receive-amount.ts | https://openpayments.dev/es/guides/onetime-remittance-fixed-receive/ |
| Pago saliente (R2) | outgoing-payment/outgoing-payment-create.ts | https://openpayments.dev/es/guides/onetime-remittance-fixed-receive/ |
| Seguir un pago saliente (R2) | outgoing-payment/outgoing-payment-get.ts | https://openpayments.dev/es/guides/onetime-remittance-fixed-receive/ |
| Lo recibido en el cobro (R2) | incoming-payment/incoming-payment-get.ts | https://openpayments.dev/es/guides/split-payments/ |
| Completar un cobro (R2) | incoming-payment/incoming-payment-complete.ts | https://openpayments.guide/apis/resource-server/operations/complete-incoming-payment |

## Seguridad
- Nunca escribas llaves, tokens ni access tokens en el código, logs, pruebas ni /prompts.
- Se leen de variables de entorno (.env). Los tokens de los miembros no salen del servidor.
- El guardián (/packages/guardian) no importa NADA de /apps. Funciones puras, sin red.

## Lenguaje en la interfaz
- Decir "cupo autorizado" o "cupo del grupo", nunca "saldo".
- Decir "aprobación del grupo", nunca "multifirma" a secas.
- Nunca mostrar "pagado" sin que reconcile() lo confirme.

## Calidad
- Cambios pequeños. Cada función nueva con al menos una prueba que pasa y una que falla.
- Corre las pruebas antes de decir que terminaste y muestra la salida.
- Stack: TypeScript + Node, Express, SSE, SQLite o JSON, HTML/CSS simple.
