# Plan de trabajo v6 — Billetera compartida + Guardián

> **Proyecto:** una billetera compartida que no guarda dinero, protegida por un guardián que cualquier app de Open Payments puede usar
> **Nombres tentativos:** billetera *Pacto* · guardián *Pacto Guard* (decidir con el equipo; no se ha verificado disponibilidad comercial)
> **Equipo:** 5 personas · **Evento:** 16 y 17 de octubre de 2026 · RutaN, Medellín
> **Categoría objetivo:** **Innovación** (principal) · **Impacto** (respaldo) · **Comunidad** (si la librería sale con README, pruebas y ejemplo)

> **Qué cambió frente a la v5** (tras la evaluación externa del equipo y las pruebas en la Test Wallet):
> 1. **Un caso prioritario, no un caso único.** "Cuidado de mamá" se construye primero y de punta a punta. El parque y la panadería **también se construyen**, pero después y sobre el mismo motor: son la misma billetera con otras reglas.
> 2. **Lenguaje financiero preciso:** se habla de **"cupo autorizado"**, no de "saldo". Un permiso no prueba que haya fondos.
> 3. **Aprobación honesta:** se llama **"aprobación del grupo"** (inspirada en la multifirma), no multifirma criptográfica. Novedad: **confirmación en la wallet** para gastos de riesgo (sección 6.1).
> 4. **Pagos parciales visibles:** "2 de 3 aportes confirmados". Nada se marca "pagado" sin la conciliación del guardián.
> 5. **El guardián no se presenta como infalible:** da advertencias verificables.
> 6. **Monedas:** COP como base y **un solo miembro en EUR** (ya verificado en la Test Wallet).
> 7. **Plan de respaldo** si la Test Wallet falla durante la presentación.

---

## Índice

1. [La idea en una frase](#1-la-idea-en-una-frase)
2. [Datos clave del evento](#2-datos-clave-del-evento) · [2.1 Verificado en la Test Wallet](#21-verificado-en-la-test-wallet-jueves-15)
3. [Las dos piezas y cómo se complementan](#3-las-dos-piezas-y-cómo-se-complementan)
4. [La billetera compartida](#4-la-billetera-compartida)
5. [El guardián](#5-el-guardián)
6. [Dónde actúa el guardián dentro de la billetera](#6-dónde-actúa-el-guardián-dentro-de-la-billetera)
7. [Por qué explota el potencial de Open Payments](#7-por-qué-explota-el-potencial-de-open-payments)
8. [Qué existe y en qué nos diferenciamos](#8-qué-existe-y-en-qué-nos-diferenciamos)
9. [Límites honestos](#9-límites-honestos)
10. [Arquitectura](#10-arquitectura)
11. [Contrato técnico](#11-contrato-técnico)
12. [Flujos de Open Payments](#12-flujos-de-open-payments)
13. [Roles independientes](#13-roles-independientes)
14. [Cómo trabajamos sin depender unos de otros](#14-cómo-trabajamos-sin-depender-unos-de-otros)
15. [Cronograma](#15-cronograma)
16. [La demo](#16-la-demo)
17. [Prioridades y recortes](#17-prioridades-y-recortes)
18. [Guion del pitch (5 minutos)](#18-guion-del-pitch-5-minutos)
19. [Preguntas difíciles del jurado](#19-preguntas-difíciles-del-jurado)
20. [Cumplimiento y entrega](#20-cumplimiento-y-entrega)
21. [Reglas para trabajar con agentes de IA](#21-reglas-para-trabajar-con-agentes-de-ia)
22. [Riesgos y mitigaciones](#22-riesgos-y-mitigaciones)
23. [Checklist de hoy (jueves)](#23-checklist-de-hoy-jueves)
24. [Fuentes](#24-fuentes)

---

## 1. La idea en una frase

**Construimos una billetera compartida que no guarda dinero, y para protegerla construimos un guardián que cualquier app de Open Payments puede usar.**

> *"Las billeteras compartidas de cripto obligan a meter tu dinero en una bóveda. La nuestra no tiene bóveda."*

> *"Varias personas. Sus propias billeteras. Un gasto compartido. Sin entregarle el dinero a un administrador."*

> *"Como es la plata de varios, cada gasto pasa por un guardián antes de salir."*

> *"Lo construimos para nuestra billetera, pero cualquier app de esta sala lo puede usar."*

---

## 2. Datos clave del evento

### Lugar y horarios

- **Dónde:** RutaN, Calle 67 # 52-20, Piso 2, Torre A, Aranjuez, Medellín.
- **Viernes 16:** 08:30–17:30 · hacking 10:30–14:00 y 15:00–17:30.
- **Sábado 17:** 07:00–17:30 · hacking 08:00–11:00.
- **Total de hacking real: ~9 horas.**

### Momentos críticos del sábado

| Hora | Qué pasa |
|---|---|
| **11:00** | **Cierre de código.** Push final a `main`. |
| 11:00–12:00 | Mentores revisan el código; otros revisan video y presentación. |
| **12:00** | Video y presentación subidos. |
| 12:00–13:00 | **Ronda 1:** 5 minutos por equipo. Pasan **12 equipos** por puntaje acumulado en los 8 criterios. |
| 14:30–15:30 | **Ronda 2** ante jurado con representantes de cada premio. Todos votan el Premio de la Comunidad. |
| 16:30–17:30 | Anuncio de ganadores. |

### Reglas que no se pueden romper

- Equipos de **4 a 5 personas** (cumplimos).
- **Todo el código se escribe durante los dos días.**
- **Ningún equipo puede ganar más de un premio.**
- Todos completan antes el **curso de Platzi** o la **Guía de Open Payments**.
- Presencial los dos días. Cada quien trae su portátil.

### Premios y nuestra apuesta

| Premio | Patrocinador | Qué busca | Cómo lo cubrimos |
|---|---|---|---|
| **Innovación** | FIND EAFIT | Pensamiento original, uso innovador de Open Payments | Billetera compartida sin bóveda + guardián que decide cuándo pedir aprobación del grupo |
| **Impacto** | RutaN | Mayor potencial de impacto real | Familias repartidas por el mundo, barrios, negocios pequeños |
| Inclusión | Puntored | Pagos más accesibles | Grupos informales sin que alguien guarde la plata; advertencias en español claro |
| Comunidad | This Week in Fintech | Votan los participantes | Guardián abierto que cualquier equipo puede usar (solo cuenta si se publica con README, pruebas y ejemplo) |

### Criterios y cómo los cubrimos

| Criterio | Cómo lo cubrimos |
|---|---|
| Definición del problema | Juntar plata en grupo obliga a que alguien la guarde; y cuando es plata de varios, un engaño afecta a todos |
| Uso de Open Payments | Permisos con tope y recarga, montos gastados, cobros con varios pagadores, cotizaciones, hash |
| Experiencia del usuario | Cupo del grupo, aprobaciones con un clic, advertencias claras, estado de cada aporte |
| Calidad técnica | Guardián como librería separada con pruebas; motor con estados claros |
| Presentación | El jurado aprueba (o rechaza) un gasto en vivo |
| Inclusión | Familias en varios países, barrios, personas con poca experiencia digital |
| Innovación | Lo que cripto prometió, con la cuenta de banco que la gente ya tiene, y protegido |
| Impacto | Remesas que pagan directo lo que se necesita; seguridad para todo el ecosistema |

### Entregables obligatorios

- Diapositivas (plantilla oficial de Google Slides).
- Enlace a la demo + **video de la demo**.
- Repositorio **público** en GitHub con todo el código en `main`.
- `AI_USAGE.md` en la raíz y carpeta `/prompts` con los prompts reales.
- **La demo debe mostrar:** solicitud de pago → autorización → ejecución → finalización exitosa.

## 2.1 Verificado en la Test Wallet (jueves 15)

| Prueba | Resultado | Consecuencia para el plan |
|---|---|---|
| Monedas disponibles | ✅ **EUR, USD y COP** | La historia es colombiana: farmacia y la mayoría de miembros en COP |
| Nombres personalizados de wallet | ✅ `farmacia-medellin`, `hermano_2` | El ataque con `farmacia-medel1in` es posible con wallets reales |
| Pago entre monedas | ✅ EUR → USD y COP → USD con tasa real, estado COMPLETED | Un miembro en EUR entra al P1 sin riesgo grande |
| Pagar un cobro desde otra cuenta | ✅ | El flujo cobro → pago funciona |
| Modo *send* / *receive* | ✅ *receive* = monto exacto recibido; quien envía paga la comisión | Cada aporte se cotiza con `receiveAmount` = su parte |
| Vencimiento de cobros | ⚠️ Los cobros creados desde la interfaz vencen | Crear el cobro **justo antes** de pagar, nunca con anticipación en la demo |
| Cobro con varios pagadores | ❓ No se pudo probar: la interfaz paga el cobro completo | Probar con código el viernes temprano. Plan B listo: un cobro por miembro |
| Permiso sin destinatario con intervalo | ❓ Requiere código | **Verificación crítica** del viernes 11:00 (R1) |
| Confirmación en la wallet con `limits.receiver` | ❓ Requiere código | Probar el viernes (R1). Si no muestra el destino, queda como aprobación en la app |

---

## 3. Las dos piezas y cómo se complementan

```
   BILLETERA COMPARTIDA  (el producto que ve la gente)
   cupo del grupo · reglas · aprobación del grupo · meta · inversión
                    │
                    ▼   usa en cada paso
   GUARDIÁN  (librería abierta, reutilizable)
   hash · destino parecido · permiso abusivo · cotización · conciliación · riesgo
                    │
                    ▼
   SDK OFICIAL DE OPEN PAYMENTS  →  TEST WALLET
```

**Analogía:** como Stripe y su sistema antifraude. Uno es el producto; el otro lo protege y también se ofrece por separado.

| La billetera sola… | El guardián solo… | Juntos… |
|---|---|---|
| Mueve plata de varios: un engaño afecta a todo el grupo | No tenía historia humana | El guardián protege algo concreto: la plata de una familia |
| Quien aprueba un gasto no sabe si el destino es falso | Necesitaba un caso real | La billetera prueba que el guardián funciona |
| Alguien podría crear una billetera pidiendo topes abusivos | Ya sabía revisar permisos | El guardián avisa antes de unirse a una billetera sospechosa |

**La pieza más elegante:** si el guardián detecta riesgo alto, **el gasto pasa a necesitar aprobación del grupo aunque sea pequeño**. La aprobación del grupo hace que nadie gaste solo; el guardián hace que nadie apruebe a ciegas.

---

## 4. La billetera compartida

### Inspiración: cripto

En cripto existen las billeteras compartidas (multifirma): varias personas controlan una bóveda y, para gastar, varios aprueban. El problema: **hay que meter la plata en la bóveda**, en cripto.

### Nuestra versión: sin bóveda

| Pieza | Cómo funciona |
|---|---|
| **Miembros** | Cada persona se une desde su banco y autoriza un **tope** (p. ej. $100.000 al mes). **No deposita nada** |
| **Cupo del grupo** | Suma de lo que le queda a cada miembro en su permiso. **Es capacidad de gasto autorizada, no dinero garantizado** |
| **Recarga** | Permisos mensuales: el cupo vuelve solo cada mes |
| **Gastos** | Cada aporte sale directo de la cuenta de cada miembro al destino, en su moneda |
| **Reglas** | Reparto · aprobación del grupo · meta todo o nada · retorno de inversión |

> **Regla de lenguaje (interfaz, diapositivas y pitch):** decir **"cupo autorizado"** o **"cupo del grupo"**. Nunca "saldo" ni "fondos disponibles". Decir **"aprobación del grupo, inspirada en la multifirma"**. Nunca "multifirma" a secas.

### Caso prioritario: "Cuidado de mamá"

1. Tres hermanos crean la billetera: Bogotá y Medellín en **COP**, Madrid en **EUR**. Cada uno autoriza **hasta $100.000 al mes** (o su equivalente).
2. **Cupo del grupo: $300.000.** Nadie depositó nada.
3. La medicina de doña Gloria (persona ficticia) cuesta $120.000 → **$40.000 de cada hermano**, directo a la farmacia (en COP).
4. Cupo: **$180.000**. El próximo mes vuelve a $300.000.
5. **Aprobación del grupo:** los gastos de más de $200.000, o con riesgo alto según el guardián, necesitan 2 de 3.

### Un motor, tres billeteras

**Prioridad, no exclusión.** Las tres billeteras se construyen. "Cuidado de mamá" va primero y **debe funcionar de punta a punta** (real, estable, pulida) antes de que se empiece cualquier otra. Las otras dos **no son productos nuevos**: son la misma billetera con otras reglas, así que reusan el motor, los pagos y el guardián.

| Orden | Billetera | Para qué | Reglas | Qué agrega al motor | Cuándo se construye |
|---|---|---|---|---|---|
| **1 – prioritaria** | **Cuidado de mamá** | Pagar juntos lo que necesita doña Gloria | Partes iguales · aprobación del grupo · recarga mensual | Nada: es la base | Viernes 11:00–16:30 |
| **2** | **Arreglo del parque** | Donar con "todo o nada" | Meta de vecinos antes de una fecha; si no, nadie paga | Regla `goal` (unas 60 líneas en el motor + barra de meta) | Viernes 16:30 en adelante, **solo si el caso 1 pasó la integración** |
| **3** | **Horno de la panadería** | Invertir entre amigos | 10% de cada venta se reparte hasta devolver el préstamo (entre conocidos) | `distributeReturn` + panel | Sábado 08:00–09:15 |

**Puerta de calidad:** el caso 2 empieza cuando el escenario de la medicina y el ataque pasaron 3 veces seguidas en `main`. El caso 3 empieza cuando el caso 2 funciona. Si el tiempo no alcanza, el caso que falte se muestra como **configuración en pantalla** ("misma billetera, otra regla") y se dice en voz alta que no está terminado.

**En el pitch:** la demo en vivo es "Cuidado de mamá". Los otros dos casos aparecen en unos **20 segundos** como prueba de que es una plataforma y no una app de un solo uso: *"Misma billetera, otra regla."*

### Ciclo de vida de un gasto

```
SOLICITADO ──► REVISADO POR EL GUARDIÁN ──► (riesgo alto o monto alto) ──► EN APROBACIÓN
     │                    │                                                    │
     │                    └──► (bloqueo duro, p. ej. hash falso) ──► BLOQUEADO  │
     │                                                                         ▼
     └──────────── (riesgo bajo y monto bajo) ──────────────────────────► APROBADO
                                                                               │
                                                                               ▼
                                                    PAGANDO ──► PAGADO (verificado)
                                                       │
                                                       └──► INCOMPLETO (algún aporte falló)
```

### Pagos parciales: la regla

- Mientras paga, la pantalla muestra cada aporte: **"2 de 3 aportes confirmados · falta Madrid"**.
- **Nunca** se muestra "pagado" sin que `reconcile` confirme lo que **llegó** al destino (no lo que se envió).
- Si un aporte falla: estado INCOMPLETO, con los aportes confirmados, el que falta y el motivo ("cupo insuficiente", "permiso revocado", "cobro vencido").
- Acción disponible: **reintentar el aporte que falta**. No se devuelven automáticamente los aportes ya hechos (eso se dice como límite).

---

## 5. El guardián

**Una librería en TypeScript, abierta, sin dependencias de la billetera.** Son funciones puras: reciben datos, devuelven un veredicto. Se puede usar en cualquier app que use el SDK oficial de Open Payments.

| Revisión | Qué detecta |
|---|---|
| `verifyInteractionHash` | Que la redirección del banco sea auténtica (la documentación lo marca como obligatorio y el SDK oficial de Node no lo implementa) |
| `checkGrantRequest` | Permisos abusivos: sin límite, tope exagerado, sin vencimiento |
| `checkDestination` | Destinos parecidos a uno conocido (`farmacia-medellin` vs `farmacia-medel1in`), destinos nuevos, sin HTTPS |
| `checkQuote` | Comisión o tasa anormal |
| `reconcile` | Que haya llegado lo cotizado |
| `riskScore` | Puntaje de 0 a 100 a partir de los veredictos |

**Evidencia propia (verificada por el equipo):** al buscar en el código de `@interledger/open-payments` y `@interledger/http-signature-utils`, no aparece ninguna función que calcule ni verifique el hash de interacción.

**Lo que se puede afirmar:** "el SDK oficial **de Node** no lo implementa". **No** "ningún SDK lo hace" ni "vulnerabilidad grave": el banco igual valida el `interact_ref`, así que es defensa en profundidad.

**El guardián no es infalible, y se dice así.** Da **advertencias verificables**: cada veredicto explica por qué (`reasons`), y cada regla tiene una prueba que lo demuestra. No promete detectar todo el fraude. La frase para el pitch: *"No adivina: explica. Y si duda, le pregunta al grupo."*

---

## 6. Dónde actúa el guardián dentro de la billetera

| Momento | Revisión | Qué ve la persona |
|---|---|---|
| **Antes de unirse** | `checkGrantRequest` | *"Esta billetera te pide autorizar hasta $5.000.000 sin límite de tiempo. Es mucho más de lo normal."* |
| **Al volver del banco** | `verifyInteractionHash` | Nada si todo está bien; si falla: *"No pudimos confirmar que vienes de tu banco. No te uniste."* |
| **Al pedir un gasto** | `checkDestination` | *"Esta cuenta se parece a la de la farmacia que usan siempre, pero no es la misma."* |
| **Al cotizar cada aporte** | `checkQuote` | *"A Laura le costaría 23% más de lo normal. Gasto detenido."* |
| **Después de pagar** | `reconcile` | Sello *"Gasto verificado"* en el historial |
| **Siempre** | `riskScore` | Riesgo alto → **el gasto exige aprobación del grupo** |

### 6.1 Novedad: confirmación en la wallet para gastos de riesgo (P2, depende de una verificación)

**El problema honesto:** la aprobación del grupo la aplica nuestra plataforma. No es una multifirma criptográfica: técnicamente, el permiso mensual de cada miembro permitiría el pago. Un juez con experiencia en cripto lo va a preguntar.

**La mejora:** cuando el riesgo es alto, la plataforma **no usa el permiso mensual**. Pide a los miembros que aprueban un **permiso nuevo solo para ese pago**:
- `limits.receiver` = la URL del cobro de ese destino exacto.
- `limits.debitAmount` = la parte exacta de ese miembro.
- Es interactivo: el miembro lo aprueba (o lo rechaza) **en la pantalla de su propia wallet**, donde ve el destino real.

**Lo que se puede afirmar:** *"Para gastos de riesgo, la confirmación no se queda en nuestra app: cada miembro ve el destino real en su wallet, y ese permiso solo sirve para ese pago."*

**Lo que NO se puede afirmar:** "es imposible que la plataforma pague sin aprobación". El permiso mensual sigue existiendo; lo que limita la pérdida máxima es su **tope**. Por eso los topes recomendados son pequeños.

**Condición:** R1 verifica el viernes temprano que la Test Wallet acepta `limits.receiver` y muestra el destino en la pantalla de consentimiento. Si no, se queda la aprobación en la app (P1) y esto se menciona como siguiente paso.

---

## 7. Por qué explota el potencial de Open Payments

| Superpoder | Dónde aparece |
|---|---|
| Dinero como el correo | Cada miembro usa su propio banco o billetera |
| Cada uno en su moneda | Hermanos en pesos y euros (verificado); farmacia en pesos |
| Permisos programables | Tope de cada miembro **sin destinatario** y **con recarga mensual**; permiso de un solo pago con destino fijo para gastos de riesgo |
| Saber cuánto queda | Consulta de **montos gastados** del permiso → cupo del grupo |
| Pagar sin custodiar | La plataforma nunca toca el dinero |
| Muchos a uno y uno a muchos | Varios pagan un cobro; las ventas se reparten entre varios |
| Consentimiento verificable | El guardián verifica el hash que el estándar exige |

---

## 8. Qué existe y en qué nos diferenciamos

| Ya existe | Qué hace | La diferencia |
|---|---|---|
| Billeteras multifirma de cripto | Bóveda común con aprobaciones | Sin bóveda, sin cripto, con cuentas de banco |
| Splitwise, Tricount | Anotan quién le debe a quién | El dinero se mueve de verdad |
| Cuentas conjuntas | Varios titulares en un banco | Exige mismo banco y país; aquí cada uno usa el suyo |
| Colectas (p. ej. Vaki — **verificar antes de citar**) | Guardan y entregan el dinero | Nadie guarda el dinero |
| **TollWarden** | Firewall de pagos para **x402** (cripto) | Nuestro guardián cubre lo propio de Open Payments: hash, permisos GNAP, cotizaciones |
| **SDK oficial de Node** | Firma y valida solicitudes | Base sobre la que construimos; no lo duplicamos |

---

## 9. Límites honestos

| Límite | Cómo lo decimos |
|---|---|
| El cupo es autorizado, no garantizado | "Es lo que el grupo autorizó. Si a alguien no le alcanza, su parte falla y la billetera avisa." |
| La aprobación del grupo la aplica la plataforma | "Está inspirada en la multifirma, pero no es criptográfica. Para gastos de riesgo, cada miembro confirma en su wallet (si se verificó) y el tope limita la pérdida máxima." |
| El guardián no es infalible | "Da advertencias verificables, no promete detectar todo el fraude." |
| Cada miembro puede revocar | "El control es de cada persona. El cupo baja al instante." |
| Ejecución no atómica | "Si un aporte falla, el gasto queda incompleto y avisa. A futuro: reintentos y reservas de fondos." |
| El hash no evita robos por sí solo | "Es defensa en profundidad: evita que la app crea algo que el banco no aprobó." |
| Detectar destinos parecidos necesita una referencia | "Comparamos contra los destinos que el grupo ya usa." |
| Inversión regulada | "Entre conocidos. La plataforma nunca capta dinero." |
| Cotización anormal en la demo | "Este caso lo simulamos; en la red de prueba no hay comisiones abusivas." |

---

## 10. Arquitectura

### Estructura del repositorio (cada carpeta tiene un dueño)

```
/contracts                → TODOS (10:30–11:00): tipos compartidos. Después solo R3 los cambia, con aviso
/packages/guardian        → R5: librería pura + pruebas + README propio
  /examples/official-snippet.ts → R5: el guardián sobre el snippet oficial de Interledger
/apps/api
  /src/members/           → R1: unirse, permiso, /finish, cupo de cada miembro, revocación, confirmación en la wallet
  /src/payments/          → R2: cobro, cotización, pagos salientes, seguimiento, retorno
  /src/wallet/            → R3: modelo, cupo del grupo, reglas, aprobación del grupo, meta, escalamiento por riesgo
  /src/server.ts          → R3: API REST + SSE
/apps/web                 → R4: todas las pantallas
/mocks                    → cada dueño escribe el simulado de su interfaz en los primeros 30 min
  members.mock.ts (R1) · payments.mock.ts (R2) · guardian.mock.ts (R5) · api.mock.ts (R4)
/demo                     → R1 (sábado): semillas, demo:reset y modo respaldo (DEMO_MODE=fixtures)
/fixtures                 → R1 y R2: respuestas reales de la Test Wallet
/prompts                  → un archivo por rol
AI_USAGE.md · README.md
```

**Stack:** TypeScript + Node, Express, Server-Sent Events, SQLite o JSON, HTML/CSS sencillo. Sin LLM en el P0/P1.

**Identidad del cliente:** la plataforma tiene su wallet address y llave de desarrollador; con ella firma todas las solicitudes.

---

## 11. Contrato técnico

> Se escribe entre todos de 10:30 a 11:00 del viernes en `/contracts`. Después **solo R3** lo cambia, con aviso al grupo.

```ts
// ---------- Comunes ----------
interface Money { value: string; assetCode: string; assetScale: number }

// ---------- Guardián (R5) ----------
type Status = 'pass' | 'warn' | 'block'
interface Verdict {
  check: 'consent-hash' | 'grant' | 'destination' | 'quote' | 'reconcile'
  status: Status
  riskPoints: number          // aporte al puntaje
  userMessage: string         // español claro
  reasons: string[]           // detalle técnico
}
interface Guardian {
  verifyInteractionHash(p: { clientNonce: string; interactNonce: string; interactRef: string; grantUri: string; hash: string }): Verdict
  checkGrantRequest(p: { debitAmount?: Money; interval?: string; policy: { maxCap: Money } }): Verdict
  checkDestination(p: { walletAddress: string; known: { name: string; walletAddress: string }[] }): Verdict
  checkQuote(p: { debitAmount: Money; receiveAmount: Money; referenceRate?: number; maxFeePercent: number }): Verdict
  reconcile(p: { expected: Money; received: Money }): Verdict
  riskScore(verdicts: Verdict[]): number   // 0–100
}

// ---------- Billetera ----------
type MemberStatus = 'pending-approval' | 'active' | 'revoked' | 'expired'
type SpendStatus = 'requested' | 'awaiting-approval' | 'approved' | 'blocked'
                 | 'paying' | 'paid' | 'rejected' | 'incomplete'

interface Member {
  id: string; name: string; walletAddress: string; assetCode: string
  cap: Money; interval?: string; available?: Money; status: MemberStatus
}

interface Rules {
  split: 'equal' | 'proportional-to-cap'
  groupApproval: {                      // inspirada en la multifirma; la aplica la plataforma
    aboveAmount: Money; approvalsRequired: number; riskThreshold: number  // riesgo ≥ umbral → exige aprobación
    confirmInWallet: boolean            // true → permiso de un solo pago con limits.receiver (sección 6.1)
  }
  goal?: { members?: number; amount?: Money; deadline: string }        // caso 2: parque
  return?: { fromWalletAddress: string; percentPerSale: number; cap: Money }  // caso 3: panadería
}

interface SharedWallet {
  id: string; name: string; currency: string
  kind: 'care' | 'goal' | 'investment' // mismo motor, distinta configuración
  members: Member[]; rules: Rules
  knownDestinations: { name: string; walletAddress: string }[]
  authorizedCapacity: Money            // cupo del grupo: capacidad autorizada, NO saldo
}

interface Spend {
  id: string; walletId: string
  destination: { name: string; walletAddress: string }
  amount: Money; status: SpendStatus
  risk: number; verdicts: Verdict[]
  approvals: { memberId: string; yes: boolean }[]
  shares: { memberId: string; share: Money; debit?: Money; received?: Money
            status: 'pending' | 'paid' | 'failed'; failReason?: string }[]
  progress: { confirmed: number; total: number }   // "2 de 3 aportes confirmados"
}

// ---------- Servicios ----------
interface MembersService {      // R1
  startJoin(walletId: string, member: Omit<Member, 'id' | 'status'>): Promise<{ redirectUrl: string; grantWarning: Verdict }>
  finishJoin(p: { interactRef: string; hash: string; state: string }): Promise<{ member: Member; hashVerdict: Verdict }>
  available(memberId: string): Promise<Money>
  revoke(memberId: string): Promise<void>
  tokenFor(memberId: string): Promise<string>   // solo lo usa R2 en el servidor
  // P2 (sección 6.1): permiso de un solo pago con destino fijo, aprobado en la wallet del miembro
  startWalletConfirm(memberId: string, p: { incomingPaymentUrl: string; debit: Money }): Promise<{ redirectUrl: string }>
  finishWalletConfirm(p: { interactRef: string; hash: string; state: string }): Promise<{ memberId: string; approved: boolean; token?: string; hashVerdict: Verdict }>
}

interface PaymentsService {     // R2
  createIncoming(walletAddress: string, amount: Money): Promise<{ incomingPaymentUrl: string }>
  quoteShare(memberId: string, incomingPaymentUrl: string, share: Money): Promise<{ quoteId: string; debitAmount: Money; receiveAmount: Money }>
  payShare(memberId: string, quoteId: string): Promise<{ outgoingId: string }>
  track(outgoingId: string): Promise<'pending' | 'completed' | 'failed'>
  received(incomingPaymentUrl: string): Promise<Money>
  distributeReturn(rule: Rules['return'], sale: Money, investors: Member[]): Promise<void>
}

// ---------- Eventos para la web (R3 emite, R4 escucha) ----------
interface WalletEvent {
  walletId: string
  type: 'member-active' | 'member-revoked' | 'capacity-updated'
      | 'spend-requested' | 'spend-reviewed' | 'approval-cast' | 'wallet-confirm-requested' | 'spend-approved'
      | 'spend-blocked' | 'spend-rejected' | 'share-paid' | 'share-failed'
      | 'spend-paid' | 'goal-reached' | 'goal-failed' | 'return-paid'
  spendId?: string; memberId?: string; amount?: Money; risk?: number
  message: string; ts: number
}
```

---

## 12. Flujos de Open Payments

> Usar el SDK oficial de Node y los snippets oficiales. **Prohibido inventar la API.**

### 12.1 Unirse (R1)
1. `walletAddress.get` del miembro.
2. **Guardián:** `checkGrantRequest` con el tope y el intervalo → si `warn`, la web lo muestra antes de seguir.
3. `grant.request` **interactivo** de pago saliente **sin destinatario**, con `limits.debitAmount` y `limits.interval` (p. ej. `R12/2026-10-16T00:00:00Z/P1M`).
4. Redirección → el miembro aprueba en su wallet.
5. `/finish` → **Guardián:** `verifyInteractionHash` → si `block`, no se une.
6. `grant.continue` → guardar `access_token` y `manage` (solo en el servidor).

### 12.2 Cupo (R1 → R3)
- `available = tope − spentDebitAmount` con la consulta de **montos gastados del permiso** y el token del miembro.
- Plan B: calcular con los pagos que la billetera ya hizo.

### 12.3 Pedir y revisar un gasto (R3, usando el guardián)
1. **Guardián:** `checkDestination` contra `knownDestinations`.
2. R2 crea el cobro y cotiza cada aporte → **Guardián:** `checkQuote` por miembro.
3. **Guardián:** `riskScore`.
4. Regla: `bloqueo duro` → BLOQUEADO · `riesgo ≥ umbral` o `monto > aboveAmount` → EN APROBACIÓN · si no → APROBADO.
5. Si `confirmInWallet` está activo y el gasto está EN APROBACIÓN: R1 pide a cada miembro que aprueba un permiso de un solo pago (`limits.receiver` + `limits.debitAmount`). Ese pago se hace con **ese** token, no con el mensual.

### 12.4 Ejecutar (R2)
1. Cobro en el destino con `incomingAmount` (o un cobro por miembro como plan B). **Crearlo justo antes de pagar** (los cobros vencen).
2. Por cada miembro: cotización con `receiveAmount` = su parte → pago saliente con su token.
3. Seguimiento de cada aporte → evento `share-paid` / `share-failed` → la web muestra "2 de 3".
4. **Guardián:** `reconcile` contra lo **recibido** → PAGADO (verificado) o INCOMPLETO con el aporte faltante.

### 12.5 Meta todo o nada (R3)
- Al llegar a la meta antes de la fecha → ejecutar. Si vence → revocar permisos y avisar "nadie pagó nada".

### 12.6 Retorno de inversión (R2, P2)
- Cada venta de la panadería → 10% repartido entre los inversionistas con su permiso con tope.

---

## 13. Roles independientes

**Principio:** cada rol tiene **su carpeta, su simulado y su propia forma de probar sin esperar a nadie**. Todos registran prompts en `/prompts/<rol>.md`.

> Asignen nombres: **R1:** ________ · **R2:** ________ · **R3:** ________ · **R4:** ________ · **R5:** ________

### Resumen

| Rol | Construye | Prueba solo con… | Entrega a los demás | Entregable no técnico |
|---|---|---|---|---|
| **R1 Miembros** | Unirse, hash, cupo de cada miembro, revocación, confirmación en la wallet (P2) · sábado: semillas de demo y modo respaldo | La Test Wallet + `guardian.mock` | `MembersService` real | README técnico |
| **R2 Pagos** | Cobro, cotización, pagos, seguimiento por aporte, retorno | Su **propio** token de prueba sacado con el snippet oficial | `PaymentsService` real | `AI_USAGE.md` |
| **R3 Motor e integración** | Billetera, cupo del grupo, reglas de los 3 casos, aprobación del grupo, escalamiento por riesgo, pagos parciales, API, SSE · dueño de `main` | `members.mock` + `payments.mock` + `guardian.mock` | API y eventos | Diapositivas |
| **R4 Experiencia** | Todas las pantallas | `api.mock` con eventos falsos | La web | Video y demo en vivo |
| **R5 Guardián** | Librería pura con pruebas, ejemplo con el snippet oficial, README de la librería, borrador del aviso al SDK | Nada externo: funciones puras | `@guardian` real | **Pitch** |

---

### R1 — Miembros

**Misión:** que cualquier persona se una a la billetera aprobando un tope, y que se sepa cuánto le queda.

**Construye**
- Cliente autenticado del SDK con la wallet de la plataforma.
- Flujo 12.1 completo (con `checkGrantRequest` y `verifyInteractionHash` del guardián; mientras tanto, `guardian.mock`).
- `available()` con montos gastados; plan B si no responde.
- `revoke()` con `grant.cancel`.
- `tokenFor()` para que R2 use el token en el servidor.
- **P2:** `startWalletConfirm` / `finishWalletConfirm` (sección 6.1).
- **Sábado:** `/demo` con semillas de las tres billeteras, `npm run demo:reset` y el **modo respaldo** `DEMO_MODE=fixtures` (respuestas reales grabadas, marcado en pantalla como "modo respaldo").

**Primer paso sin depender de nadie (viernes 11:00, en este orden):**
1. **Verificación crítica:** permiso sin destinatario con `limits.interval`. Si falla, avisar al grupo de inmediato.
2. Permiso con `limits.receiver`: ¿la pantalla de consentimiento de la Test Wallet muestra el destino?
3. Script que une un miembro real y guarda el token.

**Hitos:** miembro activo con permiso real antes de las **12:30 del viernes** · `available()` antes de las **14:00**.

---

### R2 — Pagos

**Misión:** que cuando la billetera pague, la plata salga de cada miembro y llegue completa.

**Construye**
- `createIncoming`, `quoteShare`, `payShare`, `track`, `received`.
- **Primera prueba del viernes:** dos pagadores con `receiveAmount` parcial en el mismo cobro. Avisar el resultado a R3 antes de las 12:00.
- Plan B: un cobro por miembro si el cobro no acepta varios pagadores.
- Motivo claro en cada fallo (`failReason`): cupo insuficiente, permiso revocado, cobro vencido.
- `distributeReturn` (P2).
- Pruebas con `/fixtures`.

**Primer paso sin depender de nadie:** usar el **snippet oficial** de Interledger para conseguir **su propio** permiso de pago saliente con una wallet de prueba, y con ese token probar todo su flujo. No espera a R1.

**Hitos:** pago desde un permiso guardado hacia un cobro antes de las **14:00 del viernes** · dos pagadores en el mismo cobro antes de las **16:30**.

---

### R3 — Motor e integración

**Misión:** el cerebro de la billetera y el dueño de que todo encaje.

**Construye**
- `/contracts` (lo coordina en los primeros 30 min).
- Modelo de billetera, gasto y miembro; almacenamiento simple. **Un solo motor** para los tres casos (`kind` + `Rules`).
- Cupo del grupo con `MembersService.available()`.
- Reparto en partes iguales (P0) y proporcional (P2).
- Revisión del gasto con el guardián (12.3) y **escalamiento por riesgo**.
- Aprobación del grupo; pagos parciales con `progress` y reintento del aporte faltante.
- Después de la puerta de calidad: meta todo o nada (caso 2) y retorno de inversión (caso 3, con R2).
- API REST + SSE.
- **Dueño de `main`**: fusiona y resuelve conflictos.

**Primer paso sin depender de nadie:** todo el motor contra los tres simulados (`members.mock`, `payments.mock`, `guardian.mock`), con pruebas.

**Hitos:** motor con aprobación del grupo, escalamiento por riesgo y pagos parciales probado con simulados antes de las **14:00 del viernes** · conectado a servicios reales a las **15:00**.

---

### R4 — Experiencia

**Misión:** que la billetera se sienta de verdad y que el guardián se entienda en 3 segundos.

**Construye**
- **Inicio de la billetera:** **"Cupo autorizado este mes"** en grande (nunca "saldo"), "nadie depositó nada", miembros con bandera, moneda, tope y disponible.
- **Unirse** con QR, mostrando la advertencia del guardián si el tope es abusivo.
- **Pedir gasto** y **pantalla de aprobación** con el puntaje de riesgo, la advertencia en grande y los motivos (`reasons`) en una línea.
- **Progreso del pago:** "2 de 3 aportes confirmados · falta Madrid", con estado INCOMPLETO y botón de reintento.
- **Historial** con sello "Gasto verificado" (solo tras `reconcile`).
- **Selector de billeteras:** Cuidado de mamá · Arreglo del parque · Horno de la panadería ("misma billetera, otra regla").
- **Billetera del barrio** con barra de meta y "nadie ha pagado todavía" (caso 2).
- **Panel de inversión** (caso 3).
- Indicador visible **"modo respaldo"** cuando corre con fixtures.

**Primer paso sin depender de nadie:** `api.mock` con eventos falsos que cumplen `WalletEvent`.

**Hitos:** inicio de la billetera y pantalla de aprobación con eventos falsos antes de las **14:00 del viernes** · conectado a la API real a las **16:30**.

---

### R5 — Guardián

**Misión:** la librería que protege la billetera y que cualquier app puede usar.

**Construye**
- `/packages/guardian` con las seis funciones del contrato, **sin red y sin dependencias de la billetera**.
- Pruebas: para cada función, un caso que pasa y uno que bloquea.
- Normalización de destinos (`1→l`, `0→o`, `rn→m`…) y distancia de edición.
- `verifyInteractionHash` probando Base64 estándar y Base64 URL sin relleno (R1 le pasa un hash real cuando lo tenga; mientras, usa el ejemplo de la documentación).
- `/examples/official-snippet.ts`: el guardián sobre el snippet oficial, **en 3 líneas**.
- README de la librería y borrador del aviso al SDK oficial (P2).

**Primer paso sin depender de nadie:** las funciones y sus pruebas. No necesita la Test Wallet.

**Entregable no técnico:** **el pitch**. Como la librería es independiente y se termina temprano, R5 tiene tiempo para ensayar.

**Hitos:** las seis funciones con pruebas antes de las **14:00 del viernes** · ejemplo con el snippet oficial antes de las **17:30**.

---

## 14. Cómo trabajamos sin depender unos de otros

### La regla de los simulados

En los primeros 30 minutos, **cada dueño de una interfaz escribe su simulado** (unas 10–20 líneas que devuelven datos falsos con la forma del contrato):

| Simulado | Lo escribe | Lo usan |
|---|---|---|
| `guardian.mock.ts` | R5 | R1, R3 |
| `members.mock.ts` | R1 | R3 |
| `payments.mock.ts` | R2 | R3 |
| `api.mock.ts` | R4 | R4 |

Después, **cada quien trabaja contra simulados** hasta el punto de integración. Cambiar de simulado a real es cambiar una línea de importación.

### Solo tres momentos de encuentro

| Hora | Para qué |
|---|---|
| **Vie 10:30–11:00** | Todos: contrato y simulados |
| **Vie 15:00** | R1, R2 y R5 entregan lo real; R3 lo conecta |
| **Vie 16:30** | Todos: integración en `main` y prueba de escenarios 1, 2 y 3 |

Fuera de esos momentos, **nadie espera a nadie**. Si alguien necesita algo de otro rol antes, usa el simulado.

### Para no pisarse

- Cada rol trabaja **solo en su carpeta**.
- `/contracts` solo lo cambia R3, con aviso.
- Fusión a `main` **mínimo una vez por hora**.

```
                  10:30 CONTRATO + SIMULADOS (todos)
        ┌──────────┬──────────┬──────────┬──────────┐
        ▼          ▼          ▼          ▼          ▼
       R1         R2         R3         R4         R5
    miembros    pagos      motor     pantallas   guardián
    (Test      (su propio (contra    (api.mock)  (funciones
     Wallet)    token)    simulados)              puras)
        │          │          │          │          │
        └──────────┴── 15:00 ─┴──────────┘──────────┘
                     se cambian simulados por reales
                              │
                  16:30 INTEGRACIÓN EN MAIN (todos)
```

---

## 15. Cronograma

### Hoy jueves (sin escribir código)

| Tarea | Quién |
|---|---|
| Explicar el proyecto al equipo con este documento y asignar roles | R5 (tú) |
| Curso de Platzi o Guía de Open Payments (quien falte) | Todos |
| **Verificar en la Test Wallet:** monedas; cobro con varios pagadores; permiso sin destinatario con intervalo; intervalos cortos | R1 + R2 |
| Crear wallets: plataforma, farmacia (COP), **farmacia-medel1in** (COP), hermanos (2 en COP + 1 en EUR), contratista del parque, panadería, inversionistas, 3 para el jurado · depositar ~COP 1.000.000 de prueba en las cuentas en pesos | R1 (o R5 hoy, ya está en la Test Wallet) |
| Leer: concesiones, pagos futuros, montos gastados, cobros, cotizaciones, hash | Todos |
| Bocetos: inicio de la billetera, unirse, **pantalla de aprobación con advertencia** | R4 |
| Esqueleto de diapositivas y verificación de datos (Vaki, regulación, remesas) | R3 |
| Lista de casos de prueba del guardián (en texto, sin código) | R5 |
| Guion del pitch v1 | R5 |
| 3 dispositivos con wallets iniciadas para el jurado | R5 |

### Viernes 16

| Hora | R1 Miembros | R2 Pagos | R3 Motor | R4 Experiencia | R5 Guardián |
|---|---|---|---|---|---|
| 08:30–10:30 | Registro. Verificar Node, wallets y llaves en **todos** los portátiles. **Sin código.** | | | | |
| 10:30–11:00 | **Todos: contrato + simulados** | | | | |
| 11:00–12:30 | **Verificación crítica** (intervalo) · `limits.receiver` · permiso con tope · `/finish` | Token propio con snippet oficial · **dos pagadores en un cobro** · cobro | Modelo · estados · aprobación del grupo | Inicio de la billetera | `checkDestination` · `checkGrantRequest` |
| 12:30–14:00 | `available()` · revocación · `/fixtures` | Cotización · pago saliente · seguimiento por aporte | Revisión con guardián · escalamiento por riesgo · pagos parciales | Unirse · pantalla de aprobación · progreso "2 de 3" | `verifyInteractionHash` · `checkQuote` · `reconcile` · `riskScore` |
| 14:00–15:00 | **Almuerzo. Mentores:** cobro con varios pagadores, permisos con intervalo, `limits.receiver`, montos gastados, hash | | | | |
| **15:00** | **Entrega real** | **Entrega real** | **Conecta todo** | Sigue con simulado | **Entrega real** |
| 15:00–16:30 | Pasa un hash real a R5 · confirmación en la wallet (P2) | Cobro en COP con aporte en EUR | API + SSE con servicios reales | Historial · selector de billeteras | Ejemplo con snippet oficial |
| 16:30–17:30 | **Todos: integración en `main` y prueba del caso 1 (escenarios 1, 2 y 3) — puerta de calidad** | | | | |
| 17:00–17:30 | *Solo si la puerta pasó:* | | Meta todo o nada (caso 2) | Barra de meta | |

**Hito del viernes:** caso "Cuidado de mamá" completo y real: cupo del grupo, medicina pagada y verificada, ataque de destino parecido detenido con aprobación.

**Viernes en la noche (sin código):** R5 ensaya el pitch; R3 ajusta diapositivas.

### Sábado 17

| Hora | R1 | R2 | R3 | R4 | R5 |
|---|---|---|---|---|---|
| 07:00–08:00 | **Todos:** desayuno, congelar tareas | | | | |
| 08:00–09:15 | Semillas de las 3 billeteras · `demo:reset` · **modo respaldo** | Retorno de inversión (caso 3) | Terminar caso 2 · caso 3 en el motor · reparto proporcional | Pulir · panel de inversión | README de la librería · aviso al SDK (P2) · ensayo |
| **09:15** | **Todos: congelamiento. Solo arreglos. Demo completa 3 veces.** | | | | |
| 09:45–10:15 | Apoyo al video | `AI_USAGE.md` | Capturas | **Grabar el video** | Ensayo del pitch |
| 10:15–10:50 | README técnico | `/prompts` completo | Diapositivas finales · todo en `main` · repo **público** | Video editado | Ensayo con R4 |
| 10:50–11:00 | **Margen. Nadie toca nada.** | | | | |
| **11:00** | **CIERRE DE CÓDIGO** | | | | |
| 11:00–12:00 | Formulario del repo · `demo:reset` | — | Subir diapositivas | Subir video | Ensayo final (3 veces) |
| **12:00** | **Ronda 1** — R5 presenta · R4 conduce la demo | | | | |

---

## 16. La demo

### Escenarios

| # | Escenario | Qué se ve | ¿Real? | En el pitch | Dueños |
|---|---|---|---|---|---|
| **1** | **Cupo sin depósitos** | Los hermanos se unen; cupo del grupo $300.000; "nadie depositó nada" | Real | En vivo | R1 + R4 |
| **2** | **Pagar la medicina** | $40.000 de cada hermano (uno en EUR); "3 de 3 aportes"; sello "verificado" | Real (EUR→COP verificado) | En vivo | R2 + R5 + R4 |
| **3** | **Ataque de destino parecido** | Gasto a `farmacia-medel1in` → riesgo 94 → exige aprobación → el juez ve la advertencia y **rechaza** (en la app, o en su wallet si 6.1 funciona) | Real | **En vivo, momento wow** | R3 + R5 + R4 |
| **3b** | **Aporte que falla** | Un hermano revocó o no tiene cupo → "2 de 3 · falta Madrid" → no se marca pagado | Real | Pregunta del jurado o 10 segundos | R2 + R3 |
| **4** | **Billetera abusiva** | Al unirse, el guardián avisa que el tope es exagerado | Real | Video o 15 segundos | R1 + R5 |
| **5** | **Caso 2: barrio todo o nada** | "2 de 3 · nadie ha pagado todavía" → el tercero se une → todos pagan | Real | 10 segundos en vivo ("misma billetera, otra regla") o video | R3 + R4 |
| **6** | **Cotización anormal** | A un miembro le cobrarían 23% más → detenido | **Simulado — decirlo** | Diapositiva | R5 |
| **7** | **Revocación** | Un hermano se sale; el cupo baja | Real | Pregunta del jurado | R1 |
| **8** | **Caso 3: invertir juntos** | Venta de la panadería repartida | Real | 10 segundos o video | R2 |
| **9** | **Guardián en el snippet oficial** | 3 líneas sobre el código de ejemplo de Interledger | Real | Diapositiva o 20 segundos | R5 |

### Qué es real y qué es simulado (decidido)

| Real | Simulado y dicho en voz alta |
|---|---|
| Permisos, pagos, monedas, destino parecido, hash, conciliación, revocación | Cotización abusiva (escenario 6): en la red de prueba no hay comisiones abusivas |
| | Si un caso (2 o 3) no se terminó: se muestra como configuración, no como pago real |

### Plan de respaldo si la Test Wallet falla en la presentación

1. **Primero:** reintentar una vez (los cobros vencen: `demo:reset` crea uno nuevo).
2. **Si sigue fallando:** `DEMO_MODE=fixtures`. La app corre con las respuestas reales grabadas el viernes y muestra la etiqueta **"modo respaldo"**. Se dice: *"La red de prueba no responde; estas son respuestas reales grabadas ayer."*
3. **Último recurso:** el video de la demo.

### Cumplimiento de la demo obligatoria

| Exigencia | Dónde se ve |
|---|---|
| Solicitud de pago | Se pide el gasto y se crea el cobro |
| Autorización | Cada miembro aprueba su permiso en su wallet (y el grupo aprueba en la app) |
| Ejecución | Salen los aportes |
| Finalización exitosa | Cobro completo, sello "verificado" |

### Para que el momento con el jurado no falle

- 3 dispositivos con wallets iniciadas.
- El juez solo hace **un clic** (aprobar o rechazar).
- Si no participa, lo hace un integrante.
- `npm run demo:reset` justo antes.
- Video de respaldo.

---

## 17. Prioridades y recortes

| Prioridad | Qué entra |
|---|---|
| **P0 – imprescindible (caso 1)** | Unirse con tope (≥ 2 miembros) · `verifyInteractionHash` · cupo del grupo · gasto en partes iguales hacia un cobro · `reconcile` y progreso por aporte (nunca "pagado" sin verificar) · `checkDestination` · inicio de la billetera · **escenarios 1 y 2** |
| **P1 – muy importante (caso 1)** | Escalamiento por riesgo + aprobación del grupo en vivo (**escenario 3**) · estado INCOMPLETO (3b) · `checkGrantRequest` (escenario 4) · `riskScore` · revocación · recarga mensual · un miembro en EUR · ejemplo con snippet oficial · modo respaldo |
| **P2 – también se construye (después de la puerta de calidad)** | **Caso 2: meta todo o nada** · **caso 3: invertir juntos** · confirmación en la wallet (6.1) · `checkQuote` (escenario 6) · aviso al SDK oficial |
| **P3 – extra** | Reglas en español con IA · oráculo · notificaciones · publicar la librería en npm |

**Regla:** los casos 2 y 3 **sí se hacen**, pero ninguno empieza hasta que el caso 1 pase la puerta de calidad (16:30 del viernes). Los roles que terminen antes **pulen el caso 1**, no adelantan los otros.

---

## 18. Guion del pitch (5 minutos)

| Tiempo | Quién | Contenido |
|---|---|---|
| 0:00–0:30 | R5 | **Gancho:** "En cripto existen las billeteras compartidas: varias personas controlan una bóveda y, para gastar, varios aprueban. Gran idea, con un problema: hay que meter tu plata en la bóveda, en cripto. Y la gente tiene su plata en el banco, en pesos." |
| 0:30–1:00 | R5 | **Problema humano:** "Doña Gloria, 68 años, persona ficticia. Sus hijos viven en Bogotá, Medellín y Madrid. Siempre que un grupo junta plata, alguien tiene que guardarla. Y cuando es plata de varios, un solo engaño afecta a todos." |
| 1:00–1:20 | R5 | **Solución:** "Varias personas. Sus propias billeteras. Un gasto compartido. Sin entregarle el dinero a nadie. Y un guardián que revisa cada gasto antes de que salga." |
| 1:20–2:00 | R4 | **Demo 1 y 2:** cupo del grupo de $300.000 sin depósitos; pagan la medicina, $40.000 cada uno, uno de ellos en euros; "3 de 3 aportes"; sello "verificado". |
| 2:00–3:10 | R4 + jurado | **Demo 3, el ataque:** "Al chat familiar llega: 'la farmacia cambió de cuenta'. Alguien pide el gasto." El guardián marca riesgo 94 y exige aprobación del grupo. "¿Alguno quiere ser la hermana?" El juez ve la advertencia y **rechaza** (si 6.1 funciona: *"y lo rechaza en su propia wallet, donde ve el destino real"*). "La aprobación del grupo hace que nadie gaste solo. El guardián hace que nadie apruebe a ciegas." |
| 3:10–3:30 | R4 | **"Misma billetera, otra regla":** 10 segundos del barrio con todo o nada y 10 de la panadería. |
| 3:30–4:20 | R5 | **Cómo funciona:** "Cada miembro autoriza un tope que su banco hace cumplir y que se recarga cada mes. Es cupo autorizado, no dinero guardado: si a alguien no le alcanza, la billetera lo muestra y no da el gasto por pagado. Y el guardián es una librería aparte: verifica el sello del banco que el SDK oficial de Node no verifica, detecta destinos falsos y permisos abusivos. No adivina: explica. Aquí está funcionando sobre el código de ejemplo oficial, en 3 líneas." |
| 4:20–5:00 | R5 | **Cierre:** "En una hackatón todos construimos rápido, y nadie tuvo tiempo de pensar en estafas. Nosotros construimos esa parte para todos: cualquier app de esta sala puede usar el guardián desde hoy. Las billeteras compartidas de cripto obligan a meter tu dinero en una bóveda. La nuestra no tiene bóveda, y además te cuida." |

---

## 19. Preguntas difíciles del jurado

| Pregunta | Respuesta |
|---|---|
| ¿El cupo es dinero real? | Es lo que el grupo autorizó, consultado en vivo. No es dinero garantizado: si a alguien no le alcanza, su parte falla, la billetera muestra "2 de 3" y no da el gasto por pagado. |
| ¿Esto es multifirma de verdad? | Está inspirada en la multifirma, pero la aprobación la aplica la plataforma, no una cadena. Para gastos de riesgo, cada miembro confirma en su wallet un permiso que solo sirve para ese destino (si se verificó). Y el tope de cada uno limita la pérdida máxima. |
| ¿El guardián detecta todo el fraude? | No, y no lo prometemos. Da advertencias verificables, cada una con su motivo y su prueba. Si duda, le pregunta al grupo. |
| ¿Y si alguien se sale? | Revoca su permiso y el cupo baja al instante. |
| ¿Qué pasa si un aporte falla? | El gasto queda incompleto y avisa. A futuro: reintentos y reservas de fondos. |
| ¿Esto es captación de dinero? | No. La plataforma nunca recibe ni guarda dinero. |
| ¿Y la inversión? | Entre conocidos; la financiación colaborativa abierta al público está regulada. |
| ¿El banco no muestra el destino al aprobar? | Sí, pero nadie distingue `farmacia-medellin` de `farmacia-medel1in`. Y en la billetera, el miembro no aprueba cada gasto en su banco: aprobó un tope una vez. Por eso el guardián decide cuándo pedir confirmación. |
| ¿Olvidar el hash permite robar dinero? | No directamente: el banco valida el `interact_ref`. Evita que la app crea algo que el banco no aprobó. Es defensa en profundidad, y la documentación lo marca obligatorio. |
| ¿Esto no debería estar en el SDK oficial? | Ojalá. Por eso el guardián es abierto y lo proponemos al SDK. |
| ¿En qué se diferencian de TollWarden? | TollWarden es para x402. El guardián cubre lo propio de Open Payments: hash, permisos GNAP y cotizaciones. |
| ¿Por qué dos piezas y no una? | Porque la billetera necesitaba seguridad, y esa seguridad le sirve a cualquier app. La construimos una vez y la compartimos. |

---

## 20. Cumplimiento y entrega

### `AI_USAGE.md` (obligatorio) — R2
- Herramientas de IA, para qué, en qué archivos.
- Archivos con poca o ninguna IA (por ejemplo, los flujos de Open Payments).
- Qué hicimos nosotros (pruebas, verificación, correcciones).

### `/prompts` (obligatorio)
- Texto real de los prompts. Un archivo por rol. **Se llena mientras se trabaja.**

### Checklist de entrega (sábado)
- [ ] Todo el código en `main` antes de las 11:00
- [ ] Repositorio **público**
- [ ] `README.md` del proyecto y README de la librería
- [ ] `AI_USAGE.md` completo
- [ ] `/prompts` con los cinco archivos
- [ ] Ninguna clave ni token en el repositorio
- [ ] Enlace del repo en el formulario (llega por Slack)
- [ ] Video y diapositivas subidos antes de las 12:00
- [ ] `npm run demo:reset` probado justo antes
- [ ] Pitch ensayado 3 veces con cronómetro

---

## 21. Reglas para trabajar con agentes de IA

1. **`/contracts` manda.** Cambios solo con aviso; R3 actualiza.
2. **Prohibido que el agente invente la API de Open Payments.** Darle siempre la documentación y los snippets oficiales.
3. **Cada rol trabaja solo en su carpeta.**
4. **Primero el simulado, después lo real.** Cambiar de uno a otro es una línea.
5. **Fusión a `main` mínimo cada hora.**
6. **El guardián no importa nada de la billetera.** Si lo necesita, está mal diseñado.
7. **Confiar, pero verificar.** Nadie fusiona código que no corrió y entendió.
8. **Guardar cada prompt** en `/prompts/<rol>.md` en el momento.
9. **No pegar llaves ni tokens en prompts ni en el repo.** Los tokens de los miembros nunca salen del servidor.

---

## 22. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación | Responsable |
|---|---|---|---|
| El permiso sin destinatario no funciona como esperamos | Crítico | Verificar hoy; guía de pagos futuros; mentores | R1 |
| Montos gastados no responde | Alto | Plan B: calcular con los pagos de la billetera | R1 + R3 |
| El cobro no acepta varios pagadores | Alto | Plan B: un cobro por miembro | R2 |
| El hash no coincide | Alto | R5 prueba ambas codificaciones; R1 le pasa un hash real; mentores | R1 + R5 |
| Falla el aporte en EUR | Bajo (ya verificado) | El hermano de Madrid pasa a COP; la historia se mantiene | R2 |
| `limits.receiver` no se muestra en la wallet | Medio | Se queda la aprobación en la app (P1); 6.1 se menciona como siguiente paso | R1 |
| La Test Wallet falla en la presentación | Alto | Reintento → `DEMO_MODE=fixtures` con etiqueta → video | R1 + R4 |
| Lenguaje impreciso ("saldo", "multifirma") | Medio | Regla de lenguaje; R5 revisa interfaz y diapositivas el sábado 09:15 | R5 |
| Los casos 2 y 3 le quitan tiempo al caso 1 | Alto | Puerta de calidad a las 16:30; quien termina antes pule el caso 1 | R3 |
| Integración a las 15:00 falla | Alto | Contrato estricto y simulados fieles; R3 prioriza el escenario 2 | R3 |
| El momento con el jurado falla | Alto | Dispositivos preparados; integrante de respaldo; video | R4 + R5 |
| Dos piezas confunden al jurado | Medio | Una sola historia: la billetera, protegida por el guardián | R5 |
| Demasiado alcance | Alto | Lista de recortes estricta | Todos |
| Olvidar prompts o `AI_USAGE.md` | Descalificación | Registro continuo; R2 consolida | R2 |

---

## 23. Checklist de hoy (jueves)

- [ ] Reunión con el equipo y roles asignados
- [ ] Nombres decididos (*Pacto* / *Pacto Guard* u otros)
- [x] **Verificado:** monedas en la Test Wallet (EUR, USD, COP)
- [x] **Verificado:** nombres personalizados de wallet
- [x] **Verificado:** pago entre monedas
- [ ] Cobro con varios pagadores → **viernes 11:00 con código (R2)**; plan B listo
- [ ] Permiso sin destinatario con intervalo → **viernes 11:00 con código (R1)**
- [ ] Wallets creadas, incluida `farmacia-medel1in`, y COP de prueba depositados
- [ ] Llaves guardadas de forma segura
- [ ] 3 dispositivos para el jurado
- [ ] Bocetos de las pantallas, sobre todo la de aprobación
- [ ] Casos de prueba del guardián escritos
- [ ] Esqueleto de diapositivas y datos verificados
- [ ] Todos terminaron el curso de Platzi o la guía
- [ ] Portátiles con Node y cargador

---

## 24. Fuentes

**Hackatón**
- Información clave: https://interledger.org/es/hackathon/2026-hackathon-medellin/
- Entrega y evaluación: https://interledger.org/es/hackathon/submission-judging/
- Política de IA: https://interledger.org/es/hackathon/ai-policy/
- Cronograma: https://interledger.org/es/hackathon/2026-timetable/
- Requisitos de participación: https://interledger.org/es/hackathon/participation/
- Herramientas y recursos: https://interledger.org/es/hackathon/open-payments/

**Open Payments**
- Cómo empezar: https://openpayments.dev/es/overview/getting-started/
- Concesión para pagos futuros (sin destinatario, intervalo, montos gastados): https://openpayments.dev/es/guides/outgoing-grant-future-payments/
- Dividir un pago entrante: https://openpayments.dev/es/guides/split-payments/
- Remesa con monto de recepción fijo: https://openpayments.dev/es/guides/onetime-remittance-fixed-receive/
- Verificación de hash: https://openpayments.dev/es/identity/hash-verification/
- Seguridad (para ASE): https://openpayments.dev/es/implement/security/
- Completar un pago entrante: https://openpayments.guide/apis/resource-server/operations/complete-incoming-payment
- Repositorio: https://github.com/interledger/open-payments
- Snippets oficiales del SDK de Node: https://github.com/interledger/open-payments-snippets

**Seguridad y competencia**
- TollWarden: https://github.com/tollwarden/tollwarden
- Foro Interledger sobre phishing en direcciones de pago: https://forum.interledger.org/t/how-does-an-spsp-client-verify-they-are-communicating-with-the-intended-spsp-server/282
- Estudio de envenenamiento de direcciones: https://arxiv.org/pdf/2501.16681

**Contexto**
- Remesas a Colombia 2025: https://www.portafolio.co/economia/finanzas/remesas-que-recibe-colombia-marcaron-un-nuevo-record-en-el-2025-y-sobrepasaron-de-us-13-000-millones-486888
- Ganadores 2025 (Ciudad de México): https://interledger.org/blog/building-real-solutions-interledger-hackathon-winners-2025
