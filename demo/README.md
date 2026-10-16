# Preparación de demo R1

`createDemoSeeds()` devuelve configuraciones tipadas de las tres billeteras.
Son **datos simulados**; las direcciones `.invalid` no son destinos reales y no
hay credenciales. Importa `createMembersMock(seeds.flatMap(w => w.members))` para
el escenario offline de R3. Los cobros, pagos y conciliación reales son de R2/R3.

Para preparar una instantánea local desde la raíz:

```powershell
npm exec -- tsx demo/reset.ts
```

Solo reescribe `demo/state.json`. No borra `.env`, llaves ni otras fixtures; no
contacta la Test Wallet. **No reinicia la memoria de un servidor abierto**.
En el proceso de R3, `resetDemo(store)` invalida las interacciones locales y
devuelve semillas nuevas; R3 debe recrear su motor y suscripciones antes de
cargarlas. Los permisos externos siguen existiendo; revocarlos requiere una
acción separada y explícita. No actives este reinicio durante pagos en vuelo.

Cambio exacto para R3, fuera del alcance de R1, en `package.json`:

```json
"demo:reset": "tsx demo/reset.ts"
```

Para resetear la app activa, R3 debe conectar la rutina en su proceso; el script
anterior por sí solo prepara el archivo. R4 debe mostrar siempre la etiqueta
`Modo respaldo — datos simulados` cuando use estos datos. Las respuestas reales
saneadas se guardan separadas en `/fixtures` y no se hacen pasar por pagos nuevos.

Para `DEMO_MODE=fixtures`, R3 puede usar
`createMembersBackup(process.env.DEMO_MODE, seeds.flatMap(w => w.members))`.
Devuelve `service`, `label` y `recordedAt`. R4 debe mostrar esa etiqueta completa:
solo los montos gastados proceden de una consulta grabada; las identidades,
topes de las semillas y nuevas autorizaciones son simulados. No permite pagos
reales. El respaldo completo de cobros/pagos/conciliación requiere fixtures de R2
y conexión del modo en R3/R4. No está integrado automáticamente en la aplicación.
