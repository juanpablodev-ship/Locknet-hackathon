# Verificación aislada R1: permiso para pagos futuros

Este experimento consulta la wallet de un miembro y solicita un permiso interactivo
`outgoing-payment`, acciones `read/create`, con `limits.debitAmount` y
`limits.interval`, sin `receiver`. No crea pagos. El módulo `members.service.ts`
implementa el contrato `MembersService` completo con Open Sentinels real.

## Fuentes verificadas

- [Guía oficial de pagos futuros](https://openpayments.dev/guides/outgoing-grant-future-payments/), pasos 1–5:
  `walletAddress.get({ url })`, `grant.request({ url: wallet.authServer }, body)` y
  `grant.continue({ url, accessToken }, { interact_ref })`.
- [Creación de permisos con intervalo](https://openpayments.dev/sdk/grant-create-outgoing/):
  `createAuthenticatedClient({ walletAddressUrl, privateKey, keyId })` y retorno local.
- SDK instalado `@interledger/open-payments` **7.4.0**, declaraciones en
  `node_modules/@interledger/open-payments/dist/client/{index,grant}.d.ts`:
  el SDK agrega la identidad del cliente firmante; no se usa la wallet del miembro
  como identidad del cliente. `logLevel: 'silent'` desactiva sus logs.
- [Hash Open Payments](https://openpayments.dev/identity/hash-verification/) y
  [RFC 9635 §4.2.3](https://www.rfc-editor.org/rfc/rfc9635.html#section-4.2.3):
  nonce del cliente, nonce del servidor, referencia y URL **exacta de grant.request**,
  separados con LF, sin LF final; un único SHA-256. Se prueba el vector publicado.
  El RFC usa Base64URL sin relleno; el fragmento `digest('base64')` de la página
  usa Base64 estándar con relleno.
- [Rafiki: redirección del callback](https://github.com/interledger/rafiki/blob/68c11dc32742127bb96767ccbd85e9775bc31646/packages/auth/src/interaction/routes.ts)
  y [sus pruebas](https://github.com/interledger/rafiki/blob/68c11dc32742127bb96767ccbd85e9775bc31646/packages/auth/src/interaction/routes.test.ts),
  revisión `68c11dc32742127bb96767ccbd85e9775bc31646`: `handleFinishableGrant`
  construye los mismos cuatro campos y usa Base64 estándar con relleno.
  Open Sentinels admite esa representación y Base64URL sin relleno y hace la
  comparación segura del digest. R1 ya no calcula ni normaliza hashes por su cuenta.

No hace falta clonar snippets para esta prueba: las páginas oficiales anteriores
son la referencia. Si se clonan, deben ir fuera del repositorio.

## Configuración local

Desde la raíz, usa `.env` (ignorado por Git). Copia `.env.example` si aún no existe,
sin sobrescribir una configuración existente. Completa localmente:

- `WALLET_ADDRESS`: wallet del cliente/plataforma que firma.
- `KEY_ID`: identificador de su llave en Developer keys.
- `PRIVATE_KEY_PATH`: ruta local a su llave; por defecto `private.key`.
- `MEMBER_WALLET_ADDRESS`: wallet del miembro que dará consentimiento.
- `MEMBER_CAP`: entero positivo en unidades mínimas de la moneda de ese miembro.
- `MEMBER_INTERVAL`: intervalo finito, por ejemplo `R3/2026-10-16T00:00:00Z/P1M`.
  El inicio debe corresponder al período que quieres verificar. Este experimento
  admite `Rn/fecha-UTC/P1M` y `Rn/fecha-UTC/P1D` (n positivo).
- `MEMBERS_VERIFY_PORT`: opcional, `3344` por defecto.

No pegues credenciales en prompts, comandos, pruebas ni archivos versionados.
La llave debe pertenecer a la wallet del cliente y estar registrada allí.

## Ejecutar el flujo real

```powershell
npm run op -- apps/api/src/members/verify-outgoing-grant.ts
```

1. Abre la URL local `/start` indicada por la consola, en este mismo portátil.
2. El servidor consulta la wallet y te redirige a la autorización de la Test Wallet.
3. Comprueba que el consentimiento muestra el cupo autorizado y la periodicidad
   que configuraste; aprueba o rechaza tú mismo.
4. Al regresar a `http://localhost:3344/finish`, el servidor comprueba estado,
   hash, vencimiento y uso único antes de continuar la concesión. Respeta `continue.wait`.
5. Solo muestra éxito si la concesión final contiene exactamente la wallet,
   acciones, tope, moneda e intervalo solicitados, sin destinatario.

El servidor solo escucha en `127.0.0.1`. Mantén `localhost` en la URL del navegador.
Se cierra al terminar, al fallar o después de diez minutos. Si falla, reinicia el
script: no hay reintento automático ni un resultado de éxito simulado.
Los fallos muestran solo una etiqueta fija de etapa: `wallet-query`/`wallet-response`,
`grant-request`/`grant-response`, `interaction-state`, `callback-state`,
`callback-hash`, `continuation-wait`, `grant-continuation`, `final-grant` o
`limits-wallet`/`limits-actions`/`limits-recipient`/`limits-interval`/`limits-debit`.
La etiqueta identifica dónde falló; no contiene valores recibidos ni el error
original del SDK. No se omite ninguna validación para conseguir éxito.
El navegador no recibe tokens; tampoco se imprimen URLs de autorización,
referencias, hashes, respuestas completas ni errores del SDK. Los tokens quedan
en memoria del servidor y se descartan al terminar. El permiso puede seguir
existiendo en la wallet: revócalo allí cuando termines el experimento.

## Pruebas e integración pendiente

```powershell
npm test -- apps/api/src/members/verify-outgoing-grant.test.ts
npm run typecheck
npm test
```

Las pruebas usan un SDK simulado y HTTP local. Verifican formas de solicitud,
éxito y rechazo por función, hash conocido, campos alterados, retorno repetido,
vencimiento, concesión no final y permisos modificados. **No prueban aceptación
real de la Test Wallet ni recarga mensual efectiva**. Obtener una concesión real
tampoco demuestra que existan fondos o que un pago vaya a completarse.

Se importan los tipos compartidos; no se redefinen contratos. El servicio usa
el objeto `guardian` real de `packages/guardian/src/index.ts` (paquete
`open-sentinels`), sin `guardian.mock`. La función de hash es síncrona y devuelve
`Verdict`; solo `status === 'pass'` permite continuar. El adaptador booleano del
experimento también delega en Open Sentinels, sin criptografía duplicada.

## Integración de startJoin y finishJoin para R3

`createMembersJoinService(client, options)` devuelve exactamente
`MembersService` de `/contracts`.
`client` es el cliente autenticado del SDK
oficial, creado en el servidor con logging silencioso y timeout de red.

Opciones que debe aportar el servidor:

- `finishUri`: URI de retorno de la aplicación, sin query ni fragmento; HTTPS
  (se permite HTTP solo para `localhost` en desarrollo).
- `policy.maxCap`: política confiable del grupo para `guardian.checkGrantRequest`.
- `sessionId`: identificador de la sesión autenticada a la que pertenece esta
  instancia. Nunca debe proceder de los parámetros del callback.
- `currentSessionId`: consulta de la sesión válida del contexto de la petición
  actual; debe devolver `undefined` si fue cerrada o revocada. Debe consultarse
  desde el middleware/almacén de sesiones, por ejemplo mediante contexto de
  petición `AsyncLocalStorage`, nunca desde una variable global que comparta
  peticiones concurrentes ni desde una petición antigua capturada en un cierre.
- `now`: reloj opcional para pruebas; producción usa `Date.now`.
- `store`: handle de `createMembersStore()` (módulo `member-operations.ts`). Debe
  compartirse entre todas las instancias de sesión y con las operaciones de R2;
  si se omite, la instancia queda aislada por compatibilidad.

R3 debe conservar la instancia en el servidor y seleccionar la correspondiente
mediante la sesión autenticada del navegador; no crear otra en el callback ni
seleccionarla únicamente por `state`. El adaptador HTTP debe rechazar parámetros
duplicados antes de convertirlos a los tres strings de `finishJoin`.

`startJoin(walletId, member)` consulta la wallet, verifica moneda y escala,
obtiene el aviso del guardián real y solicita el permiso. Devuelve solo la URL de
consentimiento y el aviso del contrato. El aviso debe mostrarse al usuario.
Los datos originales (grupo, miembro, wallet, nonces, URI exacta de grant,
continuación y token) quedan en un mapa privado del servidor, con diez minutos
de vigencia. Una segunda solicitud pendiente se rechaza y no reemplaza la primera.

`finishJoin({ interactRef, hash, state })` valida la sesión y recupera la interacción
original por su estado aleatorio. Consume el registro antes de cualquier await,
incluidos los intentos con hash inválido. Invoca directamente a través de la
primitiva compartida `guardian.verifyInteractionHash` con los cinco campos del
contrato. Si el resultado no es `pass`, no llama a `grant.continue` ni devuelve
un miembro activo. Después respeta `continue.wait`, vuelve a validar la sesión,
continúa y comprueba los límites exactos. Solo entonces devuelve `Member` activo
y el veredicto real; el token y la URI de gestión quedan privados en memoria.
No se registra la URL del callback ni se devuelve la concesión por HTTP.

El almacenamiento compartido es en memoria (igual que el motor actual): reiniciar
el proceso pierde interacciones y concesiones. No se agregó infraestructura ni
se escriben tokens en disco. `listMembers(store)` devuelve copias públicas y
`resetMembersStore(store)` borra únicamente estado local, invalida callbacks y
operaciones en vuelo y NO revoca permisos externos.

R2 recibe `createMemberOperations(client, store)` del servidor. `tokenFor(id)`
consulta el cupo al proveedor, rechaza permisos no activos, vencidos, bloqueados,
en revocación o agotados y devuelve el token solo al código servidor. No se debe
conectar esta operación a HTTP, SSE, consola ni JSON de errores. El token es una
capacidad de pago: existe una carrera inevitable si el proveedor lo revoca o lo
gasta otro consumidor después de la consulta; R2 debe manejar el rechazo del pago.

`available(id)` usa exclusivamente
[`outgoingPayment.getGrantSpentAmounts`](https://openpayments.dev/sdk/outgoing-grant-spent-amounts/)
con `wallet.resourceServer` y el token del grant final. Resta `spentDebitAmount`
al tope con `BigInt`, valida moneda y escalas y redondea hacia abajo a la escala
del cupo cuando hace falta. `null` significa que no se informó gasto. No hay
respaldo automático con registros locales ni gastos de períodos anteriores.
Si cambia el período durante la consulta, rechaza la respuesta y exige consultar
otra vez. Los errores del proveedor no se convierten en un cupo ficticio.

Alcance de intervalos: `R[n]/fecha-UTC/P1D` o `P1M`. El inicio mensual se limita a
días 1–28 para no inventar cómo resuelve el proveedor fechas ambiguas de fin de
mes. Otras duraciones se rechazan explícitamente. La consulta del proveedor es
siempre del período vigente; las pruebas de renovación usan reloj y red simulados,
sin afirmar una renovación mensual observada en la Test Wallet.

`revoke(id)` usa [`grant.cancel`](https://openpayments.dev/sdk/grant-revoke/) con
la URI y el token de `grant.continue` de la respuesta FINAL. No usa
`access_token.manage` (corresponde a gestión de tokens, otra operación del SDK).
Mientras cancela, `tokenFor` queda bloqueado; una cancelación confirmada marca
`revoked` y elimina los tokens del registro. Llamadas concurrentes comparten la
cancelación y repetir una ya confirmada no hace otra llamada. Si el proveedor
falla, se mantiene el bloqueo local y se permite reintentar `revoke` explícitamente;
no se afirma que el permiso externo haya sido revocado. Reiniciar un almacén
en memoria no equivale a revocar en la wallet.

La persistencia durable sigue pendiente de un acuerdo de almacenamiento con R3.
Esta tarea no modifica `server.ts`: conectar sus handlers y las sesiones le
corresponde a R3. El script aislado sigue comprobando el permiso con el mismo
guardián real; no sustituye la prueba HTTP del producto con sesión autenticada.

La integración automatizada usa Open Sentinels real y simula únicamente la red
del SDK. Prueba hash correcto en ambos formatos, hash alterado, sesión y estado
inválidos, vencimiento, repeticiones, concurrencia, sesión revocada durante la
espera, límites distintos, errores del SDK y ausencia de secretos en resultados.
El resultado histórico de abajo corresponde al experimento anterior. El ciclo
real del servicio se comprobó después, como se registra al final de este archivo.

Comprobación de esta integración: 59 pruebas de R1 (23 del servicio nuevo y 36
del experimento), 262 en el repositorio, `typecheck` y `git diff --check`.
Las pruebas espían la función real sin sustituirla, comprueban sus cinco
parámetros y el orden anterior a `grant.continue`, y verifican que un rechazo
del hash no invoca la continuación ni devuelve un miembro activo.

## Registro de verificación real — 16 de octubre de 2026, Colombia

El reintento con diagnósticos llegó al callback y superó las comprobaciones de
estado, vigencia y parámetros únicos, pero fue rechazado en `callback-hash`.
No se llamó a `grant.continue` y no se confirmó la concesión. En ese intento aún
no se había identificado la causa del rechazo.

Las 31 pruebas de R1 y las 133 del repositorio pasaron, junto con `typecheck`.
Son comprobaciones automatizadas con datos sintéticos, separadas del resultado
real fallido. No se realizó un pago ni se probó la renovación mensual.

El diagnóstico posterior reprodujo un rechazo previo a la comparación: `%3D`
se decodifica como `=` y el filtro anterior solo admitía 43 caracteres Base64URL
sin relleno. Esto excluía el Base64 estándar con padding producido por el código
público de Rafiki. La corrección valida el alfabeto, longitud y round-trip de
la codificación antes de comparar bytes. Rechaza alfabetos mezclados, padding
incorrecto, bits de padding no canónicos, espacios, doble escape y hashes
alterados. `URLSearchParams` decodifica una sola vez; no se convierten espacios
en `+` ni se modifica ningún nonce, referencia o URI para intentar coincidencias.

También se probaron LF frente a CRLF, salto final, orden de nonces, URI distinta,
callbacks de otra solicitud y una segunda apertura de `/start` (se rechaza sin
reemplazar la solicitud).

### Resultado real confirmado — 12:41, hora de Colombia

Tras aplicar la normalización estricta de codificación, se generó una solicitud
nueva y el usuario autorizó en su navegador. El proceso real imprimió:

> Permiso confirmado: sin destinatario, con cupo autorizado e intervalo; hash válido.

Ese resultado se emite únicamente después de comprobar el callback y el hash,
continuar la concesión mediante el SDK y validar exactamente la wallet del
miembro, las acciones `read/create`, el tope, la moneda y el intervalo, sin
destinatario. El usuario confirmó el mismo resultado visible en su navegador.
No se guardaron tokens, valores de configuración, nonces, referencias, hashes
reales ni la URL del callback.

La verificación real confirma el permiso; **no se realizó un pago y no se probó
la renovación mensual**. Las pruebas automatizadas siguen siendo sintéticas y
no sustituyen esta autorización. Después del resultado se ejecutaron las 36
pruebas de R1, las 138 del repositorio, `typecheck` y `git diff --check`.
En esta ejecución la terminal siguió ocupada después de la confirmación y se
cerró el proceso con Ctrl+C. Si sucede, ciérralo tras comprobar el mensaje de
éxito; no abras `/start` nuevamente para comprobar una concesión ya confirmada.

## Entrega de operaciones, demo y P2 — 16 de octubre de 2026

### Resultado real del servicio — 16:13 Colombia

Se ejecutó `npm run op -- apps/api/src/members/verify-members-lifecycle.ts`.
El usuario autorizó en su navegador y pulsó la revocación explícita. El ejecutor
confirmó `finishJoin` con Open Sentinels, continuación y límites exactos; después
`tokenFor`, `available` mediante consulta real de montos gastados, `grant.cancel`
y el rechazo posterior de `tokenFor`. No hubo pago ni renovación mensual observada.
La consulta devolvió ambos montos gastados como `null`: se comprobó la consulta,
no el descuento de un pago real.

La evidencia saneada está en `/fixtures/members.real.sanitized.json`, con fecha,
montos permitidos y resultados booleanos. No contiene identidades, concesiones,
tokens, nonces ni callback. Un primer intento confirmó unión y cupo pero el
formulario rechazó `Origin: null`: `no-referrer` puede producirlo en POST de
formularios. Se cambió a `Referrer-Policy: origin`, que conserva solo el origen
sin ruta ni parámetros. Siguen rechazándose origen ausente, `null` o ajeno.
El intento nuevo confirmó también la revocación. Tras los mensajes de éxito,
se cerró con Ctrl+C el proceso que mantenía ocupada la terminal; la grabación
se había escrito y el servidor local ya había terminado su flujo.

Para repetir: configura las variables anteriores, ejecuta el comando del ciclo,
abre `http://localhost:3344/start` y autoriza tú. Al volver, pulsa el botón de
revocación solo si deseas cancelar ese permiso nuevo. «Finalizar sin revocar»
deja vigente el permiso externo. No abras `/start` otra vez en el mismo proceso.
Este servidor local sirve para verificar R1; no son las rutas de producto de R3.

### Confirmación con destinatario fijo (P2)

`startWalletConfirm(memberId, { incomingPaymentUrl, debit })` exige un miembro
utilizable y sesión válida. Solicita un grant interactivo NUEVO con
`limits.receiver` igual al cobro y `limits.debitAmount` exacto, SIN intervalo.
La referencia usada es el [snippet oficial base](https://github.com/interledger/open-payments-snippets/blob/main/grant/grant-outgoing-payment.ts)
y el esquema oficial instalado de SDK 7.4.0:
`dist/openapi/specs/auth-server.yaml`, componentes `receiver` y `limits-outgoing`.
La guía de [pagos futuros](https://openpayments.dev/guides/outgoing-grant-future-payments/)
documenta solicitud interactiva y continuación. No se inventaron métodos del SDK.

`finishWalletConfirm` recupera la interacción del servidor, comprueba sesión,
estado, vencimiento y uso único; verifica el hash mediante Open Sentinels antes
de continuar y exige destinatario, monto, moneda, escala y acciones exactos.
Rechaza un token igual al mensual. El token específico que exige el contrato
es exclusivamente para R2 en el servidor: R3 debe omitirlo de HTTP/SSE/logs.
`revoke` cancela también las concesiones específicas conservadas; si una falla,
mantiene bloqueo local y el siguiente reintento sigue con las pendientes.

P2 solo se probó automáticamente con Open Sentinels real y red del SDK simulada.
El usuario no dispone aún del cobro vigente de R2. Falta comprobar en Test Wallet
que acepte `receiver` y muestre el destino al autorizar. Mantener
`confirmInWallet: false` en el producto hasta esa prueba y la integración R2/R3.
El contrato actual de `PaymentsService.payShare` no recibe un token específico:
R2/R3 deben acordar cómo consumir esa capacidad en servidor con R3, dueño del
contrato. No se modificó `/contracts` ni se sustituyó por el token mensual.

### Demo, almacenamiento y solicitudes de integración

`/mocks/members.mock.ts` implementa el contrato completo con casos activo,
revocado, agotado y error de proveedor; sus capacidades son marcadores de
simulación sin validez en Open Payments. Ningún flujo real importa este mock.
`/demo` aporta semillas tipadas de las tres billeteras, reinicio local y adaptador
de respaldo. Los casos parque/panadería son configuraciones: esto no acredita
que el motor haya pasado la puerta de calidad del plan.

R3 debe agregar `"demo:reset": "tsx demo/reset.ts"` a `package.json`.
El comando prepara solo `demo/state.json`; para reiniciar la app activa debe
invocar `resetDemo(store)` dentro de su proceso, recrear su motor y cargar las
semillas. No cancela permisos, no borra credenciales y no debe hacerse durante
pagos en vuelo. Consultar `/demo/README.md` para conectar `DEMO_MODE=fixtures`.
El respaldo reproduce montos gastados reales grabados, con consentimientos y
miembros simulados y etiqueta explícita; faltan grabaciones de pagos de R2 y
conexión del modo en R3/R4. No es una consulta actual al proveedor.

El almacén sigue en memoria y compartido por handle; reiniciar pierde los datos
y NO revoca grants externos. No hay almacenamiento de tokens en archivos.
No se incorporó una infraestructura de persistencia sin acuerdo del equipo.

| Responsabilidad R1 | Entrega | Evidencia / pendiente |
|---|---|---|
| Cliente autenticado y wallet | Completada | Test Wallet, configuración local ignorada |
| Unión sin destinatario, tope e intervalo | Completada | Test Wallet, límites exactos |
| `checkGrantRequest` y hash real antes de continuar | Completada | Open Sentinels real, pruebas y Test Wallet |
| `tokenFor` interno | Completada | Test Wallet y rechazo tras revocar; R2 debe conectarlo |
| `available` con gasto y escalas enteras | Completada | Consulta real sin gasto; descuento y escalas automatizados |
| Renovación de período | Implementada en alcance P1D/P1M | Solo reloj/red simulados; no renovación real observada |
| Revocación | Completada | `grant.cancel` real y token bloqueado; errores/reintentos automatizados |
| Mock contractual | Completada | Pruebas activo, revocado, agotado y error |
| Conservación de miembros y grants | Completada en memoria | Persistencia durable pendiente de acuerdo con R3 |
| Semillas y reset | Implementados | Pruebas; R3 debe añadir script y conectar reset de app |
| Modo respaldo | Parcial | Adaptador y gastos reales saneados; faltan fixtures de R2 y conexión R3/R4 |
| P2 con destinatario fijo | Implementada y probada automáticamente | Cobro vigente de R2 y consentimiento real pendientes |
| HTTP/sesiones y eventos del producto | Pendiente R3 | El servidor local de prueba no acredita esta integración |
| Demo con ≥2 miembros, EUR y pago conciliado | Pendiente conjunta | Requiere integración R2/R3/R4 y prueba de extremo a extremo |

R1 no se declara completo mientras sigan pendientes estas integraciones y pruebas.

Mensaje para R3: «Comparte un `createMembersStore()` entre las instancias de sesión
de `createMembersJoinService` y R2. Conecta sesiones, callback con parámetros
únicos y eventos sin secretos; nunca serialices `tokenFor` ni el token P2.
Agrega el script demo:reset indicado y conecta el respaldo con su etiqueta.
No actives confirmInWallet hasta la verificación real de P2.»

Mensaje para R2: «Usa `createMemberOperations(client, store)` con el mismo handle
del servidor: `tokenFor(id)` y `available(id)` consultan el proveedor y rechazan
permisos no utilizables. Maneja rechazo de pago aunque la consulta previa pase.
Entrega un cobro vigente para probar P2 y fixtures saneadas de cobro, cotización,
pago y conciliación. Acordemos con R3 el consumo del token específico; no uses
el token mensual para representar esa aprobación.»
