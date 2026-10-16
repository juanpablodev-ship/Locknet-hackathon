# Verificación aislada R1: permiso para pagos futuros

Este experimento consulta la wallet de un miembro y solicita un permiso interactivo
`outgoing-payment`, acciones `read/create`, con `limits.debitAmount` y
`limits.interval`, sin `receiver`. No crea pagos ni implementa `MembersService`.

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
  Se admiten únicamente esa representación y Base64URL sin relleno, ambas
  canónicas. Se decodifican exactamente 32 bytes y se comparan con el único
  digest esperado mediante `timingSafeEqual`. No se prueban otras bases del hash.

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

Se importa `Money` y se deriva la entrada del hash del contrato `Guardian`;
no se redefinen contratos. La comprobación local del hash no es una integración
de R5: cuando exista su implementación, el servicio de miembros deberá usarla.
No se ha implementado almacenamiento, `startJoin`, `finishJoin`, cupo restante,
revocación por SDK ni permisos con destinatario.

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
