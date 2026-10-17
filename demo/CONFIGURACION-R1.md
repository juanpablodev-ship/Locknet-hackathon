# Configuración de R1 para Medicinas de mamá, cada mes

La farmacia confirmada por R1 es https://ilp.interledger-test.dev/far:
COP, escala 2. No corresponde a la dirección farmacia-medellin consultada,
que devolvió USD. El nombre visible de una cuenta no determina su dirección
ni la moneda de otra dirección con un nombre parecido.

## Direcciones de esta demo

| Persona | Dirección | Moneda | Escala | Tope mensual |
|---|---|---|---|---|
| Hermano en Bogotá | https://ilp.interledger-test.dev/hermano_2 | COP | 2 | 100.000 COP |
| Hermana en Medellín | https://ilp.interledger-test.dev/her | COP | 2 | 100.000 COP |
| Hermano en Madrid | https://ilp.interledger-test.dev/c8b493c2 | EUR | 2 | 22 EUR |
| Farmacia | https://ilp.interledger-test.dev/far | COP | 2 | No aplica |

Metadatos consultados con walletAddress.get del SDK oficial. Estos datos no
prueban fondos, propiedad ni consentimientos bancarios. Esas verificaciones
requieren la sesión del dueño y el callback real.

## Configuración local

El archivo versionado live-config.example.json contiene únicamente direcciones
públicas; nunca llaves ni tokens. Copiarlo a .env.integration.json solo en una
instalación nueva. En una instalación existente, comparar y conservar las
credenciales y la configuración de otras personas antes de reemplazar archivos.

El valor correcto para este equipo es:

```json
"pharmacy": "https://ilp.interledger-test.dev/far"
```

R1 lo dejó tanto en .env.integration.json como en .env.r1-live.json. Ambos se
mantienen ignorados por Git. La configuración se carga al arrancar la API;
no reiniciar un proceso con intentos sin conciliar ni borrar su diario para
aplicar cambios. Las sesiones y permisos de la aplicación actual son en memoria.

Preparación de unión de R1: http://localhost:5183/#/unirse (API 3103).
Respaldo aislado: http://localhost:5182 (API 3102). Estos procesos locales deben
estar ejecutándose; no son URLs publicadas en Internet.

## Prueba del juez: pendiente de ajustar el guion con R3/R5

Se comprobó con checkDestination real:

| Conocida | Candidata | Riesgo |
|---|---|---|
| far | farmacia-medel1in | 20 |
| farmacia-medellin | farmacia-medel1in | 94 |

Por tanto, cambiar el nombre visible de far a Farmacia Medellín no hace que
la segunda comparación se aplique. Open Sentinels compara las direcciones.
No registrar la dirección USD como confiable para maquillar la puntuación.
No alterar el umbral ni inflar puntos para que la demo aparente detectar
una similitud inexistente. R3/R5 deben acordar un destino de ataque que sí
se parezca a la dirección COP real o una pareja de direcciones COP controladas.

En fixtures la pareja ilustrativa farmacia-medellin/farmacia-medel1in sigue
siendo simulada y está etiquetada. No presentarla como una corrida real nueva.

## Estado de evidencia

- demo:reset, reset HTTP en fixtures y pantalla de respaldo: comprobados.
- R1, respaldo y regresiones de R5: 170 pruebas aprobadas en la revisión anterior.
- Las tres uniones reales y sus capturas nuevas: pendientes.
- Intentos anteriores: conservados; ningún pago nuevo se ejecutó aquí.
- README general y fila actualizada de R1 en AI_USAGE: después de la corrida
  de las 09:15, conforme al plan aprobado; no declarar esa corrida completada.

Fuente: https://openpayments.dev/sdk/wallet-address-get/

Validación final tras incorporar origin/main: 540 pruebas aprobadas, 50 archivos;
npm run typecheck correcto. API de preparación 3103 consultada por HTTP:
pharmacy y knownDestinations apuntan a far, COP, escala 2.
