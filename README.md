# Billetera compartida + Guardián

Una billetera compartida que no guarda dinero, protegida por un guardián que cualquier app de Open Payments puede usar.

- Plan completo: [docs/plan-v6.md](docs/plan-v6.md)
- Cómo trabajar con la IA: [docs/guia-trabajo-con-ia.md](docs/guia-trabajo-con-ia.md)
- Reglas para agentes de IA: [AGENTS.md](AGENTS.md)

## Arrancar

```bash
git clone <este-repo> hackathon
git clone https://github.com/interledger/open-payments-snippets open-payments-snippets
cd hackathon
npm install
cp .env.example .env   # y llena tus valores
git checkout -b <tu-rama>   # r1-miembros · r2-pagos · r3-motor · r4-web · r5-guardian
```

`open-payments-snippets` va en una carpeta **hermana** (al lado de este repo), no adentro.

## Ramas

`r1-miembros`, `r2-pagos`, `r3-motor`, `r4-web`, `r5-guardian`. Cada uno sube su rama; R3 fusiona a `main` cada hora.

## Pruebas manuales del caso familiar

Integración preparada en **`codex/correcciones-integracion`**, desde `origin/main`
`a0bb896`. El usuario R1 autorizó expresamente cambios entre roles para esta tarea;
la excepción está registrada textual en `prompts/R1.md`. No cambia las reglas de
propiedad para otras tareas. No se agregan parque, inversión ni confirmación P2.

### Arranque aislado

Requiere Node 20+ y las credenciales existentes de la aplicación firmante en `.env`.
No compartas la llave de la aplicación con los miembros: cada dueño solo inicia
sesión y autoriza en su propia Test Wallet.

```powershell
npm ci
# Solo si no existe aún; conserva cualquier configuración local anterior:
if (-not (Test-Path .env.integration.json)) { Copy-Item demo/live-config.example.json .env.integration.json }
npm run dev:integration:api
```

En una segunda terminal, desde la misma raíz:

```powershell
npm run dev:live -w web
```

Abre **http://localhost:5180**. La API aislada escucha en `127.0.0.1:3100`;
Vite reenvía `/api` a ella. El callback es
`http://localhost:5180/api/join/finish`, en el mismo origen de la web.
Este arranque fuerza cobros por miembro y usa `INTEGRATION_MODE=live` por defecto,
sin depender del modo anterior de `.env`. No inicia permisos ni pagos al arrancar.
La web usa live por defecto; el modo mock se activa explícitamente con
`npm run dev:mock -w web`. `INTEGRATION_MODE=fixtures` selecciona respaldo en el
backend y muestra una etiqueta: consentimientos y pagos simulados, gastos de
miembros grabados. Ninguno demuestra una autorización o pago real nuevo.

Antes de arrancar, comprueba los puertos; no cierres procesos de otra persona:

```powershell
netstat -ano -p tcp | Select-String ':3100\s|:5180\s'
```

Vite usa `strictPort`: si 5180 está ocupado se detiene, en lugar de conectarte
silenciosamente a otro puerto. Para otro puerto de API define
`INTEGRATION_API_PORT` en ambas terminales. `API_PROXY_TARGET`, si se utiliza,
configura explícitamente el proxy de Vite. Mantén un solo backend para la prueba.

### Configuración consumida y metadatos públicos

`LIVE_CONFIG_PATH` apunta a `.env.integration.json`; sin variable, se utiliza esa
copia local si existe y, en su ausencia, `demo/live-config.example.json`.
El archivo solo contiene direcciones públicas y nombres. Nunca pongas llaves ni
tokens allí. La aplicación lee esa configuración al iniciar y valida metadatos
mediante `walletAddress.get` del SDK oficial; no presupone la moneda por el nombre.
La wallet firmante de `.env` debe coincidir con `application`; no se cambian sus
credenciales automáticamente.

Metadatos consultados el **17 de octubre de 2026**, sin crear recursos:

| Papel | Wallet (dominio `ilp.interledger-test.dev`) | Moneda | Escala | Tope propuesto en el formulario |
|---|---|---|---|---|
| Aplicación firmante | `/locknet-pruebas` | COP | 2 | No es un miembro precargado |
| Hermano COP 1 | `/hermano_2` | COP | 2 | COP 100.000 = `10000000` unidades mínimas |
| Hermano COP 2 | `/her` | COP | 2 | COP 100.000 = `10000000` unidades mínimas |
| Hermano EUR | `/c8b493c2` | EUR | 2 | EUR 22 = `2200` unidades mínimas |
| Farmacia | `/far` | COP | 2 | Recibe el monto del gasto en COP |

Las direcciones solo precargan el formulario. **Ningún miembro empieza activo**.
El intervalo se propone como `R12/<inicio-UTC-del-período>/P1M`, es editable y se
valida en el servidor. R1 soporta P1M (inicio del día 1 al 28) y P1D en UTC.
El cupo se presenta por moneda: el total COP no incluye EUR. No hay una tasa de
conversión independiente para sumar ambos. Un error de consulta elimina ese
importe de la suma y marca que el cupo no se pudo confirmar.

### Recorrido 1: autorización y pago exitoso (lo realiza una persona)

1. Abre `http://localhost:5180/#/unirse` en un navegador o perfil por dueño.
   Selecciona su wallet configurada, revisa nombre, moneda, escala, tope e intervalo.
   Elige la wallet que realmente controla esa persona.
2. Pulsa **Continuar**. Si Open Sentinels advierte sobre el permiso, revisa el aviso
   y decide tú si continúas. Solo entonces se navega a la Test Wallet.
3. Cada dueño autoriza con su propia cuenta. No se pide ni comparte su llave.
   Conserva el mismo navegador para el regreso: el servidor verifica sesión,
   estado, uso único y hash real antes de `grant.continue`. Solo tras validar
   los límites agrega al miembro y vincula esa identidad a la sesión del navegador.
4. Repite con los tres dueños. Debes ver tres miembros activos, cupos COP/EUR
   separados y cero depósitos a la aplicación. Si hay error de unión, vuelve a
   Unirse y utiliza **Descartar unión pendiente local** antes de empezar otra.
   Esto no revoca un permiso externo que pudiera existir en la wallet.
5. Desde una sesión autorizada pide, por ejemplo, medicina por **COP 120.000** a
   la Farmacia configurada. Se reparte en tres recepciones de **COP 40.000**.
   Los dos pagadores COP tienen débito COP; el tercero tiene débito EUR según
   la quote real. No se fija una conversión ni se promete un costo de antemano.
6. La regla predeterminada exige aprobación del grupo si supera COP 200.000 o
   el guardián eleva el riesgo. Para probar la aprobación puedes pedir un gasto
   mayor al umbral, revisando primero que los topes y fondos alcancen. Vota desde
   dos sesiones de miembros autorizados; un navegador no puede elegir identidades
   de otros dueños. Los gastos pequeños de bajo riesgo no requieren esos votos.
7. Pulsa **Pagar ahora** únicamente cuando quieras ejecutar. Debes ver el débito
   cotizado en la moneda de cada miembro, recepción efectiva en COP y progreso
   por aporte. Solo `reconcile` con recepción completa habilita **Gasto verificado**.
   Sin tasa de referencia, la comisión de cambio EUR/COP no se valida de forma
   independiente. El límite `MAX_FEE_PERCENT` sí controla la misma moneda.

### Recorrido 2: un hermano sin fondos

1. Usa una wallet que ya esté sin fondos; la aplicación no altera ni garantiza
   sus fondos. La autorización de cupo no demuestra que pueda pagar.
2. Realiza una solicitud nueva y ejecútala tú. Los aportes recibidos deben
   mantenerse visibles; si dos llegan y el tercero falla, queda **Incompleto**,
   no “pagado”. No hay devolución automática de los otros aportes.
3. Solo se muestra “fondos insuficientes” si el proveedor confirma esa causa.
   Un permiso rechazado, un cupo agotado o un problema temporal no se presentan
   como falta de fondos. Si el proveedor solo devuelve `failed`, la causa queda
   sin confirmar.
4. Si aparece **pendiente/desconocido**, usa **Consultar intentos y recepción
   (sin pagar)**. Se conservan los IDs y se consulta el mismo intento; no se crea
   otro outgoing. Un timeout no es un fallo confirmado y bloquea el reintento.
   También bloquea ejecutar otros gastos del grupo hasta resolver ese resultado;
   crear otra solicitud no evita la protección.
5. Si el fallo es definitivo, corrige tú la causa y reintenta solo el aporte que
   falta. Antes se vuelve a consultar lo recibido y se descuenta cualquier parte
   que ya hubiera llegado. Si esa consulta falla, no se inicia otro pago.

### Revocación, reinicio y límites de recuperación

En Inicio, cada sesión autorizada puede usar **Revocar mi permiso**; requiere una
confirmación explícita. La aplicación llama `grant.cancel`, bloquea `tokenFor` y
actualiza al miembro y el cupo. No se revoca nada por arrancar, navegar o hacer reset.

**Reiniciar** elimina memoria de la aplicación y sesiones; NO revoca los permisos
externos. Se rechaza con pagos en curso o intentos pendientes/desconocidos.
`npm run demo:reset` solo prepara `demo/state.json`: no reinicia un servidor abierto.

Los miembros, tokens, sesiones y gestión autenticada de cobros viven en memoria.
Tras cerrar el backend necesitas uniones nuevas; puedes revocar permisos antiguos
directamente en Test Wallet. Nunca reutilices una identidad o token inventado.
El diario `.env.payment-attempts.json` conserva únicamente IDs y estados, con
escritura anterior al outgoing. `PAYMENT_JOURNAL_PATH` permite elegir otra ruta
local ignorada. No lo subas ni lo borres para desbloquear un pago desconocido.
Si al reiniciar encuentra intentos no terminales, **bloquea pagos nuevos**: no se
restauran tokens ni se adivina qué ocurrió. Hace falta revisar esos IDs en la wallet
y conciliar manualmente antes de archivar el diario. Sin un ID devuelto por el
proveedor, la recuperación no puede automatizarse de forma segura.

### Otro dispositivo

`localhost` del teléfono apunta al teléfono. Para consentimientos de compañeros,
publica **Vite:5180 y su proxy `/api` bajo un único origen HTTPS** mediante una
herramienta que configure el equipo. Define ese origen, sin ruta ni fragmento,
en `INTEGRATION_ORIGIN` de ambas terminales y reinícialos antes de crear uniones.
Vite permite ese hostname explícito; no se desactiva su comprobación de host.
El QR apunta al origen que está abierto en el navegador. Deben abrirlo por el
HTTPS público, no por localhost ni por la IP HTTP del portátil. Las cookies de
sesión son HttpOnly, SameSite=Lax y Secure en HTTPS. No cambies de origen ni
navegador durante el consentimiento. La API rechaza orígenes de mutación ajenos;
no se habilitó CORS con credenciales para dominios arbitrarios.

### Validación y alcance de la evidencia

Fuentes: guías oficiales de [pagos futuros](https://openpayments.dev/guides/outgoing-grant-future-payments/),
[quotes](https://openpayments.dev/sdk/quote-create/),
[consulta de outgoing](https://openpayments.dev/sdk/outgoing-get/) e
[incoming](https://openpayments.dev/sdk/incoming-get/).
No se supone que `sentAmount` sea el débito; el seguimiento usa el outgoing y la
recepción del incoming correspondiente, sin atribuir otros aportes a ese miembro.

Los contratos añaden campos opcionales `PaymentAttempt`, cupos por moneda y
frescura, cancelación solo local y el evento `spend-updated`, conservando los
estados públicos existentes. Los consumidores importan estos tipos de `/contracts`.

La sesión de implementación comprobó arranque live, proxy, configuración pública,
grupo vacío y formulario COP/EUR, sin solicitar permisos ni pagos. Las pruebas
automatizadas usan el guardián real donde se verifica el hash y simulan la red del
SDK. Cubren suplantación, sesión, repetición, unión pendiente, timeout, respuesta
perdida, recepción temporalmente inaccesible y diario de recuperación. **El flujo
financiero real sigue pendiente de los dos recorridos humanos anteriores.**

```powershell
npm test
npm run typecheck
npm run build -w web
git diff --check
```

Resultado de esta corrección: **496 pruebas aprobadas en 47 archivos**, typecheck,
build y revisión de formato correctos. Se revisaron 134 archivos de texto sin
coincidencias con los patrones de secretos comprobados. `.env`, la llave, la
configuración local y el diario están ignorados y no versionados. Se conservaron
los procesos anteriores en 3000/5173; el arranque comprobado usa 3100/5180.

## Recuperar intentos existentes sin volver a pagar

Un incoming con importe COP 60.000 y estado EXPIRED describe un cobro solicitado
que venció. No demuestra un abono: la conciliación lee `receivedAmount`.
Tampoco demuestra por sí solo que el outgoing haya fallado.

El servicio distingue el permiso del miembro, la lectura del cobro y la vigencia
de la quote. Rechaza cobros cerrados/vencidos y cotizaciones vencidas antes de
crear un outgoing. Una lectura 401/403 intenta obtener únicamente acceso `read`;
no solicita un permiso nuevo de creación de pagos. Si necesita consentimiento,
no elimina la incertidumbre ni atribuye el fallo a fondos insuficientes.

Para recuperar IDs ya existentes cuando la lectura original dejó de funcionar:

1. Conserva el proceso anterior y el diario. Guarda sus respuestas públicas de
   `/api/wallets` y `/api/wallets/w-mama/spends` como arrays en el archivo ignorado
   `.env.recovery-state.json`: `{ capturedAt, wallets, spends }`. No contiene tokens.
2. Ejecuta `npm run op -- demo/recovery-server.ts` desde la raíz. Escucha en
   `http://localhost:3345` (RECOVERY_PORT opcional). No puede crear cobros,
   cotizaciones ni pagos. No cancela permisos existentes.
3. Cada dueño abre ese origen en su propio perfil y solicita un permiso de lectura.
   El callback valida cookie, state, vencimiento, uso único y hash de Open Sentinels.
   Solo acepta `outgoing-payment` con `read` y `read-all` para la wallet solicitada;
   nunca incluye `create`. Este diagnóstico de lectura histórica fue autorizado por R1.
4. Pulsa el botón de consulta. Solo usa GET de los IDs existentes; los permisos
   automáticos para incoming tienen únicamente acción `read`. Los tokens quedan
   en memoria y nunca se guardan ni se imprimen.
5. El informe `.env.recovery-report.json` muestra los resultados saneados. El diario
   conserva `pending/unknown` hasta comprobar recepción o un outgoing fallido.
   Un error de lectura y un cobro vencido NO desbloquean por sí solos el historial.
6. Reinicia la API principal solamente cuando se haya resuelto el informe.
   Los permisos y sesiones anteriores de la app no se restauran: los dueños se
   unen de nuevo. Conserva la copia del historial; nunca borres el diario para
   saltarte el bloqueo. Reiniciar no cancela pagos del proveedor.

`npm run op -- demo/recover-existing-payments.ts` es un diagnóstico de lectura
sin modificar el diario por defecto. `--apply` registra solo los estados que se
pudieron consultar y conserva desconocidos cuando no se pudieron verificar;
si el proveedor exige interacción utiliza el servidor anterior. Ninguno de los
comandos ejecuta pagos. La aceptación real de grants read y los resultados de
la red deben comprobarlos los dueños en su navegador; los tests usan SDK simulado.

Si el informe indica `stage: outgoing`, falló la lectura del pago del miembro;
`stage: incoming` identifica la lectura del cobro de la farmacia. Un HTTP 401
no demuestra que el pago haya fallado. No repitas pagos ni borres el diario.
La página retira los permisos de lectura al vencer su `expires_in`; solicitar
permisos nuevos repetidamente no resuelve un 401 que también aparece con un
permiso recién emitido. Conserva el informe saneado para revisar con el proveedor.

La recuperación también puede confirmar un intento fallido sin leer el cobro si
el proveedor devuelve `failed: true` y `sentAmount.value: "0"`, con moneda y escala
comparables a un `debitAmount` positivo. No inventa un `receivedAmount` de cero.
Un pago pendiente, un envío parcial, una lectura rechazada o `EXPIRED` por sí solo
mantienen el bloqueo. La API de una sesión ya abierta conserva su diario en memoria:
actualizarlo externamente no prueba que ese proceso haya cargado los estados nuevos.
No reiniciar la API ni perder uniones hasta completar la recuperación y guardar
el estado público. No se habilita un pago real mientras quede algún intento incierto.
