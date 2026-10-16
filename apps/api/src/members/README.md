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
  separados con LF, sin LF final; SHA-256 y Base64URL sin relleno.
  Se prueba el vector publicado. El fragmento `digest('base64')` de la página
  difiere de la codificación del vector y del RFC; aquí se sigue Base64URL.

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
