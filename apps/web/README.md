# Web de la billetera

Desde la raíz del repositorio:

- Modo simulado: `npm run dev:mock -w web`.
- Modo live: inicia `npm run dev:integration:api` y después `npm run dev:live -w web`.
- Desde otro dispositivo utiliza el origen HTTPS común descrito en el README raíz; localhost del teléfono no apunta al portátil.

El modo live conecta unión y retorno del banco, sesión, aprobaciones, pago,
consulta sin repetir intentos, cupo y revocación. Usa el arranque aislado descrito
en el README raíz: API 3100, web http://localhost:5180. Los puertos anteriores
3000/5173 pueden pertenecer a otros procesos; no se cierran automáticamente.

Live es el modo predeterminado de desarrollo/build. Para simular todo en la web,
usa explícitamente `npm run dev:mock -w web`. El respaldo del backend se selecciona
con `INTEGRATION_MODE=fixtures` y mantiene una etiqueta distinta del modo mock.
La prueba real de autorizaciones y pagos la realiza una persona, no el agente.

Para mostrar la banda de respuestas grabadas, inicia Vite con `VITE_DEMO_MODE=fixtures` en su entorno.
