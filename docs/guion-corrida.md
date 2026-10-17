# Guion de la corrida en vivo (sábado 17, 8:45)

Una persona por paso. Cada paso dice **qué se ve si todo sale bien** y **qué hacer si no**.
No se aprueba ni se paga nada en nombre de otra persona: cada dueño autoriza en su propia wallet.

| Rol | Hace |
|---|---|
| R1 | Prepara y arranca la API y la web; une a los hermanos |
| R2 | Paga la cuota del mes y mira cotizaciones y recepción |
| R4 | Conduce la pantalla; el "juez" hace el clic de rechazo |
| R5 | Mira que el guardián avise (riesgo, motivo) y que la etiqueta de modo se vea |
| R3 | Lee la API y los eventos en vivo; dice de quién es cada fallo |

## 0. Antes de empezar (R1, 8:30–8:40)

```bash
git pull origin main
```

```bash
npm ci
```

1. `.env` con la wallet de la aplicación y `.env.integration.json` con las wallets públicas (ambos ignorados por Git).
2. **En `.env.integration.json`, `pharmacy` debe ser `https://ilp.interledger-test.dev/farmacia-medellin`** (COP, escala 2).
   Con `far` el gasto a `farmacia-medel1in` solo da 20 puntos y se aprueba solo: el paso 4 no ocurre.
3. Puertos libres: `netstat -ano -p tcp | Select-String ':3100\s|:5180\s'` (no cerrar procesos de otra persona).
4. Terminal 1: `npm run dev:integration:api`. Terminal 2: `npm run dev:live -w web`. Abrir **http://localhost:5180**.
5. Comprobar (R3): `GET http://127.0.0.1:3100/api/wallets` → grupo "Medicinas de mamá", **0 miembros**, y
   `knownDestinations[0].walletAddress` termina en `/farmacia-medellin`.

Si algo de esto falla, **no seguir**: arreglar o pasar a `INTEGRATION_MODE=fixtures` (modo respaldo, con etiqueta).

## 1. Unirse — tres hermanos (R1 + cada dueño)

Cada dueño, en su navegador o perfil: Unirse → su wallet (COP 1, COP 2, EUR) → revisar tope e intervalo → Continuar → aprobar en la Test Wallet.

- **Esperado:** vuelve a la web con la unión confirmada; 3 miembros activos; "Nadie depositó nada".
  El cupo se muestra **por moneda**: el EUR no se suma al COP (ver "Pendiente").
- **Si falla:** "unión con error" → Unirse → **Descartar unión pendiente local** y repetir. Un hash inválido no une a nadie (es correcto).

## 2. Pagar la cuota del mes (R2)

Pedir un gasto de **$120.000** a la Farmacia → debe quedar **aprobado, riesgo 0** → **Pagar la cuota del mes**.

- **Esperado:** "1 de 3", "2 de 3", "3 de 3 aportes confirmados"; sello **Gasto verificado**; cada aporte con "Llegó $40.000"
  (el de Madrid se debita en EUR según la cotización real).
- **Si falla:** si dice "Gasto detenido" por la cotización, R2 anota `debitAmount` y `receiveAmount` y se decide el límite (`MAX_FEE_PERCENT`).
  Nunca se debe ver "pagado" sin el sello. Si queda **pendiente/desconocido**: **Consultar intentos y recepción (sin pagar)**; no se paga otra vez.

## 3. Aporte que falla (3b) — Madrid revoca antes de pagar

1. Pedir otro gasto de **$120.000** a la Farmacia (aprobado).
2. **Antes de pagar**, el hermano EUR pulsa **Revocar mi permiso** (confirma).
3. Pulsar **Pagar** (la cuota del mes).

- **Esperado:** **2 de 3 aportes confirmados · falta el hermano EUR**; estado **Incompleto**;
  motivo visible: *"El permiso del miembro no está disponible. Renueva su autorización; no se envió un pago."*
  No se marca pagado y no hay devolución automática de lo ya aportado.
- **Estado de la prueba:** el motivo sale del servicio de pagos de R2 y las pruebas del motor cubren que nunca quede vacío,
  pero **este recorrido exacto (revocar → pagar) no se ha probado en vivo**: es lo que se confirma en esta corrida.
- **Si el motivo sale vacío o dice otra cosa:** capturar pantalla y avisar a R3 con la hora. (En pruebas nunca queda vacío: hay respaldo "no se pudo confirmar el aporte".)
- Después de este paso el hermano EUR queda revocado: para repetir, **Reiniciar** y que se vuelva a unir.

## 4. El ataque: destino parecido (R4 pide, el juez decide)

Pedir un gasto → **Otra cuenta** → nombre "Farmacia (cuenta nueva)", dirección
`https://ilp.interledger-test.dev/farmacia-medel1in`, monto **120000**.

- **Esperado:** riesgo **94 · alto**, la advertencia "Esta cuenta se parece a la de Farmacia…", y "Esto necesita aprobación del grupo".
- **Si sale "Aprobado" con riesgo bajo:** la farmacia conocida no es `farmacia-medellin` (volver al paso 0.2). **No pulsar Pagar.**

## 5. El juez rechaza — un clic

El juez (o un integrante) pulsa **Rechazar**.

- **Esperado:** **"Rechazado por el grupo. El gasto no salió. Nadie pagó nada."** Un solo rechazo detiene un pago riesgoso.
  El cupo no cambia y el gasto ya no se puede pagar.

## Después de cada corrida

R3 anota hora y resultado de cada paso (✅/❌ + causa). Para repetir: botón **Reiniciar** (o `POST /api/demo/reset`);
no revoca permisos externos, y se niega si hay un pago en curso.

## Plan B si la Test Wallet falla

Reintentar una vez. Si sigue: `INTEGRATION_MODE=fixtures` → la web muestra la etiqueta **"Modo respaldo"** y se dice en voz alta:
*"La red de prueba no responde; estas son respuestas grabadas."* Último recurso: el video.

## Pendiente (opcional, solo si la corrida sale bien)

El cupo del grupo no suma al miembro en EUR: en vivo muestra $200.000, no $300.000. El pitch **no dice la cifra total**.
