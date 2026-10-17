# Recuperación de pagos: rechazo HTTP 401

Comprobado el 17 de octubre de 2026 contra Interledger Test Wallet.

- La clave pública derivada de la llave local coincide con el KEY_ID registrado.
- El authorization server emite un grant incoming-payment/read con expires_in=600.
- El GET inmediato del ID de cobro histórico devuelve HTTP 401, descripción Unauthorized.
- Se reprodujo con identifier de la wallet y sin identifier.
- Tras autorización explícita del usuario, read-all devuelve el mismo 401 al leer ese ID.
- El GET público del mismo cobro también devuelve 401; no se usa para conciliar importes.
- No hubo creación de cobros, cotizaciones o pagos durante estos diagnósticos.

Esto no determina si los pagos anteriores fallaron, siguen pendientes o se completaron.
No hay causa raíz confirmada. No atribuirlo a fondos insuficientes, revocación,
expiración del cobro o firma inválida sin evidencia adicional del proveedor.
Conservar el diario y los bloqueos mientras no pueda comprobarse el resultado.

El informe de recuperación ahora identifica outgoing, incoming o validation como
etapa del fallo. Los errores se guardan sin respuestas completas ni credenciales.
La pantalla de recuperación retira los permisos cuando vence expires_in.

Para consultar al proveedor: solicitar revisión del 401 del GET de un incoming
histórico con grant recién emitido. Compartir por un medio privado los IDs públicos
del informe local y la hora de la consulta; nunca tokens ni la llave privada.

Fuentes: https://openpayments.dev/sdk/incoming-get/
y https://openpayments.dev/sdk/grant-create-incoming/
