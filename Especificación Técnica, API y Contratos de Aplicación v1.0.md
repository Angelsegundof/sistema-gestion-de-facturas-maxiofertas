# Especificación Técnica, API y Contratos de Aplicación v1.0
## Sistema de Gestión de Facturas Maxiofertas

**Proyecto:** Sistema de Gestión de Facturas Maxiofertas  
**Tipo de documento:** Especificación Técnica / API y Contratos de Aplicación  
**Versión:** 1.0  
**Estado:** Propuesta para revisión y aprobación  
**Fecha:** 19 de agosto de 2026  
**Responsable funcional:** Ángel Ferrer  
**Rol responsable del documento:** Arquitecto/a de Software / API Senior  
**Implementación prevista:** Antigravity  
**Frontend / Backend:** Next.js  
**Hosting:** Vercel  
**Base de datos:** PostgreSQL / Neon  
**Almacenamiento:** Cloudflare R2  
**Organización:** Maxiofertas  

---

# 1. Propósito del documento

Este documento define los contratos técnicos que deberán respetar:

- frontend;
- lógica server-side;
- API;
- servicios de dominio;
- PostgreSQL;
- Cloudflare R2;
- autenticación;
- autorización;
- sistema de estadísticas;
- sistema de rectificaciones.

Su propósito principal es impedir que decisiones importantes de implementación queden abiertas a interpretación.

Este documento define:

- endpoints;
- contratos request/response;
- validaciones;
- códigos de error;
- transiciones de estados;
- reglas transaccionales;
- concurrencia;
- idempotencia;
- cálculo de precios;
- cálculo de cuadratura;
- almacenamiento documental;
- permisos;
- estadísticas;
- rectificaciones;
- contratos de dominio.

---

# 2. Documentos rectores

La implementación deberá respetar:

1. PRD — Sistema de Gestión de Facturas Maxiofertas.
2. Actualización PRD v1.1 — Reglas de Precios, Rectificaciones y Notas de Crédito.
3. Documento de Diseño Funcional y UX.
4. Actualización Diseño Funcional y UX v1.1.
5. Documento de Arquitectura de Solución v1.0.
6. Enmienda Arquitectónica v1.1 — Integración con Hub Maxiofertas.
7. Modelo de Dominio y Diseño de Base de Datos v1.0.

---

# 3. Precedencia documental

Ante contradicción:

```text
PRD aprobado
↓
Actualizaciones funcionales aprobadas
↓
Arquitectura aprobada
↓
Modelo de Datos
↓
Esta Especificación Técnica
↓
Implementación
```

Antigravity no deberá resolver contradicciones unilateralmente.

Deberá utilizar:

```text
BLOCKED — DECISION REQUIRED
```

---

# 4. Decisiones técnicas cerradas

La V1 utilizará:

```text
Next.js
Vercel
PostgreSQL
Neon
Cloudflare R2
Google OAuth
```

No utilizará:

```text
Supabase
Firebase
MongoDB
Redis obligatorio
GraphQL
microservicios
colas externas
Kubernetes
```

sin nueva aprobación.

---

# 5. Hub Maxiofertas

El Hub es un sistema externo y fuera de alcance.

Antigravity:

**NO deberá modificar el Hub.**

El sistema nuevo únicamente deberá entregar URLs funcionales que posteriormente podrán enlazarse desde el Hub.

---

# 6. Arquitectura de aplicación

Se utilizará una aplicación Next.js única.

Arquitectura lógica:

```text
UI
↓
Application Layer
↓
Domain Services
↓
Repositories / Integrations
↓
PostgreSQL / R2
```

---

# 7. Separación interna

Se deberán separar al menos conceptualmente:

```text
src/
├── app/
├── features/
├── domain/
├── application/
├── infrastructure/
├── lib/
└── types/
```

La estructura exacta podrá ajustarse mientras mantenga separación de responsabilidades.

---

# 8. Backend

No se implementará un backend independiente.

La API podrá implementarse mediante:

- Route Handlers;
- Server Actions para operaciones internas apropiadas;
- servicios server-side.

---

# 9. API

Los endpoints HTTP seguirán convención:

```text
/api/v1/...
```

La versión deberá aparecer explícitamente.

Ejemplo:

```text
/api/v1/invoice-requests
```

---

# 10. Formato

La API utilizará:

```text
application/json
```

excepto operaciones documentales.

---

# 11. Contrato estándar de éxito

Ejemplo:

```json
{
  "success": true,
  "data": {}
}
```

---

# 12. Contrato estándar de error

```json
{
  "success": false,
  "error": {
    "code": "REQUEST_NOT_FOUND",
    "message": "No encontramos la solicitud indicada."
  }
}
```

---

# 13. Información técnica de error

Información sensible o stack traces no deberán devolverse al navegador.

Opcionalmente podrá incluirse:

```json
{
  "requestId": "..."
}
```

para correlación con logs.

---

# 14. HTTP status codes

Se utilizarán:

```text
200 OK
201 Created
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
503 Service Unavailable
```

---

# 15. Autenticación

La identidad será proporcionada mediante Google OAuth.

No habrá:

- registro público;
- usuario/contraseña propios;
- recuperación de contraseña propia.

---

# 16. Usuario interno

Después de autenticarse:

```text
Google email
↓
normalize email
↓
users.email
↓
active
↓
role
↓
warehouse
```

---

# 17. Normalización de email

Se deberá aplicar:

```text
trim
lowercase
```

antes de buscar el usuario.

---

# 18. Usuario inexistente

Si Google autentica correctamente pero no existe en `users`:

```text
403 Forbidden
```

Código:

```text
USER_NOT_AUTHORIZED
```

---

# 19. Usuario inactivo

Respuesta:

```text
403 Forbidden
```

Código:

```text
USER_DISABLED
```

---

# 20. Roles

```text
WAREHOUSE_USER
INVOICE_EXECUTOR
MANAGEMENT
ADMIN
```

---

# 21. Validación de permisos

Los permisos se comprobarán server-side.

Nunca se confiará solamente en:

- ruta;
- botón oculto;
- estado frontend;
- parámetros enviados por navegador.

---

# 22. RUT

El sistema deberá normalizar RUT antes de almacenamiento y búsqueda.

Ejemplo:

```text
76.123.456-7
```

→

```text
761234567
```

---

# 23. Validación de RUT

La implementación deberá validar:

- caracteres permitidos;
- longitud razonable;
- dígito verificador.

Un RUT inválido no podrá crear una solicitud nueva.

Código:

```text
INVALID_RUT
```

---

# 24. Precios

Regla autoritativa:

> El solicitante ingresa únicamente precios con IVA incluido.

Contrato de producto:

```json
{
  "description": "Toldo con estructura",
  "quantity": 2,
  "unitPriceGross": 28000
}
```

El solicitante NO enviará:

```text
unitPriceNet
vat
```

---

# 25. Moneda

V1 utilizará:

```text
CLP
```

Montos expresados en pesos enteros.

---

# 26. Prohibición de float

No utilizar:

```javascript
parseFloat()
```

como mecanismo monetario de dominio.

No utilizar columnas SQL:

```text
REAL
FLOAT
DOUBLE PRECISION
```

para valores financieros.

---

# 27. Algoritmo oficial gross → net

Para V1 se establece:

```text
unitPriceNet =
ROUND_HALF_UP(
    unitPriceGross / 1.19
)
```

a cero decimales.

---

# 28. Implementación decimal

El cálculo deberá realizarse mediante:

- `NUMERIC` de PostgreSQL;
- librería decimal exacta;
- aritmética entera equivalente.

No mediante binary floating point.

---

# 29. Ejemplo

```text
Precio IVA incluido:
28.000

28.000 / 1,19 =
23.529,411...

Precio neto para SII:
23.529
```

---

# 30. Fuente de verdad

La fuente funcional de verdad será:

```text
unitPriceGross
```

El neto es un valor derivado.

Ambos deberán persistirse.

---

# 31. Total bruto por línea

```text
lineTotalGross =
quantity × unitPriceGross
```

---

# 32. Total neto por línea

```text
lineTotalNet =
quantity × unitPriceNet
```

---

# 33. Total esperado

```text
expectedGrossTotal =
SUM(lineTotalGross)
```

Este será el monto principal mostrado como:

> TOTAL QUE DEBE DAR EN SII.

---

# 34. No permitir total manual divergente

El frontend puede mostrar el total.

Pero el servidor deberá recalcularlo.

No se confiará en:

```text
total enviado por navegador
```

como fuente de verdad.

---

# 35. Cuadratura con SII

El ejecutor ingresará:

```text
siiGrossTotal
```

manualmente después de generar la factura.

---

# 36. Diferencia

```text
grossDifference =
siiGrossTotal - expectedGrossTotal
```

---

# 37. Estado de cuadratura

Si:

```text
difference = 0
```

→

```text
MATCH
```

Si:

```text
ABS(difference) <= 2
```

y no es 0:

```text
ROUNDING_ACCEPTED
```

Si:

```text
ABS(difference) > 2
```

→

```text
MISMATCH
```

La tolerancia de ±2 CLP quedó definida en arquitectura.

---

# 38. Ejemplo

```text
Solicitud: $68.000
SII:       $67.999

difference = -1
```

Resultado:

```text
ROUNDING_ACCEPTED
```

---

# 39. Error de cuadratura

```text
Solicitud: $68.000
SII:       $68.003
```

Resultado:

```text
MISMATCH
```

La operación no podrá finalizar normalmente.

---

# 40. Folio SII

**No requerido en V1.**

No deberá bloquear:

- creación;
- procesamiento;
- finalización;
- rectificación.

Podrá añadirse posteriormente mediante actualización de especificación.

---

# 41. XML / DTE

**Fuera de alcance V1.**

No implementar:

- carga XML;
- parsing DTE;
- validación XML;
- almacenamiento XML;
- firma;
- CAF.

---

# 42. PDF

V1 utilizará:

```text
application/pdf
```

para:

- factura;
- Nota de Crédito.

---

# 43. Tamaño máximo

```text
2 MB
```

por documento.

---

# 44. API — sesión actual

## GET `/api/v1/me`

Devuelve usuario autenticado.

Respuesta:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "usuario@empresa.cl",
    "name": "Usuario",
    "role": "WAREHOUSE_USER",
    "warehouse": {
      "id": "uuid",
      "name": "Santiago"
    }
  }
}
```

---

# 45. API — bodegas

## GET `/api/v1/warehouses`

Permisos:

```text
ADMIN
MANAGEMENT
INVOICE_EXECUTOR
```

`WAREHOUSE_USER` sólo deberá recibir las bodegas que pueda utilizar.

---

# 46. API — clientes por RUT

## GET `/api/v1/customers/by-rut/{rut}`

Objetivo:

autocompletar cliente.

Respuesta encontrada:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "rut": "76.123.456-7",
    "legalName": "Comercial Ejemplo SPA",
    "businessActivity": "Venta al por menor",
    "phone": "+569...",
    "email": "cliente@ejemplo.cl"
  }
}
```

---

# 47. Cliente inexistente

Respuesta:

```text
404
CUSTOMER_NOT_FOUND
```

El frontend lo interpretará como:

> Cliente nuevo.

No como error crítico.

---

# 48. Crear solicitud

## POST `/api/v1/invoice-requests`

Permisos:

```text
WAREHOUSE_USER
ADMIN
```

---

# 49. Request

```json
{
  "customer": {
    "rut": "76.123.456-7",
    "legalName": "Comercial Ejemplo SPA",
    "businessActivity": "Venta al por menor",
    "phone": "+56912345678",
    "email": "cliente@ejemplo.cl"
  },
  "warehouseId": "uuid",
  "items": [
    {
      "description": "Toldo con estructura",
      "quantity": 2,
      "unitPriceGross": 28000
    },
    {
      "description": "Lateral de toldo",
      "quantity": 1,
      "unitPriceGross": 12000
    }
  ],
  "notes": null,
  "duplicateOverride": false
}
```

---

# 50. Servidor al crear

El servidor deberá:

1. validar usuario;
2. validar bodega;
3. validar RUT;
4. crear/actualizar cliente según contrato;
5. calcular netos;
6. calcular totales;
7. ejecutar detector de duplicados;
8. bloquear o advertir según flujo;
9. generar número de solicitud;
10. crear solicitud;
11. crear líneas;
12. crear historial;
13. crear auditoría.

Todo dentro de una unidad de trabajo consistente.

---

# 51. Detector de duplicado

Antes de persistir definitivamente deberá comprobar:

- `rut_canonical`;
- bodega;
- total bruto;
- período reciente.

Opcionalmente:

- cantidad de líneas;
- descripción normalizada;
- cantidades.

---

# 52. Ventana inicial de duplicados

Se recomienda inicialmente:

```text
24 horas
```

como ventana de búsqueda.

La ventana deberá quedar configurable.

---

# 53. Respuesta de posible duplicado

HTTP:

```text
409 Conflict
```

Código:

```text
POSSIBLE_DUPLICATE
```

Ejemplo:

```json
{
  "success": false,
  "error": {
    "code": "POSSIBLE_DUPLICATE",
    "message": "Existe una solicitud similar creada recientemente.",
    "details": {
      "candidate": {
        "id": "uuid",
        "requestNumber": "FAC-2026-001839",
        "createdAt": "2026-08-19T14:22:00-04:00",
        "grossTotal": 68000,
        "status": "PENDING"
      }
    }
  }
}
```

---

# 54. Continuar pese a duplicado

El cliente repetirá el POST con:

```json
{
  "duplicateOverride": true
}
```

El servidor deberá registrar:

```text
duplicate_warning = true
duplicate_override = true
```

y auditoría.

---

# 55. Respuesta de creación

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "requestNumber": "FAC-2026-001842",
    "status": "PENDING",
    "expectedGrossTotal": 68000,
    "createdAt": "..."
  }
}
```

HTTP:

```text
201 Created
```

---

# 56. Listar solicitudes propias

## GET `/api/v1/invoice-requests/mine`

Permiso:

```text
WAREHOUSE_USER
```

Filtros:

```text
status
page
pageSize
```

---

# 57. Listado de cola

## GET `/api/v1/invoice-requests`

Permisos:

```text
INVOICE_EXECUTOR
MANAGEMENT
ADMIN
```

Filtros:

```text
status
warehouseId
requestedBy
assignedTo
from
to
search
page
pageSize
```

---

# 58. Orden por defecto

Para:

```text
status=PENDING
```

orden:

```text
created_at ASC
```

La solicitud más antigua primero.

---

# 59. Paginación

Se recomienda:

```text
pageSize default = 25
max = 100
```

---

# 60. Búsqueda

`search` deberá poder considerar:

- request number;
- RUT;
- razón social;
- teléfono.

---

# 61. Obtener solicitud

## GET `/api/v1/invoice-requests/{id}`

El resultado dependerá del rol.

No necesariamente todos los campos se devolverán a todos los roles.

---

# 62. Tomar solicitud

## POST `/api/v1/invoice-requests/{id}/claim`

Permisos:

```text
INVOICE_EXECUTOR
ADMIN
```

---

# 63. Operación atómica

La implementación deberá ser equivalente a:

```sql
UPDATE invoice_requests
SET
  status = 'IN_PROGRESS',
  assigned_to = :user,
  assigned_at = NOW()
WHERE id = :id
AND status = 'PENDING'
AND assigned_to IS NULL;
```

Sólo:

```text
rows affected = 1
```

significa éxito.

---

# 64. Conflicto

Si otra persona tomó la solicitud:

```text
409 Conflict
REQUEST_ALREADY_CLAIMED
```

---

# 65. Reasignación

## POST `/api/v1/invoice-requests/{id}/reassign`

Permiso:

```text
ADMIN
```

Request:

```json
{
  "assignedTo": "uuid",
  "reason": "Ejecutor no disponible."
}
```

Auditoría obligatoria.

---

# 66. Solicitar corrección pre-factura

## POST `/api/v1/invoice-requests/{id}/request-correction`

Permisos:

```text
INVOICE_EXECUTOR
ADMIN
```

---

# 67. Request

```json
{
  "reason": "INVALID_RUT",
  "comment": "Revisa el dígito verificador."
}
```

---

# 68. Resultado

Solicitud:

```text
NEEDS_CORRECTION
```

Debe liberarse asignación operativa si así se implementa.

---

# 69. Corregir solicitud

## PATCH `/api/v1/invoice-requests/{id}/correction`

Permisos:

```text
WAREHOUSE_USER propietario
ADMIN
```

Sólo permitido cuando:

```text
status = NEEDS_CORRECTION
```

---

# 70. Campos modificables

Podrán actualizarse:

- RUT;
- razón social;
- giro;
- teléfono;
- correo;
- productos;
- cantidades;
- precios brutos;
- observaciones.

El servidor deberá recalcular todos los campos derivados.

---

# 71. Reenvío

Después de corregir:

```text
status = PENDING
```

La solicitud vuelve a la cola.

---

# 72. Historial

Las correcciones deberán registrar:

- valores anteriores;
- valores nuevos;
- usuario;
- fecha.

---

# 73. Cancelación

## POST `/api/v1/invoice-requests/{id}/cancel`

Permiso según matriz final.

Como mínimo:

```text
ADMIN
```

Puede habilitarse solicitante mientras esté pendiente si el PRD final lo autoriza.

---

# 74. API de cuadratura

## POST `/api/v1/invoice-requests/{id}/reconcile`

Permisos:

```text
INVOICE_EXECUTOR
ADMIN
```

Request:

```json
{
  "siiGrossTotal": 67999
}
```

---

# 75. Response

```json
{
  "success": true,
  "data": {
    "expectedGrossTotal": 68000,
    "siiGrossTotal": 67999,
    "difference": -1,
    "status": "ROUNDING_ACCEPTED"
  }
}
```

---

# 76. Error MISMATCH

No es un error HTTP.

La API puede responder `200` con:

```json
{
  "status": "MISMATCH"
}
```

porque el cálculo fue correcto; el problema es funcional.

El frontend deberá impedir avanzar a finalización.

---

# 77. Subida documental

La aplicación no deberá enviar credenciales R2 al cliente.

Se permitirá una de estas dos estrategias:

### Opción preferida

URL prefirmada de subida.

### Alternativa

Upload a Route Handler server-side.

La implementación elegirá la estrategia que resulte más simple dentro de los límites de Vercel.

---

# 78. Preparar upload

## POST `/api/v1/documents/upload-intent`

Request:

```json
{
  "entityType": "INVOICE_REQUEST",
  "entityId": "uuid",
  "documentType": "INVOICE",
  "fileName": "factura.pdf",
  "mimeType": "application/pdf",
  "fileSize": 324000
}
```

---

# 79. Validaciones upload

Servidor:

```text
mimeType == application/pdf
fileSize > 0
fileSize <= 2 MB
usuario autorizado
entidad válida
estado válido
```

---

# 80. Respuesta conceptual

```json
{
  "success": true,
  "data": {
    "uploadUrl": "...",
    "storageKey": "..."
  }
}
```

La URL deberá expirar.

---

# 81. Confirmar upload

## POST `/api/v1/documents/confirm`

Request:

```json
{
  "storageKey": "...",
  "entityId": "uuid",
  "documentType": "INVOICE"
}
```

El servidor deberá comprobar que el objeto exista antes de crear metadata definitiva.

---

# 82. No confiar en confirmación cliente

No deberá bastar que el navegador diga:

> “subí el archivo”.

El servidor deberá validar el objeto.

---

# 83. Crear factura final

## POST `/api/v1/invoice-requests/{id}/complete`

Permisos:

```text
INVOICE_EXECUTOR asignado
ADMIN
```

---

# 84. Precondiciones

Debe cumplirse:

```text
status = IN_PROGRESS
```

y:

```text
reconciliation_status IN (
  MATCH,
  ROUNDING_ACCEPTED
)
```

y:

```text
PDF válido asociado
```

---

# 85. Request

V1 no requiere folio:

```json
{
  "documentId": "uuid"
}
```

---

# 86. Operación transaccional de finalización

Dentro de una transacción PostgreSQL:

1. validar solicitud;
2. validar ejecutor;
3. validar cuadratura;
4. validar documento;
5. crear `invoice`;
6. calcular/persistir neto/IVA;
7. asociar documento;
8. cambiar solicitud a `COMPLETED`;
9. registrar `completed_at`;
10. crear historial;
11. crear auditoría.

---

# 87. Idempotencia de finalización

Debe impedirse que doble clic cree dos facturas.

Se utilizará:

```text
Idempotency-Key
```

o estrategia equivalente.

---

# 88. Header recomendado

```text
Idempotency-Key: <uuid>
```

---

# 89. Repetición

Si la misma clave ya completó la operación:

la API deberá devolver el resultado previo.

No crear una segunda factura.

---

# 90. Mensaje WhatsApp

No requiere persistencia obligatoria.

Podrá generarse desde datos de factura.

---

# 91. API para mensaje

## GET `/api/v1/invoices/{id}/message`

Respuesta:

```json
{
  "success": true,
  "data": {
    "message": "Hola, anexo factura...",
    "whatsappUrl": "https://wa.me/..."
  }
}
```

---

# 92. Acceso documental

## GET `/api/v1/documents/{id}/access`

Generará:

- URL firmada temporal;
- o proxy seguro.

---

# 93. Nunca guardar URL firmada

Una URL firmada temporal no deberá almacenarse permanentemente en PostgreSQL.

Se almacena:

```text
storage_key
```

---

# 94. Solicitar rectificación

## POST `/api/v1/invoices/{id}/rectifications`

Permisos:

```text
WAREHOUSE_USER relacionado
ADMIN
```

---

# 95. Request

```json
{
  "reason": "PRICE",
  "comment": "El precio correcto del toldo era $28.000."
}
```

---

# 96. Precondición

Factura:

```text
status = VALID
```

---

# 97. Resultado

Se crea:

```text
rectification.status = REQUESTED
```

La factura original sigue:

```text
VALID
```

hasta que se registre la Nota de Crédito.

---

# 98. Listar rectificaciones

## GET `/api/v1/rectifications`

Permisos:

```text
INVOICE_EXECUTOR
MANAGEMENT
ADMIN
```

Orden por defecto:

```text
requested_at ASC
```

---

# 99. Tomar rectificación

## POST `/api/v1/rectifications/{id}/claim`

Permisos:

```text
INVOICE_EXECUTOR
ADMIN
```

Transaccional.

---

# 100. Registrar Nota de Crédito

## POST `/api/v1/rectifications/{id}/credit-note`

Permisos:

```text
INVOICE_EXECUTOR asignado
ADMIN
```

---

# 101. Folio de Nota de Crédito

Tampoco será obligatorio en V1.

Request mínimo:

```json
{
  "documentId": "uuid",
  "issuedAt": "2026-08-19T15:20:00-04:00"
}
```

---

# 102. Totales Nota de Crédito

Para V1 se trata una anulación completa.

El servidor podrá derivar:

```text
grossTotal
netTotal
vatTotal
```

desde la factura original.

No se pedirán manualmente al ejecutor.

---

# 103. Operación transaccional

Registrar Nota de Crédito deberá:

1. validar rectificación;
2. validar factura original;
3. validar documento;
4. crear `credit_note`;
5. marcar factura original `VOIDED_BY_CREDIT_NOTE`;
6. cambiar rectificación a `CREDIT_NOTE_REGISTERED`;
7. auditoría.

---

# 104. Nueva factura después de NC

Después de Nota de Crédito:

```text
rectification.status
→ NEW_INVOICE_PENDING
```

La interfaz mostrará datos corregibles.

---

# 105. Datos corregidos

El proceso de rectificación deberá mantener un snapshot corregido.

No deberá modificar retroactivamente:

```text
invoice_request
```

ya cerrada.

---

# 106. Contrato de datos corregidos

Se recomienda almacenar en la rectificación o entidad auxiliar:

```json
{
  "customer": {
    "rut": "...",
    "legalName": "...",
    "businessActivity": "..."
  },
  "items": [
    {
      "description": "...",
      "quantity": 2,
      "unitPriceGross": 28000
    }
  ]
}
```

La implementación física definitiva deberá seguir el Modelo de Datos aprobado.

---

# 107. Recalcular netos en rectificación

Los nuevos precios brutos:

```text
gross
```

generarán nuevos:

```text
net
```

con el mismo algoritmo oficial.

---

# 108. Cuadratura nueva factura

La nueva factura deberá cumplir nuevamente:

```text
MATCH
```

o:

```text
ROUNDING_ACCEPTED
```

---

# 109. Finalizar rectificación

## POST `/api/v1/rectifications/{id}/complete`

Precondiciones:

- Nota de Crédito registrada;
- factura original anulada;
- nuevo PDF cargado;
- nueva cuadratura válida.

---

# 110. Resultado transaccional

1. crear nueva factura;
2. vincular `rectification_id`;
3. marcar nueva factura `VALID`;
4. marcar rectificación `COMPLETED`;
5. registrar `completed_at`;
6. auditoría.

---

# 111. No sobrescribir original

La nueva factura tendrá:

```text
nuevo invoice.id
```

La anterior seguirá existiendo.

---

# 112. Historial

## GET `/api/v1/invoice-requests/{id}/timeline`

Respuesta conceptual:

```json
{
  "data": [
    {
      "type": "REQUEST_CREATED",
      "at": "..."
    },
    {
      "type": "INVOICE_COMPLETED",
      "at": "..."
    },
    {
      "type": "RECTIFICATION_REQUESTED",
      "at": "..."
    },
    {
      "type": "CREDIT_NOTE_REGISTERED",
      "at": "..."
    },
    {
      "type": "RECTIFICATION_COMPLETED",
      "at": "..."
    }
  ]
}
```

---

# 113. Administración de usuarios

## GET `/api/v1/admin/users`

Permiso:

```text
ADMIN
```

---

# 114. Crear usuario

## POST `/api/v1/admin/users`

Request:

```json
{
  "email": "usuario@empresa.cl",
  "name": "Nombre Usuario",
  "role": "WAREHOUSE_USER",
  "warehouseId": "uuid"
}
```

---

# 115. No crear contraseña

El endpoint nunca recibirá:

```text
password
```

---

# 116. Desactivar usuario

## POST `/api/v1/admin/users/{id}/disable`

Debe:

```text
active = false
```

No borrar usuario.

---

# 117. Actualizar usuario

## PATCH `/api/v1/admin/users/{id}`

Permitirá:

- nombre;
- rol;
- bodega;
- activo.

Auditoría obligatoria.

---

# 118. Estadísticas — resumen

## GET `/api/v1/statistics/summary`

Permisos:

```text
MANAGEMENT
ADMIN
```

Parámetros:

```text
month
year
warehouseId
```

---

# 119. Response

```json
{
  "success": true,
  "data": {
    "grossTotal": 119000000,
    "netTotal": 100000000,
    "vatTotal": 19000000,
    "invoiceCount": 1842,
    "averageTicket": 64604,
    "pending": 12,
    "inProgress": 3,
    "needsCorrection": 2
  }
}
```

---

# 120. Estadísticas por bodega

## GET `/api/v1/statistics/by-warehouse`

Response:

```json
{
  "data": [
    {
      "warehouseId": "uuid",
      "warehouseName": "Santiago",
      "grossTotal": 32400000,
      "invoiceCount": 482,
      "averageTicket": 67220
    }
  ]
}
```

---

# 121. Evolución mensual

## GET `/api/v1/statistics/monthly`

Parámetro:

```text
months=12
```

---

# 122. Fuente estadística

Se utilizarán facturas:

```text
status = VALID
```

como facturación vigente principal.

Las facturas anuladas no deberán continuar sumándose.

Esto sigue la regla funcional aprobada para rectificaciones.

---

# 123. Fechas estadísticas

La fecha será:

```text
invoice.issued_at
```

No:

```text
request.created_at
```

---

# 124. IVA

En V1:

```text
vatTotal =
grossTotal - netTotal
```

El dashboard deberá llamarlo:

```text
IVA débito estimado
```

Nunca:

```text
IVA a pagar
```

---

# 125. Estadísticas y Nota de Crédito

Para V1, al tratarse de anulación completa:

una factura con:

```text
VOIDED_BY_CREDIT_NOTE
```

deja de formar parte de:

```text
facturación vigente
```

La nueva factura válida sí suma.

---

# 126. Rate limiting

Se recomienda proteger especialmente:

- autenticación;
- creación de solicitudes;
- uploads;
- endpoints administrativos.

No se necesita infraestructura externa dedicada en V1.

---

# 127. Validación

Se deberá utilizar un esquema único server-side para cada contrato.

Puede utilizarse:

```text
Zod
```

o equivalente aprobado.

---

# 128. No duplicar esquemas

Cuando sea viable, los mismos schemas tipados podrán reutilizarse para:

- validación;
- tipos;
- formularios.

Pero el servidor siempre valida nuevamente.

---

# 129. Formato de fechas

API:

```text
ISO 8601
```

Ejemplo:

```text
2026-08-19T15:35:22-04:00
```

---

# 130. Zona horaria

La base utilizará:

```text
TIMESTAMPTZ
```

La presentación utilizará la zona configurada para la operación.

---

# 131. Estados de solicitud

```text
PENDING
IN_PROGRESS
NEEDS_CORRECTION
COMPLETED
CANCELLED
DUPLICATE
```

---

# 132. Transiciones válidas

```text
PENDING
→ IN_PROGRESS
→ COMPLETED
```

o:

```text
PENDING
→ IN_PROGRESS
→ NEEDS_CORRECTION
→ PENDING
```

También:

```text
PENDING
→ CANCELLED
```

y:

```text
PENDING
→ DUPLICATE
```

según permiso.

---

# 133. Transiciones inválidas

Ejemplo:

```text
COMPLETED
→ PENDING
```

No permitida.

Una factura completada se corrige mediante rectificación.

---

# 134. Estados rectificación

```text
REQUESTED
IN_PROGRESS
CREDIT_NOTE_REGISTERED
NEW_INVOICE_PENDING
COMPLETED
CANCELLED
```

---

# 135. Máquina de estados

El cambio de estado deberá realizarse mediante servicios de dominio.

No permitir endpoints como:

```text
PATCH status = cualquier-cosa
```

---

# 136. Error estado inválido

```text
409 Conflict
INVALID_STATE_TRANSITION
```

---

# 137. Idempotencia

Obligatoria para:

- creación definitiva de solicitud;
- finalización de factura;
- registro de Nota de Crédito;
- finalización de rectificación.

---

# 138. Duración clave de idempotencia

Se recomienda conservarla al menos:

```text
24 horas
```

para operaciones interactivas.

---

# 139. Transacciones

Obligatorias para:

- claim;
- corrección y reenvío;
- complete invoice;
- credit note;
- complete rectification;
- reasignación.

---

# 140. Nivel de aislamiento

No se exige `SERIALIZABLE` globalmente.

Deberán utilizarse:

- actualizaciones condicionales;
- constraints;
- transacciones;
- locks puntuales cuando sean necesarios.

---

# 141. Auditoría

Toda operación crítica deberá emitir evento.

La auditoría no deberá depender del navegador.

---

# 142. Auditoría mínima por evento

```text
actor
event
entity
entityId
timestamp
oldValues
newValues
metadata
```

---

# 143. Datos prohibidos en auditoría

No almacenar:

- OAuth tokens;
- R2 secret;
- DATABASE_URL;
- PDFs;
- contenido binario.

---

# 144. Logs

Logs técnicos y auditoría son cosas distintas.

### Logs

Problemas técnicos.

### Auditoría

Acciones de negocio.

No deberán mezclarse como único mecanismo.

---

# 145. R2

El bucket será privado.

No se utilizarán URLs públicas permanentes para documentos tributarios.

---

# 146. Storage key

Formato sugerido:

```text
invoices/
2026/
08/
FAC-2026-001842/
<uuid>.pdf
```

y:

```text
credit-notes/
2026/
08/
FAC-2026-001801/
<uuid>.pdf
```

---

# 147. Nombre visible

Podrá ser:

```text
FAC-2026-001842.pdf
```

aunque internamente el objeto utilice UUID.

---

# 148. Reemplazo de PDF

Antes de completar una factura:

podrá sustituirse un PDF cargado erróneamente.

Después de completar:

**no.**

Después de completar se deberá utilizar rectificación.

---

# 149. Garbage collection de uploads fallidos

Los uploads no confirmados podrán eliminarse automáticamente después de un período.

Ejemplo recomendado:

```text
24 horas
```

---

# 150. Documentos históricos de Drive

La API deberá soportar metadata:

```text
storageProvider = GOOGLE_DRIVE
externalUrl
```

para migración histórica.

No será necesario mover esos archivos a R2 en V1.

---

# 151. Migración Google Sheets

La migración no deberá ejecutarse desde endpoints públicos.

Se implementará como:

- script;
- comando;
- tarea administrativa controlada.

---

# 152. Datos legacy

Toda fila deberá registrar:

```text
source = GOOGLE_SHEETS_LEGACY
```

cuando corresponda.

---

# 153. Migración segura

Antes de insertar:

1. validar;
2. normalizar;
3. buscar duplicados históricos;
4. registrar anomalías;
5. no inventar campos.

---

# 154. ORM

Se recomienda utilizar:

**Drizzle ORM**

para este proyecto.

Motivos:

- buen ajuste con PostgreSQL;
- tipado fuerte;
- esquema cercano a SQL;
- migraciones controlables;
- menor abstracción que herramientas más pesadas.

---

# 155. Decisión ORM

```text
Drizzle ORM
```

queda como selección técnica recomendada para V1.

Si Antigravity considera técnicamente imprescindible cambiarlo:

```text
BLOCKED — DECISION REQUIRED
```

---

# 156. Driver PostgreSQL

Deberá utilizarse un driver compatible con Neon y entorno serverless.

La configuración concreta deberá seguir la documentación vigente al momento de implementación.

---

# 157. Pooling

La aplicación deberá utilizar el mecanismo de conexión recomendado para Neon + serverless.

No deberá abrir conexiones persistentes indiscriminadamente por request.

---

# 158. Migraciones Drizzle

Las migraciones deberán almacenarse en Git.

Nunca modificar producción únicamente mediante interfaz visual del proveedor.

---

# 159. Estados en base de datos

Para V1 se recomienda:

```text
VARCHAR + CHECK
```

en lugar de ENUM PostgreSQL rígido.

Motivo:

facilitar evolución de estados mediante migraciones simples.

---

# 160. UUID

Se utilizará:

```text
UUID
```

como clave primaria.

La generación podrá realizarse en PostgreSQL o aplicación, manteniendo consistencia.

---

# 161. Número de solicitud

Se utilizará formato:

```text
FAC-YYYY-NNNNNN
```

---

# 162. Generación segura del correlativo

No se deberá generar mediante:

```text
COUNT(*) + 1
```

porque genera colisiones.

Se deberá utilizar:

- sequence;
- contador transaccional;
- mecanismo PostgreSQL equivalente.

---

# 163. Ejemplo

```text
FAC-2026-000001
FAC-2026-000002
...
```

El contador podrá reiniciarse anualmente.

---

# 164. Cliente maestro

Al ingresar RUT existente:

el sistema podrá completar sus datos.

Si el usuario cambia datos:

se actualizará el cliente maestro según permiso y se guardará snapshot en la solicitud.

---

# 165. Snapshot

El histórico no dependerá de cambios posteriores del cliente.

---

# 166. Error codes de dominio

Como mínimo:

```text
USER_NOT_AUTHORIZED
USER_DISABLED
INVALID_ROLE

INVALID_RUT
INVALID_WAREHOUSE
INVALID_CUSTOMER

INVALID_ITEM
INVALID_QUANTITY
INVALID_PRICE

POSSIBLE_DUPLICATE

REQUEST_NOT_FOUND
REQUEST_ALREADY_CLAIMED
REQUEST_NOT_CLAIMABLE
REQUEST_NOT_EDITABLE

INVALID_STATE_TRANSITION

RECONCILIATION_MISMATCH

DOCUMENT_TOO_LARGE
INVALID_DOCUMENT_TYPE
DOCUMENT_NOT_FOUND
DOCUMENT_UPLOAD_FAILED

INVOICE_NOT_FOUND
INVOICE_ALREADY_COMPLETED
INVOICE_NOT_RECTIFIABLE

RECTIFICATION_NOT_FOUND
RECTIFICATION_ALREADY_CLAIMED
CREDIT_NOTE_REQUIRED

FORBIDDEN
INTERNAL_ERROR
```

---

# 167. Mensajes

Los códigos son técnicos.

Los mensajes visibles serán simples y en español.

Ejemplo:

```text
REQUEST_ALREADY_CLAIMED
```

→

> Esta solicitud ya está siendo gestionada por otra persona.

---

# 168. Seguridad CSRF

Las operaciones autenticadas mediante cookies deberán contar con las protecciones correspondientes al framework y mecanismo de autenticación elegido.

---

# 169. XSS

Todo contenido libre deberá tratarse como texto.

No renderizar HTML introducido por usuarios sin sanitización.

---

# 170. SQL injection

Todas las consultas deberán ser parametrizadas.

---

# 171. Acceso a documentos

La autorización deberá comprobarse antes de generar URL de lectura.

---

# 172. Caché

No cachear respuestas sensibles por usuario de forma compartida.

---

# 173. Cola de pendientes

La cola operativa deberá tratarse como información dinámica.

No aplicar caché prolongada.

---

# 174. Estadísticas

Sí podrán utilizar caché corta si posteriormente resulta necesaria.

No es requisito en V1.

---

# 175. Rendimiento

Objetivos funcionales orientativos:

```text
consulta simple < 1 s normalmente
carga lista < 2 s normalmente
acciones críticas feedback inmediato
```

No constituyen SLA contractual.

---

# 176. Índices obligatorios

Como mínimo:

```text
invoice_requests(status, created_at)
invoice_requests(warehouse_id, status, created_at)
invoice_requests(request_number)
invoice_requests(customer_id)

customers(rut_canonical)

invoices(status, issued_at)
invoices(invoice_request_id)

rectifications(status, requested_at)

documents(invoice_id)
documents(credit_note_id)

audit_logs(entity_type, entity_id)
```

---

# 177. Testing unitario obligatorio

Debe incluir como mínimo:

### Dinero

- gross→net;
- múltiples cantidades;
- tolerancia 0;
- diferencia +1;
- diferencia -1;
- diferencia +2;
- diferencia -2;
- diferencia +3;
- diferencia -3.

### RUT

- válido;
- inválido;
- formatos.

### Estados

- transiciones válidas;
- inválidas.

---

# 178. Testing de concurrencia obligatorio

Caso:

```text
Ejecutor A
Ejecutor B
```

intentan tomar misma solicitud.

Resultado obligatorio:

```text
uno gana
uno recibe 409
```

Nunca ambos.

---

# 179. Testing idempotencia

Dos requests de:

```text
complete invoice
```

con misma idempotency key deberán crear:

```text
1 factura
```

---

# 180. Testing autorización

Cada endpoint deberá probar:

- rol permitido;
- rol prohibido;
- usuario inactivo;
- usuario inexistente.

---

# 181. Testing documentos

- PDF válido;
- archivo no PDF;
- >2 MB;
- archivo inexistente;
- upload incompleto;
- acceso no autorizado.

---

# 182. Testing rectificaciones

Debe verificar:

```text
factura original permanece
Nota Crédito existe
original queda anulada
nueva factura existe
rectificación completa
```

---

# 183. Testing estadísticas

Debe incluir:

- factura válida suma;
- pendiente no suma;
- cancelada no suma;
- factura anulada deja de sumar vigente;
- factura reemplazo suma;
- fecha de emisión define mes.

---

# 184. Observabilidad

Cada request crítico podrá generar:

```text
requestId
```

para correlacionar:

- error;
- log;
- operación.

---

# 185. Errores externos

Si R2 no responde:

```text
503
STORAGE_UNAVAILABLE
```

La solicitud no cambia a completada.

---

# 186. Error PostgreSQL

La transacción deberá rollback.

No deberá mostrarse éxito parcial.

---

# 187. Disponibilidad parcial

Si estadísticas falla pero operación funciona:

no deberá necesariamente impedir gestionar facturas.

Se deben mantener responsabilidades separadas.

---

# 188. Configuración

Valores configurables mediante variables de entorno o settings:

```text
MAX_FILE_SIZE
DUPLICATE_WINDOW_HOURS
ROUNDING_TOLERANCE_CLP
R2_BUCKET
```

---

# 189. Tolerancia protegida

Aunque configurable técnicamente, V1 deberá iniciar con:

```text
ROUNDING_TOLERANCE_CLP = 2
```

No deberá cambiarse desde interfaz común.

---

# 190. IVA

V1:

```text
VAT_RATE = 19
```

No será editable por solicitantes.

---

# 191. Configuración administrativa

No se necesita construir una interfaz genérica para todas las variables en V1.

Evitar sobrediseño.

---

# 192. Exportaciones

No son requisito obligatorio de V1 salvo que posteriormente se aprueben.

La API podrá agregarlas sin alterar los contratos centrales.

---

# 193. XML

No crear endpoints tipo:

```text
/upload-xml
/dte
/xml
```

en V1.

---

# 194. Folios

No crear workflow obligatorio alrededor del folio.

Puede existir un campo nullable si ya está en esquema, pero no deberá aparecer como requisito de proceso.

---

# 195. Integración SII

No habrá endpoint:

```text
/api/sii/emit
```

ni equivalente.

SII permanece manual.

---

# 196. Integración Hub

No habrá endpoint obligatorio:

```text
/api/hub/sync
```

No habrá sincronización de usuarios.

No habrá escritura en Hub.

---

# 197. Entregables técnicos de Antigravity

La implementación deberá entregar:

1. esquema Drizzle;
2. migraciones;
3. API;
4. validaciones;
5. servicios de dominio;
6. autenticación;
7. autorización;
8. integración Neon;
9. integración R2;
10. tests;
11. seeds controlados;
12. `.env.example` sin secretos;
13. README de desarrollo;
14. documentación de deployment.

---

# 198. Variables de entorno mínimas

Ejemplo conceptual:

```text
DATABASE_URL=

AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

MAX_FILE_SIZE_BYTES=2097152
ROUNDING_TOLERANCE_CLP=2
DUPLICATE_WINDOW_HOURS=24
```

---

# 199. `.env.example`

Debe incluir nombres pero nunca valores secretos.

---

# 200. Seed inicial

Deberá permitir cargar:

- bodegas;
- primer ADMIN;
- usuarios autorizados iniciales.

Nunca deberá usar passwords.

---

# 201. Producción

No ejecutar seed destructivo automáticamente.

---

# 202. Contrato de salud

Se recomienda:

## GET `/api/v1/health`

Respuesta pública mínima:

```json
{
  "status": "ok"
}
```

No exponer:

- versión PostgreSQL;
- credenciales;
- hostname DB;
- bucket;
- secretos.

---

# 203. Health interno

Podrá existir comprobación autenticada más completa para administración.

---

# 204. Contratos que no pueden cambiarse sin aprobación

Antigravity no deberá cambiar unilateralmente:

- roles;
- estados;
- tolerancia ±2;
- IVA 19%;
- gross como entrada del solicitante;
- cálculo neto;
- PDF como documento V1;
- flujo Nota de Crédito;
- inmutabilidad de factura;
- separación Hub;
- PostgreSQL;
- R2;
- API v1.

---

# 205. Cambios incompatibles

Si se necesita cambiar un contrato existente después de producción:

preferir:

```text
/api/v2
```

o evolución backward-compatible.

---

# 206. Definition of Done — endpoint

Un endpoint no estará terminado sólo porque “responde”.

Debe contar con:

- autenticación;
- autorización;
- validación;
- errores;
- transacción cuando aplique;
- auditoría cuando aplique;
- test;
- documentación.

---

# 207. Definition of Done — módulo

Un módulo se considera completo cuando:

- cumple PRD;
- cumple UX;
- cumple arquitectura;
- cumple modelo de datos;
- cumple esta API;
- tiene pruebas;
- no rompe módulos existentes.

---

# 208. Matriz resumida de endpoints

```text
AUTH
GET    /api/v1/me

WAREHOUSES
GET    /api/v1/warehouses

CUSTOMERS
GET    /api/v1/customers/by-rut/{rut}

REQUESTS
POST   /api/v1/invoice-requests
GET    /api/v1/invoice-requests
GET    /api/v1/invoice-requests/mine
GET    /api/v1/invoice-requests/{id}
POST   /api/v1/invoice-requests/{id}/claim
POST   /api/v1/invoice-requests/{id}/reassign
POST   /api/v1/invoice-requests/{id}/request-correction
PATCH  /api/v1/invoice-requests/{id}/correction
POST   /api/v1/invoice-requests/{id}/cancel
POST   /api/v1/invoice-requests/{id}/reconcile
POST   /api/v1/invoice-requests/{id}/complete
GET    /api/v1/invoice-requests/{id}/timeline

DOCUMENTS
POST   /api/v1/documents/upload-intent
POST   /api/v1/documents/confirm
GET    /api/v1/documents/{id}/access

INVOICES
GET    /api/v1/invoices/{id}/message
POST   /api/v1/invoices/{id}/rectifications

RECTIFICATIONS
GET    /api/v1/rectifications
POST   /api/v1/rectifications/{id}/claim
POST   /api/v1/rectifications/{id}/credit-note
POST   /api/v1/rectifications/{id}/complete

STATISTICS
GET    /api/v1/statistics/summary
GET    /api/v1/statistics/by-warehouse
GET    /api/v1/statistics/monthly

ADMIN
GET    /api/v1/admin/users
POST   /api/v1/admin/users
PATCH  /api/v1/admin/users/{id}
POST   /api/v1/admin/users/{id}/disable

SYSTEM
GET    /api/v1/health
```

---

# 209. Decisiones cerradas por este documento

Quedan formalmente cerradas:

1. API REST-style bajo `/api/v1`.
2. JSON como contrato principal.
3. Drizzle ORM.
4. UUID para identificadores internos.
5. sequence/correlativo seguro para número visible.
6. gross como input.
7. net calculado mediante división decimal y `ROUND_HALF_UP`.
8. montos en CLP enteros.
9. tolerancia ±2.
10. folio no requerido.
11. XML fuera de V1.
12. PDF como documento operacional.
13. Nota de Crédito completa en rectificación V1.
14. idempotencia en operaciones críticas.
15. claim transaccional.
16. URLs firmadas R2.
17. bucket privado.
18. estadísticas desde PostgreSQL.
19. Hub sin integración técnica.
20. validación server-side obligatoria.

---

# 210. Pendientes que ya no bloquean implementación

No bloquean V1:

- folio SII;
- XML;
- notas de crédito parciales;
- múltiples tasas de IVA;
- dominio personalizado;
- exportaciones;
- integración directa SII.

Son funcionalidades futuras.

---

# 211. Checkpoint obligatorio antes de desarrollo

Antes de que Antigravity cree migraciones o implemente endpoints deberá presentar:

```text
CHECKPOINT — Diseño técnico preparado
```

incluyendo:

- estructura propuesta del repositorio;
- esquema Drizzle preliminar;
- lista de migraciones;
- estrategia Auth;
- estrategia R2;
- lista de endpoints;
- plan de tests.

No deberá todavía desplegar producción.

---

# 212. Checkpoint después de base de datos

```text
CHECKPOINT — Modelo PostgreSQL implementado
```

Debe incluir:

- migraciones ejecutadas en desarrollo;
- constraints;
- índices;
- seed;
- tests del modelo.

---

# 213. Checkpoint después del flujo principal

```text
CHECKPOINT — Flujo Solicitud → Factura
```

Debe demostrar:

```text
crear
duplicado
tomar
corregir
reconciliar
subir PDF
completar
```

---

# 214. Checkpoint rectificaciones

Debe demostrar:

```text
factura válida
↓
solicitar cambio
↓
Nota de Crédito
↓
original anulada
↓
nueva factura
↓
historial íntegro
```

---

# 215. Checkpoint estadísticas

Debe comparar manualmente valores SQL contra dashboard para un conjunto de pruebas conocido.

---

# 216. Regla de no improvisación

Si Antigravity encuentra una situación no prevista:

```text
BLOCKED — DECISION REQUIRED
```

Debe informar:

- módulo;
- requisito;
- problema;
- opciones;
- impacto;
- recomendación.

No implementar primero y preguntar después.

---

# 217. Riesgos técnicos conocidos

## RT-001 — Redondeo SII

Mitigación:

- cálculo único;
- persistencia;
- tolerancia ±2.

## RT-002 — Doble procesamiento

Mitigación:

- claim atómico.

## RT-003 — Doble finalización

Mitigación:

- idempotencia;
- constraint.

## RT-004 — PDF huérfano

Mitigación:

- upload intent;
- confirmación;
- garbage collection.

## RT-005 — Factura sobrescrita

Mitigación:

- inmutabilidad;
- rectificaciones.

## RT-006 — Acceso indebido

Mitigación:

- OAuth;
- users internos;
- RBAC server-side.

## RT-007 — Estadísticas incorrectas

Mitigación:

- documentos válidos;
- issued_at;
- tests.

---

# 218. Criterios de aprobación

La especificación técnica se considera adecuada si:

- implementa los cuatro documentos rectores;
- no altera el Hub;
- soporta flujo completo;
- soporta rectificaciones;
- soporta concurrencia;
- soporta idempotencia;
- maneja correctamente dinero;
- soporta estadísticas;
- protege documentos;
- tiene contratos claros;
- puede implementarse sin decisiones funcionales importantes pendientes.

---

# 219. Dictamen

## Resultado

**APROBADA CON OBSERVACIONES**

La especificación técnica propuesta se considera suficiente para iniciar la implementación después de completarse la documentación restante de permisos, pruebas e implementación.

---

# 220. Observaciones obligatorias

Antes de producción deberán validarse:

1. estrategia concreta de autenticación de la aplicación sin modificar Hub;
2. compatibilidad real del driver Neon seleccionado;
3. comportamiento de redondeo contra casos reales usados actualmente por ejecutores;
4. expiración de URLs R2;
5. política de backup;
6. migración histórica;
7. permisos completos por rol.

---

# 221. Estado final

**Versión:** 1.0

**Estado recomendado:**

- [ ] APROBADA
- [x] APROBADA CON OBSERVACIONES
- [ ] REQUIERE MODIFICACIONES
- [ ] RECHAZADA

**Responsable funcional:** Ángel Ferrer

**Responsable técnico:** __________________

**Fecha:** __________________

**Observaciones:**  
____________________________________________________________________

**Riesgos aceptados:**  
____________________________________________________________________