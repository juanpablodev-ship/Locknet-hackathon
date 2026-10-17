# Diapositivas y pitch — contenido

Texto de cada diapositiva con notas de voz, para pasar a la plantilla oficial de Google Slides.
Al final, la tabla **"Afirmaciones y evidencia"**: cada cifra o afirmación que aparece aquí tiene su fuente
en el repositorio o está marcada como **no verificada**. Lo no verificado **no se dice**.

Reglas de lenguaje: **"cupo autorizado"** (nunca "saldo" ni "fondos disponibles"), **"aprobación del grupo"**
(nunca "multifirma" a secas), y nada se llama "pagado" sin el sello **Gasto verificado**.

---

## 1. El problema (0:00–0:45)

**Título:** Juntar plata en grupo siempre sale mal de la misma forma

Tres versiones del mismo problema:
1. **Alguien recoge la plata.** Un hermano, una vecina, el "tesorero": todo el dinero pasa por una sola persona y una sola cuenta.
2. **Cada uno por su lado.** Nadie sabe quién puso qué, ni si llegó completo.
3. **"Cambié de cuenta."** Un mensaje en el chat familiar y el pago va a otro destino.

**Voz:** "Doña Gloria, 68 años, persona ficticia. Sus hijos viven en Bogotá, Medellín y Madrid. Cada mes hay que pagar su medicina entre los tres."

## 2. Kivor: contratos programables, sin bóveda (0:45–1:15)

**Título:** Medicinas de mamá, cada mes

- Cada hermano autoriza un **tope mensual** desde **su propio banco**. **Nadie deposita nada.**
- El grupo es un **contrato**: reglas que se cumplen solas, y cada regla la hace cumplir alguien concreto (diapositiva 4).
- La plataforma **nunca guarda dinero**.

**Voz:** "Las billeteras compartidas de cripto obligan a meter la plata en una bóveda. La nuestra no tiene bóveda."

## 3. Demo en vivo (1:15–3:15)

1. **Cuota del mes:** $120.000, cada hermano pone $40.000 (uno en euros). Se ve "1 de 3… 3 de 3" y el sello **Gasto verificado**.
2. **El ataque:** llega al chat "la farmacia cambió de cuenta". Alguien pide el pago. Open Sentinels marca **riesgo 94**: *"Esta cuenta se parece a la de Farmacia Medellín, pero no es la misma."*
3. **El juez decide:** **un solo rechazo** detiene un pago riesgoso. *"El gasto no salió. Nadie pagó nada."*

Guion con tiempos y plan B: `docs/guion-corrida.md`.

## 4. ¿Quién hace cumplir cada regla? (3:15–3:45)

| Regla del contrato | La hace cumplir |
|---|---|
| Nadie aporta más del tope que autorizó | Su propio banco |
| El permiso se renueva cada mes | Su propio banco |
| Si alguien se sale, su permiso se cancela al instante | Su propio banco |
| El destino recibe el monto exacto, aunque alguien pague en otra moneda | La cotización de Open Payments |
| Un pago riesgoso o mayor a $200.000 necesita aprobación del grupo; **un solo rechazo detiene un pago riesgoso** | Kivor |
| Destinos de confianza | Open Sentinels |
| Nada se da por pagado sin verificar lo que llegó | Open Sentinels |

**Voz (importante):** las tres primeras filas las hace cumplir **el banco**, no nosotros. Decir **"el banco lo hace cumplir"**, no "lo demostramos": la renovación mensual efectiva **no se probó** (ver tabla de evidencia).

## 5. Open Sentinels: el guardián abierto (3:45–4:20)

- Una librería **separada** de la billetera, abierta, que cualquier app de Open Payments puede usar.
- Seis revisiones: sello del banco (hash), permisos abusivos, destinos parecidos, cotización, conciliación y puntaje de riesgo.
- **No adivina: explica.** Cada veredicto trae su motivo y su prueba. Si duda, le pregunta al grupo.
- Ejemplo sobre el código oficial de Interledger en 3 líneas.

## 6. Bajo el capó (4:20–4:40)

Solo lo verificado:
- **Permiso real verificado** en la Test Wallet: permiso sin destinatario, con tope e intervalo, y hash válido (16 de octubre, 12:41).
- **EUR → COP:** el hermano de Madrid paga en euros y el destino recibe pesos exactos; la cotización real fija lo que llega y **se muestra lo que costó**, sin prometer una cifra de antemano.
- **Misma moneda, COP → COP:** costo medido **0,00 %** (cotización real, sin pago).
- **114 pruebas** de Open Sentinels, todas en verde.
- **El SDK oficial de Node no verifica el hash** de interacción: buscamos la función en `@interledger/open-payments` y no existe; el propio ejemplo oficial lo deja como pendiente (`// @TODO: Verify hash`). Es **defensa en profundidad**: el banco igual valida el `interact_ref`.

## 7. Límites honestos (4:40–4:55)

- El cupo es **autorizado, no garantizado**: si a alguien no le alcanza, su parte falla y la pantalla lo dice.
- La aprobación del grupo **la aplica la plataforma**: está inspirada en la multifirma, pero no es criptográfica.
- Un pago es **no atómico**: si un aporte falla, el gasto queda **Incompleto** y no se devuelve solo lo ya aportado.
- El guardián **no es infalible**: da advertencias verificables.

## 8. Cierre (4:55–5:00)

**Voz:** "En una hackatón todos construimos rápido y nadie tuvo tiempo de pensar en estafas. Construimos esa parte para todos: cualquier app de esta sala puede usar Open Sentinels desde hoy."

---

## Afirmaciones y evidencia

| Afirmación | Estado | Evidencia | Cómo decirla |
|---|---|---|---|
| 114 pruebas de Open Sentinels | ✅ Verificado | `npx vitest run packages/guardian` → 114 de 114 | "114 pruebas" |
| Permiso sin destinatario, con tope e intervalo, hash válido, en la Test Wallet real | ✅ Verificado (16 oct, 12:41) | `apps/api/src/members/README.md` ("Resultado real confirmado") | "Permiso real verificado" |
| El SDK oficial **de Node** no verifica el hash | ✅ Verificado | Búsqueda en `@interledger/open-payments`; el snippet oficial `grant/grant-continuation.ts` trae `// @TODO: Verify hash` | "El SDK **de Node**…" |
| "Los 5 SDKs oficiales no verifican el hash" | ❌ **No verificada** | No hay registro de que se revisaran los cinco | **No decirla.** El plan lo prohíbe: solo "el SDK de Node" |
| Costo 0,00 % en una cotización real | ✅ Verificado, **solo COP → COP** | `AI_USAGE.md`, "Evidencia real de la cotización R2" (4.000.000 → 4.000.000, sin pago) | "En la misma moneda, el costo medido fue 0 %" |
| "0 % de comisión en EUR → COP" | ❌ **No medida** | No hay cotización EUR → COP registrada con su costo. Medido: EUR → USD, recibir USD 10,00 costó EUR 9,95 (es un tipo de cambio) | **No decirla.** Decir "se muestra lo que costó" |
| EUR → COP con cotización real | ⚠️ Parcial | El README indica que el tercer aporte se debita en EUR según la quote real, sin cifra de costo | Sin cifra de costo |
| El permiso se renueva cada mes | ⚠️ **No demostrada** | R1: "no se probó la renovación mensual efectiva"; el intervalo sí se pide y se valida | "El banco lo hace cumplir", sin "lo demostramos" |
| Un solo rechazo detiene un pago riesgoso | ✅ Verificado | `engine.test.ts` y el ensayo de 3 corridas en modo respaldo | Igual |
| Gasto verificado solo tras `reconcile` | ✅ Verificado | `execute.test.ts`; el ensayo: pagado solo con `reconcile` en pass | Igual |
| El motivo de un aporte fallido nunca queda vacío ni filtra el error | ✅ Verificado por pruebas | `execute.test.ts` ("3b…"). El recorrido en vivo se confirma en la corrida de las 8:45 | Igual |
| Cupo del grupo $300.000 | ⚠️ **Solo en el respaldo** | En vivo el hermano en EUR no suma: se ve $200.000 | **No decir la cifra total** |
| Un hermano sin fondos / diferencia EUR 2 → EUR 1 | ⚠️ Sin explicar | `AI_USAGE.md`: una primera prueba real debitó EUR 2,00 y recibió EUR 1,00, sin causa atribuida | Si preguntan: "no la atribuimos a ninguna causa sin evidencia" |
| Nombre "Kivor" | ⚠️ Pendiente | El plan: "no se ha verificado disponibilidad comercial" | Evitar afirmar que es una marca registrada |
