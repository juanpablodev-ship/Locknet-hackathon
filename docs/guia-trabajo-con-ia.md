# Cómo trabajar con los agentes de IA — Hackatón Open Payments

> Complemento del **Plan v6**. Aquí no se dice **qué** construir (eso está en el plan), sino **cómo** trabaja cada persona con su IA, desde hoy hasta el cierre de código.

---

## 1. La idea en una frase

**El plan es para las personas; el `AGENTS.md` del repositorio es para las IA.** Cada persona arranca a su IA con un prompt de su rol, y después trabaja en ciclos cortos: tarea pequeña → la IA propone → tú apruebas → la IA hace → **tú pruebas** → commit → prompt guardado.

---

## 2. Línea de tiempo

| Cuándo | Qué hace cada persona con su IA | Qué **no** hace |
|---|---|---|
| **Jueves en la noche (hoy)** | Le pasa el plan y el **prompt de estudio** (sección 5). La IA le explica su rol, le arma una lista de lectura y le prepara preguntas para los mentores | **No escribir código.** La regla del evento: todo el código se escribe durante los dos días. Ni "dejarlo listo para pegar mañana" |
| **Viernes 08:30–10:30** | R3 crea el repositorio con `AGENTS.md` y el plan en `/docs`. Todos clonan, instalan y prueban que su IA lee el repo | Sin código del producto |
| **Viernes 10:30–11:00** | **Todos juntos:** R3 escribe `/contracts` con su IA, los demás revisan en voz alta. Cada uno pide a su IA **su simulado** | Nadie empieza su parte antes de que el contrato esté en `main` |
| **Viernes 11:00 en adelante** | Cada uno abre su IA **en la raíz del repo**, en su rama, y le pega el **prompt de arranque** (sección 6) | No tocar carpetas de otros roles |
| **Puntos de encuentro** (15:00, 16:30, sábado 09:15) | Se habla entre personas, no entre IA | — |
| **Sábado 11:00** | Cierre de código | Nada después |

---

## 3. Preparación del repositorio (R3, viernes 08:30)

```
/AGENTS.md            ← reglas para todas las IA (sección 4)
/CLAUDE.md            ← copia de AGENTS.md (para quien use Claude Code)
/docs/plan-v6.md      ← el plan completo
/contracts/           ← vacío hasta las 10:30
/prompts/R1.md … R5.md  ← vacíos, cada uno llena el suyo
/AI_USAGE.md          ← R2 lo va llenando
.gitignore            ← incluye: .env, *.key, private*, node_modules
```

**Fuera del repositorio** (carpeta hermana, para que las IA la lean y no inventen la API):

```bash
git clone https://github.com/interledger/open-payments-snippets ../open-payments-snippets
```

**Llaves:** cada quien en su `.env` local (nunca en el repo, nunca en un prompt). En el `.env.example` solo van los nombres de las variables.

**Ramas:** `r1-miembros`, `r2-pagos`, `r3-motor`, `r4-web`, `r5-guardian`. Cada uno sube su rama; **R3 fusiona a `main` cada hora**.

---

## 4. `AGENTS.md` (pegar tal cual en la raíz del repo)

```markdown
# Reglas para agentes de IA en este repositorio

## Proyecto
Billetera compartida que no guarda dinero (Open Payments) + "guardián", una librería
abierta de verificaciones de seguridad. Plan completo: /docs/plan-v6.md.

## Antes de cada tarea
1. Pregunta (o lee del primer mensaje) qué rol tiene tu usuario: R1, R2, R3, R4 o R5.
2. Agrega el prompt del usuario, TEXTUAL y completo, a /prompts/<ROL>.md con la hora
   (formato: "### HH:MM" + el prompt). Es obligatorio por las reglas del hackatón.
   Si el prompt contiene una llave, token o URL privada, reemplázala por [REDACTADO].
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
```

---

## 5. Prompt de estudio (jueves en la noche, sin código)

> Pegar junto con el archivo del plan v6.

```
Soy [NOMBRE], rol [R1/R2/R3/R4/R5] en un hackatón de Open Payments (16 y 17 de octubre).
Te adjunto el plan del equipo. Hoy NO vamos a escribir código: las reglas del evento
exigen que todo el código se escriba durante los dos días.

Quiero que:
1. Me expliques mi rol en palabras simples: qué construyo, con quién me conecto y cuándo.
2. Me hagas una lista de lectura de la documentación de Open Payments (openpayments.dev/es)
   solo con lo que mi rol necesita, en orden.
3. Me listes los riesgos de mi parte y qué haría si cada uno falla.
4. Me prepares 3 preguntas concretas para los mentores.
5. Me digas qué cosas del plan no te quedan claras o te parecen contradictorias.
```

---

## 6. Prompts de arranque (viernes 11:00, uno por rol)

> Se pegan **una sola vez**, con la IA abierta en la raíz del repo. La IA ya lee `AGENTS.md` sola (si la herramienta no lo hace, decirle: "lee AGENTS.md y /docs/plan-v6.md").

### R1 — Miembros
```
Soy R1 (Miembros). Lee AGENTS.md, /docs/plan-v6.md (secciones 4, 6.1, 12.1, 12.2 y 13-R1)
y /contracts. Mi primer objetivo, en este orden:
1. Script que pide un permiso de pago saliente SIN destinatario con limits.debitAmount y
   limits.interval contra la Test Wallet, usando el snippet oficial como base. Es la
   verificación crítica: si falla, quiero saberlo ya.
2. Mismo script con limits.receiver, para ver si la wallet muestra el destino.
3. MembersService.startJoin y finishJoin usando /mocks/guardian.mock.ts.
Propón el plan del paso 1 y espera mi aprobación. Las llaves están en .env.
```

### R2 — Pagos
```
Soy R2 (Pagos). Lee AGENTS.md, /docs/plan-v6.md (secciones 12.3, 12.4, 12.6 y 13-R2)
y /contracts. No dependo de R1: consigo mi propio permiso de pago saliente con el snippet
oficial. Primer objetivo:
1. Crear un cobro en la wallet de la farmacia (COP) y pagarlo desde DOS wallets con
   receiveAmount parcial. Quiero saber si el cobro acepta varios pagadores.
2. Después: createIncoming, quoteShare, payShare, track y received según el contrato.
Propón el plan del paso 1 y espera mi aprobación. Las llaves están en .env.
```

### R3 — Motor e integración
```
Soy R3 (Motor e integración) y dueño de main y de /contracts. Lee AGENTS.md,
/docs/plan-v6.md (secciones 4, 11, 12.3 y 13-R3) y /contracts.
Trabajo SOLO contra los simulados (/mocks/*.mock.ts) hasta las 15:00.
Primer objetivo: el modelo de billetera, gasto y miembro, con la máquina de estados del
ciclo de vida del gasto (sección 4) y sus pruebas, para el caso "Cuidado de mamá".
Los casos 2 y 3 (meta y retorno) NO se empiezan hasta que yo lo diga.
Propón el plan y espera mi aprobación.
```

### R4 — Experiencia
```
Soy R4 (Experiencia). Lee AGENTS.md, /docs/plan-v6.md (secciones 4, 6, 16 y 13-R4)
y /contracts. Trabajo SOLO contra /mocks/api.mock.ts (eventos WalletEvent falsos) hasta
las 16:30. Primer objetivo: la pantalla de inicio de la billetera "Cuidado de mamá"
("Cupo autorizado este mes", "nadie depositó nada", miembros con bandera, moneda y tope),
y después la pantalla de aprobación con el riesgo y la advertencia en grande.
HTML/CSS simple, que se vea bien en un proyector. Propón el plan y espera mi aprobación.
```

### R5 — Guardián
```
Soy R5 (Guardián). Lee AGENTS.md, /docs/plan-v6.md (secciones 5, 6 y 13-R5) y /contracts.
Construyo /packages/guardian: funciones puras, sin red, sin importar nada de /apps.
Primer objetivo: checkDestination (normalización 1→l, 0→o, rn→m + distancia de edición)
y checkGrantRequest, cada una con pruebas: una que pasa y una que bloquea. El caso clave:
"farmacia-medel1in" frente a "farmacia-medellin" conocido debe dar block o warn alto.
Propón el plan y espera mi aprobación.
```

---

## 7. El ciclo de trabajo (se repite todo el día)

```
 1. TÚ eliges UNA tarea pequeña (≤ 30 min) de tu lista del plan
 2. La IA guarda tu prompt en /prompts/<ROL>.md y propone un plan corto
 3. TÚ lo revisas: ¿está en mi carpeta? ¿usa el contrato? ¿citó el snippet oficial?
 4. La IA implementa
 5. La IA corre las pruebas y TÚ ves la salida  (si no corrió, no está hecho)
 6. TÚ entiendes lo que hizo (pídele que te lo explique en 3 líneas)
 7. git commit + push a tu rama
 8. Vuelve al 1
```

**Cada hora:** avisa a R3 "mi rama está lista" → R3 fusiona a `main` → todos hacen `git pull` de `main` a su rama.

**Frases útiles para la IA:**
- *"Antes de escribir esa llamada, muéstrame en qué snippet oficial te basas."*
- *"Eso está fuera de mi carpeta. Dime qué necesitas y se lo pido a R_."*
- *"Corre las pruebas y muéstrame la salida."*
- *"Explícame en 3 líneas qué cambiaste, para entenderlo."*
- *"Esto se está complicando. Propón la versión más simple que funcione para la demo."*

---

## 8. Cuándo dejar de hablar con la IA y hablar con una persona

| Situación | Qué hacer |
|---|---|
| Necesitas algo de otro rol | Usa su simulado. Si el simulado no alcanza, le hablas a esa persona |
| Hay que cambiar `/contracts` | Se lo pides a **R3** (no a tu IA). R3 avisa a todos |
| La IA da vueltas más de 20 minutos con el mismo error | Pregunta a un **mentor** o al equipo. No sigas insistiendo |
| Falla una verificación crítica (permiso con intervalo, varios pagadores) | Avisa al grupo **de inmediato**: cambia el plan de otros |
| Terminaste antes | Avisa a R3. Se pule el caso 1; nadie empieza los casos 2 y 3 sin la puerta de calidad |

---

## 9. Obligatorio para la entrega (no olvidar)

- [ ] `/prompts/R1.md` … `R5.md` con los prompts **reales** (la IA los guarda al inicio de cada tarea; revisar cada hora que sí lo esté haciendo).
- [ ] `AI_USAGE.md` (R2): qué herramienta de IA usó cada rol, para qué y qué verificamos nosotros.
- [ ] Ninguna llave ni token en el repo ni en `/prompts` (`git grep -i "private\|token\|key"` antes del cierre).
