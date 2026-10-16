# Open Sentinels

Verificaciones de seguridad abiertas para cualquier app que mueva dinero con Open Payments.

Son funciones puras en TypeScript: reciben datos y devuelven un veredicto. Sin red, sin dependencias.

## ¿Para quién es?

- Nació para proteger nuestra billetera compartida, donde la plata de varios se mueve en cada gasto.
- Sirve igual para cualquier proyecto que use Open Payments: una natillera, una colecta para una donación, una tienda que cobra a varios clientes.
- Se usa sin nuestra billetera: no importa nada de ella (ver el ejemplo sobre el snippet oficial).

## Qué devuelve

**No adivina: explica.** Cada veredicto trae `userMessage` (para la persona) y `reasons` (el detalle técnico).

```ts
type Verdict = { check; status: 'pass' | 'warn' | 'block'; riskPoints: number; userMessage: string; reasons: string[] }
```

## Las 6 funciones

| Función | Qué detecta | Qué devuelve |
|---|---|---|
| `verifyInteractionHash` | Que la redirección del banco no sea auténtica (hash de interacción) | `block` si no coincide o falta un dato; `pass` si coincide |
| `checkGrantRequest` | Permisos abusivos: sin tope, tope exagerado, sin intervalo o con intervalo mal formado | `pass` o `warn` con puntos (nunca `block`) |
| `checkDestination` | Destinos parecidos a uno conocido, destinos nuevos y destinos sin HTTPS | `block` sin HTTPS; `warn` 94 si se parece; `warn` 20 si es nuevo; `pass` si es conocido |
| `checkQuote` | Comisión anormal en una cotización | `block` si el costo extra supera `maxFeePercent`; `pass` si no |
| `reconcile` | Que haya llegado lo cotizado | `pass` si llegó todo; `warn` si llegó menos o no se pudo comparar |
| `riskScore` | Puntaje de 0 a 100 a partir de los veredictos | Un número: cualquier `block` da 100; si no, suma con tope 100 |

## Ejemplo: 3 líneas sobre el snippet oficial

El snippet oficial de continuación deja la verificación en `@TODO`. Con Open Sentinels:

```ts
// Guardián: verifica que el retorno viene del banco (el snippet oficial lo deja en @TODO)
const v = guardian.verifyInteractionHash({ clientNonce, interactNonce, interactRef, grantUri, hash })
if (v.status === 'block') throw new Error(v.userMessage)
```

Ejemplo completo: [`examples/official-snippet.ts`](examples/official-snippet.ts). `grantUri` debe ser la URL exacta usada en `grant.request` (`walletAddress.authServer`).
En la Test Wallet, `walletAddress.authServer` ya incluye el tenant que Rafiki usa en el hash.

El ejemplo necesita `@interledger/open-payments` instalado (en este repo ya lo trae `apps/api`). La librería no tiene dependencias.

## Cómo correr las pruebas

Desde la raíz del repositorio:

```bash
npx vitest run packages/guardian
npx tsc --noEmit
```

## Lo que NO hace

- **No detecta todo el fraude.** Da advertencias verificables, cada una con una prueba que la respalda.
- **Entre monedas distintas solo compara la comisión si recibe `referenceRate`.** Sin ella, `checkQuote` no bloquea.
- **El hash es defensa en profundidad.** El banco igual valida `interact_ref`; Open Sentinels añade una capa que el SDK oficial de Node no incluye.
