# Evidencia y respaldo

`members.simulated.json` es sintético. No prueba aceptación de la Test Wallet.
No contiene identidades reales, tokens, llaves, nonces ni callbacks.

Una grabación real debe ir en archivo separado, con `source: test-wallet-recording`,
fecha y operaciones comprobadas. Solo puede incluir una lista explícita de
campos seguros (montos gastados sin identificadores y resultados booleanos),
nunca guardar respuestas completas del SDK. Una grabación saneada demuestra
lo observado en ese momento; reproducirla es modo respaldo, no consulta actual.

No se dispone todavía de grabaciones de pagos de R2: sus fixtures reales de
cobro, cotización, pago y conciliación deben entregarlas R2, con saneamiento.
