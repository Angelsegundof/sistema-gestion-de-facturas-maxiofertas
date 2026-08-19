# Modelo de Dominio y Diseño de Base de Datos v1.0  
## Sistema de Gestión de Facturas Maxiofertas

**Proyecto:** Sistema de Gestión de Facturas Maxiofertas  
**Tipo de documento:** Modelo de Dominio y Diseño de Base de Datos  
**Versión:** 1.0  
**Estado:** Propuesta para revisión y aprobación  
**Fecha:** 19 de agosto de 2026  
**Responsable funcional:** Ángel Ferrer  
**Rol responsable del documento:** Arquitecto/a de Datos Senior  
**Motor de base de datos:** PostgreSQL  
**Proveedor previsto:** Neon  
**Implementación prevista:** Antigravity  
**Organización:** Maxiofertas  

---

# 1. Propósito del documento

Este documento define el modelo de dominio y el diseño lógico de la base de datos del Sistema de Gestión de Facturas Maxiofertas.

Su objetivo es establecer de forma explícita:

- entidades del dominio;
- relaciones;
- claves primarias;
- claves foráneas;
- tipos de datos;
- restricciones;
- estados;
- reglas de integridad;
- tratamiento de precios;
- tratamiento de IVA;
- cuadratura con SII;
- facturas;
- notas de crédito;
- rectificaciones;
- auditoría;
- documentos;
- clientes;
- bodegas;
- usuarios;
- migración histórica;
- índices;
- criterios de inmutabilidad;
- reglas de concurrencia.

Este documento deberá servir como especificación autoritativa para la creación del esquema PostgreSQL.

---

# 2. Documentos rectores

El modelo se deriva de:

1. PRD — Sistema de Gestión de Facturas Maxiofertas.  
2. Actualización PRD v1.1 — Precios, Rectificaciones y Notas de Crédito.  
3. Documento de Diseño Funcional y UX.  
4. Actualización Diseño Funcional y UX v1.1.  
5. Documento de Arquitectura de Solución v1.0.  
6. Enmienda Arquitectónica v1.1 — Integración con Hub Maxiofertas.

El modelo deberá respetar especialmente que:

- los precios ingresados por solicitantes incluyen IVA;
- el neto es calculado por el sistema;
- el ejecutor utiliza el neto para ingresar datos en SII;
- diferencias de hasta ±2 CLP se aceptan por redondeo;
- una factura realizada no se modifica;
- las rectificaciones generan Nota de Crédito y una nueva factura;
- el Hub Maxiofertas no forma parte del dominio ni de esta base de datos.

---

# 3. Principios del modelo

## 3.1 PostgreSQL como fuente de verdad

PostgreSQL será la fuente de verdad operacional.

No lo serán:

- Google Sheets;
- Google Forms;
- Hub Maxiofertas;
- navegador;
- localStorage;
- Cloudflare R2;
- WhatsApp.

---

# 4. Principio de integridad

Las reglas críticas deberán protegerse mediante:

- claves foráneas;
- constraints;
- índices únicos;
- transacciones;
- checks;
- reglas server-side.

No deberá confiarse exclusivamente en la interfaz.

---

# 5. Principio de trazabilidad

Las operaciones relevantes deberán conservar historial.

No deberán sobrescribirse silenciosamente:

- facturas;
- notas de crédito;
- rectificaciones;
- cambios críticos;
- asignaciones;
- estados.

---

# 6. Principio de inmutabilidad documental

Una factura finalizada se considera documento histórico.

No deberá reemplazarse el PDF original.

Una corrección debe producir:

```text
Factura original
+
Nota de Crédito
+
Nueva Factura
```

---

# 7. Principio monetario

No utilizar tipos flotantes para dinero.

Se utilizarán:

- `INTEGER`
- `BIGINT`
- `NUMERIC`

según corresponda.

Para montos en pesos chilenos sin centavos se utilizará preferentemente:

```text
BIGINT
```

o:

```text
INTEGER
```

cuando los rangos lo permitan.

---

# 8. Convención temporal

Todos los timestamps se almacenarán con zona horaria:

```sql
TIMESTAMPTZ
```

La presentación al usuario utilizará la zona horaria definida por la aplicación.

---

# 9. Convención de identificadores

Se recomienda utilizar:

```sql
UUID
```

como clave primaria interna.

Los identificadores visibles al usuario serán independientes.

Ejemplo:

```text
UUID interno:
6de4f86d-...

Número visible:
FAC-2026-001842
```

---

# 10. Entidades principales

El dominio estará compuesto por:

```text
users
warehouses
customers
invoice_requests
invoice_request_items
request_corrections
invoices
credit_notes
rectifications
documents
audit_logs
```

Podrán existir tablas auxiliares para:

```text
roles
status_history
duplicate_checks
settings
```

si la implementación lo requiere.

---

# 11. Diagrama conceptual

```text
USERS
 │
 │
 ├────────────┐
 │            │
 ▼            ▼
WAREHOUSES   INVOICE_REQUESTS
                  │
                  ├───────────────┐
                  │               │
                  ▼               ▼
        INVOICE_REQUEST_ITEMS   CUSTOMERS
                  │
                  ▼
               INVOICES
                  │
             ┌────┴─────────┐
             │              │
             ▼              ▼
        DOCUMENTS      RECTIFICATIONS
                            │
                       ┌────┴─────┐
                       ▼          ▼
                 CREDIT_NOTES  NEW INVOICE
```

---

# 12. Tabla `users`

Representa los usuarios autorizados dentro del Sistema de Gestión de Facturas.

No representa usuarios del Hub.

No existe sincronización obligatoria con el Hub.

---

# 13. Estructura `users`

```sql
users
-----
id UUID PK
email VARCHAR(320) NOT NULL UNIQUE
name VARCHAR(150) NOT NULL
role VARCHAR(50) NOT NULL
warehouse_id UUID NULL FK -> warehouses.id
active BOOLEAN NOT NULL DEFAULT TRUE
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

---

# 14. Roles permitidos

Valores iniciales:

```text
WAREHOUSE_USER
INVOICE_EXECUTOR
MANAGEMENT
ADMIN
```

---

# 15. Regla de email

El email deberá almacenarse normalizado:

```text
lowercase
trim
```

Ejemplo:

```text
Usuario@Empresa.CL
```

se almacena:

```text
usuario@empresa.cl
```

---

# 16. Usuario deshabilitado

No se eliminará físicamente.

Se utilizará:

```text
active = false
```

Esto preserva auditoría.

---

# 17. Asociación usuario-bodega

Para V1:

```text
WAREHOUSE_USER
→ puede tener warehouse_id
```

Un ejecutor o administrador puede tener:

```text
warehouse_id = NULL
```

si su función no está limitada a una bodega.

---

# 18. Evolución futura

El modelo deberá permitir migrar posteriormente de:

```text
users.warehouse_id
```

a:

```text
user_warehouses
```

si se aprueba que un usuario pertenezca a múltiples bodegas.

No deberá implementarse esta complejidad anticipadamente.

---

# 19. Tabla `warehouses`

Representa las bodegas operativas.

---

# 20. Estructura `warehouses`

```sql
warehouses
----------
id UUID PK
code VARCHAR(50) NOT NULL UNIQUE
name VARCHAR(150) NOT NULL
active BOOLEAN NOT NULL DEFAULT TRUE
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

---

# 21. Ejemplos

```text
SANTIAGO
OSORNO
TEMUCO
CURICO
ANTOFAGASTA
```

---

# 22. Eliminación de bodegas

Una bodega con historial no deberá eliminarse.

Se desactiva:

```text
active = false
```

---

# 23. Tabla `customers`

Representa clientes a quienes se han solicitado facturas.

---

# 24. Estructura `customers`

```sql
customers
---------
id UUID PK
rut_canonical VARCHAR(20) NOT NULL UNIQUE
rut_display VARCHAR(20) NOT NULL
legal_name VARCHAR(200) NOT NULL
business_activity VARCHAR(250) NOT NULL
phone VARCHAR(50) NULL
email VARCHAR(320) NULL
active BOOLEAN NOT NULL DEFAULT TRUE
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

---

# 25. RUT canónico

Ejemplo:

```text
76.123.456-7
```

deberá poder almacenarse como:

```text
761234567
```

en:

```text
rut_canonical
```

y:

```text
76.123.456-7
```

en:

```text
rut_display
```

---

# 26. Unicidad de clientes

`rut_canonical` deberá ser único.

No deberán existir dos clientes activos con el mismo RUT.

---

# 27. Cambios del cliente

Actualizar los datos maestros del cliente no deberá modificar retrospectivamente facturas ya realizadas.

Por ello, las solicitudes y facturas deberán almacenar snapshots de información relevante.

---

# 28. Snapshot tributario

La solicitud deberá almacenar datos como fueron ingresados en ese momento.

Por ejemplo:

```text
customer_legal_name_snapshot
customer_business_activity_snapshot
customer_phone_snapshot
customer_email_snapshot
```

Esto evita que una actualización futura del cliente cambie la historia.

---

# 29. Tabla `invoice_requests`

Representa la solicitud realizada por una bodega.

Es la entidad central del dominio operacional.

---

# 30. Estructura `invoice_requests`

```sql
invoice_requests
----------------
id UUID PK

request_number VARCHAR(30) NOT NULL UNIQUE

warehouse_id UUID NOT NULL FK -> warehouses.id
customer_id UUID NOT NULL FK -> customers.id
requested_by UUID NOT NULL FK -> users.id

assigned_to UUID NULL FK -> users.id

status VARCHAR(50) NOT NULL

customer_rut_snapshot VARCHAR(20) NOT NULL
customer_legal_name_snapshot VARCHAR(200) NOT NULL
customer_business_activity_snapshot VARCHAR(250) NOT NULL
customer_phone_snapshot VARCHAR(50) NULL
customer_email_snapshot VARCHAR(320) NULL

expected_gross_total BIGINT NOT NULL

sii_gross_total BIGINT NULL
gross_difference BIGINT NULL
reconciliation_status VARCHAR(50) NULL

notes TEXT NULL

duplicate_warning BOOLEAN NOT NULL DEFAULT FALSE
duplicate_override BOOLEAN NOT NULL DEFAULT FALSE
duplicate_of UUID NULL FK -> invoice_requests.id

source VARCHAR(50) NOT NULL DEFAULT 'NATIVE'

created_at TIMESTAMPTZ NOT NULL
assigned_at TIMESTAMPTZ NULL
completed_at TIMESTAMPTZ NULL
updated_at TIMESTAMPTZ NOT NULL
```

---

# 31. `request_number`

Formato recomendado:

```text
FAC-YYYY-NNNNNN
```

Ejemplo:

```text
FAC-2026-001842
```

---

# 32. Regla de numeración

Debe ser:

- único;
- secuencial o equivalente;
- independiente del UUID;
- independiente del folio SII.

---

# 33. Estados `invoice_requests`

Estados técnicos iniciales:

```text
PENDING
IN_PROGRESS
NEEDS_CORRECTION
COMPLETED
CANCELLED
DUPLICATE
```

---

# 34. Estados visibles

Equivalencia UX:

```text
PENDING
→ Pendiente

IN_PROGRESS
→ En proceso

NEEDS_CORRECTION
→ Necesita corrección

COMPLETED
→ Lista

CANCELLED
→ Cancelada

DUPLICATE
→ Duplicada
```

---

# 35. Constraint de total

Debe cumplirse:

```sql
expected_gross_total > 0
```

---

# 36. Fuente de solicitud

Valores iniciales:

```text
NATIVE
GOOGLE_SHEETS_LEGACY
```

---

# 37. Registros históricos

Las solicitudes importadas desde Google Sheets deberán utilizar:

```text
source = 'GOOGLE_SHEETS_LEGACY'
```

---

# 38. Tabla `invoice_request_items`

Representa las líneas de productos de una solicitud.

---

# 39. Estructura `invoice_request_items`

```sql
invoice_request_items
---------------------
id UUID PK
invoice_request_id UUID NOT NULL FK -> invoice_requests.id

line_number INTEGER NOT NULL

description VARCHAR(500) NOT NULL

quantity INTEGER NOT NULL

unit_price_gross BIGINT NOT NULL
unit_price_net BIGINT NOT NULL

line_total_gross BIGINT NOT NULL
line_total_net BIGINT NOT NULL

vat_rate NUMERIC(5,2) NOT NULL DEFAULT 19.00

created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

---

# 40. Precio ingresado por solicitante

El campo original ingresado será:

```text
unit_price_gross
```

Este precio:

**incluye IVA.**

---

# 41. Precio neto

`unit_price_net` será calculado por el sistema.

El solicitante nunca lo ingresa.

---

# 42. IVA

Para V1:

```text
vat_rate = 19.00
```

La aplicación deberá permitir en el modelo que esta tasa pueda modificarse en el futuro.

---

# 43. Cantidad

Debe cumplirse:

```sql
quantity > 0
```

y debe ser entero.

---

# 44. Precio unitario

Debe cumplirse:

```sql
unit_price_gross > 0
```

```sql
unit_price_net > 0
```

---

# 45. Totales por línea

Conceptualmente:

```text
line_total_gross =
quantity × unit_price_gross
```

y:

```text
line_total_net =
quantity × unit_price_net
```

La regla exacta de redondeo deberá definirse en la Especificación Técnica.

---

# 46. Regla crítica de redondeo

Este documento no define todavía el algoritmo exacto para convertir:

```text
gross → net
```

por línea.

Sí establece:

- cálculo centralizado;
- cálculo determinístico;
- sin `float`;
- persistencia del resultado utilizado;
- tolerancia final ±2 CLP.

La política exacta deberá cerrarse en la Especificación Técnica.

---

# 47. Consistencia del total

El sistema deberá validar:

```text
SUM(invoice_request_items.line_total_gross)
```

contra:

```text
invoice_requests.expected_gross_total
```

La estrategia exacta puede definirse mediante:

- cálculo server-side;
- trigger;
- validación transaccional.

No deberá existir divergencia silenciosa.

---

# 48. Cuadratura SII

Campos:

```text
expected_gross_total
sii_gross_total
gross_difference
reconciliation_status
```

---

# 49. Estados de cuadratura

```text
MATCH
ROUNDING_ACCEPTED
MISMATCH
```

---

# 50. Regla de cuadratura

Debe calcularse:

```text
gross_difference =
sii_gross_total - expected_gross_total
```

---

# 51. Match exacto

Si:

```text
gross_difference = 0
```

entonces:

```text
MATCH
```

---

# 52. Redondeo aceptado

Si:

```text
ABS(gross_difference) <= 2
```

y:

```text
gross_difference != 0
```

entonces:

```text
ROUNDING_ACCEPTED
```

---

# 53. Diferencia no aceptada

Si:

```text
ABS(gross_difference) > 2
```

entonces:

```text
MISMATCH
```

---

# 54. Constraint funcional de finalización

Una solicitud no podrá finalizar normalmente cuando:

```text
reconciliation_status = 'MISMATCH'
```

---

# 55. Tabla `request_corrections`

Representa correcciones solicitadas antes de que exista factura emitida.

No debe confundirse con una rectificación.

---

# 56. Diferencia conceptual

```text
REQUEST_CORRECTION
```

ocurre:

**antes de emitir factura.**

```text
RECTIFICATION
```

ocurre:

**después de emitir factura.**

---

# 57. Estructura `request_corrections`

```sql
request_corrections
-------------------
id UUID PK
invoice_request_id UUID NOT NULL FK -> invoice_requests.id

reason VARCHAR(100) NOT NULL
comment TEXT NULL

requested_by UUID NOT NULL FK -> users.id
resolved_by UUID NULL FK -> users.id

created_at TIMESTAMPTZ NOT NULL
resolved_at TIMESTAMPTZ NULL
```

---

# 58. Motivos iniciales

```text
INVALID_RUT
INVALID_LEGAL_NAME
INVALID_BUSINESS_ACTIVITY
WRONG_TOTAL
INCOMPLETE_PRODUCTS
WRONG_PRICE
MISSING_INFORMATION
TAX_DATA_INCONSISTENT
DUPLICATE_REQUEST
OTHER
```

---

# 59. Regla `OTHER`

Si:

```text
reason = OTHER
```

entonces:

```text
comment
```

deberá ser obligatorio.

---

# 60. Tabla `invoices`

Representa una factura efectivamente emitida.

Una solicitud puede tener más de una factura histórica debido a rectificaciones.

---

# 61. Estructura `invoices`

```sql
invoices
--------
id UUID PK

invoice_request_id UUID NOT NULL FK -> invoice_requests.id

rectification_id UUID NULL FK -> rectifications.id

invoice_type VARCHAR(50) NOT NULL DEFAULT 'STANDARD'

sii_folio VARCHAR(100) NULL

issued_at TIMESTAMPTZ NOT NULL

gross_total BIGINT NOT NULL
net_total BIGINT NOT NULL
vat_total BIGINT NOT NULL

status VARCHAR(50) NOT NULL

created_by UUID NOT NULL FK -> users.id

created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

---

# 62. Estados de factura

Valores iniciales:

```text
VALID
VOIDED_BY_CREDIT_NOTE
REPLACED
```

---

# 63. Factura válida

Una factura activa deberá tener:

```text
status = VALID
```

---

# 64. Factura anulada

Después de registrarse Nota de Crédito:

```text
status = VOIDED_BY_CREDIT_NOTE
```

---

# 65. Inmutabilidad

Una factura con estado:

```text
VALID
VOIDED_BY_CREDIT_NOTE
REPLACED
```

no deberá modificarse en sus datos tributarios fundamentales.

---

# 66. Folio SII

El folio podrá ser nullable inicialmente.

Se recomienda almacenar cuando el ejecutor lo ingrese.

---

# 67. Totales de factura

Deben persistirse:

```text
gross_total
net_total
vat_total
```

para no tener que reconstruirlos posteriormente.

---

# 68. IVA estimado

Conceptualmente:

```text
vat_total =
gross_total - net_total
```

---

# 69. Tabla `rectifications`

Representa una solicitud de cambio posterior a la emisión de una factura.

---

# 70. Estructura `rectifications`

```sql
rectifications
--------------
id UUID PK

invoice_request_id UUID NOT NULL FK -> invoice_requests.id
original_invoice_id UUID NOT NULL FK -> invoices.id

requested_by UUID NOT NULL FK -> users.id
assigned_to UUID NULL FK -> users.id

reason VARCHAR(100) NOT NULL
comment TEXT NULL

status VARCHAR(50) NOT NULL

requested_at TIMESTAMPTZ NOT NULL
assigned_at TIMESTAMPTZ NULL
completed_at TIMESTAMPTZ NULL

created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

---

# 71. Estados de rectificación

```text
REQUESTED
IN_PROGRESS
CREDIT_NOTE_REGISTERED
NEW_INVOICE_PENDING
COMPLETED
CANCELLED
```

---

# 72. Motivos de rectificación

```text
RUT
LEGAL_NAME
BUSINESS_ACTIVITY
PRODUCT
QUANTITY
PRICE
TOTAL
OTHER
```

---

# 73. Flujo permitido

```text
REQUESTED
↓
IN_PROGRESS
↓
CREDIT_NOTE_REGISTERED
↓
NEW_INVOICE_PENDING
↓
COMPLETED
```

---

# 74. Regla crítica

Una rectificación no deberá pasar a:

```text
COMPLETED
```

sin:

- Nota de Crédito registrada;
- nueva factura registrada.

---

# 75. Tabla `credit_notes`

Representa una Nota de Crédito registrada en el sistema.

---

# 76. Estructura `credit_notes`

```sql
credit_notes
------------
id UUID PK

rectification_id UUID NOT NULL UNIQUE FK -> rectifications.id
original_invoice_id UUID NOT NULL FK -> invoices.id

sii_folio VARCHAR(100) NULL

issued_at TIMESTAMPTZ NOT NULL

gross_total BIGINT NOT NULL
net_total BIGINT NULL
vat_total BIGINT NULL

created_by UUID NOT NULL FK -> users.id

created_at TIMESTAMPTZ NOT NULL
```

---

# 77. Nota de Crédito V1

V1 prioriza:

> anulación completa de factura.

Por tanto:

```text
credit_note.gross_total
```

deberá normalmente corresponder al total de la factura original.

---

# 78. Notas parciales

No forman parte del alcance funcional prioritario de V1.

La estructura no deberá impedir agregarlas en el futuro.

---

# 79. Regla de factura original

Después de crear la Nota de Crédito:

```text
original_invoice.status
→ VOIDED_BY_CREDIT_NOTE
```

---

# 80. Nueva factura de rectificación

La nueva factura deberá almacenarse en `invoices`.

Debe relacionarse con:

```text
rectification_id
```

---

# 81. Relación completa

Ejemplo:

```text
invoice_request
    │
    ├── invoice #1
    │     status = VOIDED_BY_CREDIT_NOTE
    │
    └── rectification
          │
          ├── credit_note
          │
          └── invoice #2
                status = VALID
```

---

# 82. Rectificaciones múltiples

El modelo deberá soportar que una factura corregida pueda posteriormente generar otra rectificación.

No se debe asumir una única corrección por solicitud.

---

# 83. Tabla `documents`

Representa metadata de documentos físicos almacenados externamente.

---

# 84. Estructura `documents`

```sql
documents
---------
id UUID PK

document_type VARCHAR(50) NOT NULL

storage_provider VARCHAR(50) NOT NULL

storage_key TEXT NULL
external_url TEXT NULL

file_name VARCHAR(500) NOT NULL
mime_type VARCHAR(100) NOT NULL
file_size BIGINT NOT NULL

invoice_id UUID NULL FK -> invoices.id
credit_note_id UUID NULL FK -> credit_notes.id

uploaded_by UUID NULL FK -> users.id

created_at TIMESTAMPTZ NOT NULL
```

---

# 85. Tipos documentales

```text
INVOICE
CREDIT_NOTE
XML_DTE
OTHER
```

V1 utilizará principalmente:

```text
INVOICE
CREDIT_NOTE
```

---

# 86. Proveedores

```text
R2
GOOGLE_DRIVE
```

---

# 87. Documentos nuevos

Las nuevas operaciones utilizarán:

```text
storage_provider = R2
```

---

# 88. Documentos históricos

Registros migrados podrán utilizar:

```text
storage_provider = GOOGLE_DRIVE
external_url = ...
```

---

# 89. Constraint documental

Un documento debe tener:

```text
storage_key
```

o:

```text
external_url
```

según su proveedor.

No ambos vacíos.

---

# 90. Tamaño máximo V1

La aplicación limitará inicialmente documentos a:

```text
2 MB
```

La base deberá aceptar el tamaño real en bytes.

---

# 91. MIME permitido

V1:

```text
application/pdf
```

---

# 92. Tabla `audit_logs`

Representa el historial técnico y funcional de acciones relevantes.

---

# 93. Estructura `audit_logs`

```sql
audit_logs
----------
id UUID PK

user_id UUID NULL FK -> users.id

event_type VARCHAR(100) NOT NULL

entity_type VARCHAR(100) NOT NULL
entity_id UUID NULL

old_values JSONB NULL
new_values JSONB NULL
metadata JSONB NULL

created_at TIMESTAMPTZ NOT NULL
```

---

# 94. Eventos iniciales

```text
REQUEST_CREATED
REQUEST_UPDATED
REQUEST_ASSIGNED
REQUEST_REASSIGNED
REQUEST_CORRECTION_REQUESTED
REQUEST_RESUBMITTED
REQUEST_CANCELLED
REQUEST_MARKED_DUPLICATE

INVOICE_UPLOADED
INVOICE_COMPLETED

RECTIFICATION_REQUESTED
RECTIFICATION_ASSIGNED
CREDIT_NOTE_REGISTERED
INVOICE_VOIDED
REPLACEMENT_INVOICE_CREATED
RECTIFICATION_COMPLETED

USER_CREATED
USER_UPDATED
USER_DISABLED

ADMIN_OVERRIDE
```

---

# 95. Inmutabilidad del audit log

Los registros de auditoría no deberán editarse normalmente.

---

# 96. `old_values` y `new_values`

Se utilizarán solamente cuando aporten valor.

No deberán almacenar innecesariamente documentos o secretos.

---

# 97. Tabla opcional `request_status_history`

Se recomienda crear historial explícito de estados.

---

# 98. Estructura conceptual

```sql
request_status_history
----------------------
id UUID PK
invoice_request_id UUID NOT NULL FK
from_status VARCHAR(50) NULL
to_status VARCHAR(50) NOT NULL
changed_by UUID NOT NULL FK
comment TEXT NULL
created_at TIMESTAMPTZ NOT NULL
```

---

# 99. Motivo

Aunque `audit_logs` puede registrar cambios, esta tabla facilita:

- timeline;
- reporting;
- UX;
- cálculo de tiempos.

---

# 100. Tabla opcional `duplicate_checks`

Puede utilizarse si se desea conservar explícitamente resultados del detector de duplicados.

---

# 101. Estructura conceptual

```sql
duplicate_checks
----------------
id UUID PK
invoice_request_id UUID NULL
candidate_request_id UUID NOT NULL
match_level VARCHAR(50) NOT NULL
score NUMERIC(5,2) NULL
overridden BOOLEAN NOT NULL DEFAULT FALSE
created_at TIMESTAMPTZ NOT NULL
```

---

# 102. Estados de coincidencia

```text
POSSIBLE
HIGH_CONFIDENCE
```

---

# 103. Índices principales

Se deberán crear como mínimo:

```sql
invoice_requests(request_number)
invoice_requests(status)
invoice_requests(created_at)
invoice_requests(warehouse_id)
invoice_requests(customer_id)
invoice_requests(requested_by)
invoice_requests(assigned_to)

customers(rut_canonical)

invoice_request_items(invoice_request_id)

invoices(invoice_request_id)
invoices(issued_at)
invoices(status)

rectifications(status)
rectifications(requested_at)
rectifications(original_invoice_id)

credit_notes(original_invoice_id)

documents(invoice_id)
documents(credit_note_id)

audit_logs(entity_type, entity_id)
audit_logs(created_at)
```

---

# 104. Índice de cola pendiente

Para soportar:

> más antigua primero

se recomienda índice compuesto:

```sql
(status, created_at)
```

---

# 105. Índice por bodega y estado

Para consultas operacionales:

```sql
(warehouse_id, status, created_at)
```

---

# 106. Integridad referencial

Las claves foráneas operacionales deberán utilizar normalmente:

```text
ON DELETE RESTRICT
```

para evitar pérdida de historia.

---

# 107. Excepción

Tablas puramente auxiliares podrán utilizar otras políticas cuando se justifique.

No deberá utilizarse:

```text
ON DELETE CASCADE
```

sobre entidades centrales sin revisión.

---

# 108. Borrado lógico

Entidades como:

- usuarios;
- bodegas;
- clientes;

deberán preferir:

```text
active = false
```

---

# 109. Solicitudes

Las solicitudes no deberán borrarse.

Se utilizan estados:

```text
CANCELLED
DUPLICATE
```

---

# 110. Facturas

Nunca deberán eliminarse en flujo normal.

---

# 111. Notas de crédito

Nunca deberán eliminarse en flujo normal.

---

# 112. Rectificaciones

Nunca deberán eliminarse en flujo normal.

---

# 113. Control de concurrencia

La asignación de solicitudes deberá realizarse transaccionalmente.

Ejemplo lógico:

```sql
UPDATE invoice_requests
SET
    status = 'IN_PROGRESS',
    assigned_to = :user,
    assigned_at = NOW()
WHERE
    id = :id
AND status = 'PENDING';
```

---

# 114. Resultado esperado

La operación será válida únicamente si:

```text
rows affected = 1
```

---

# 115. Si rows affected = 0

Se interpretará que:

- ya fue tomada;
- cambió de estado;
- no está disponible.

---

# 116. Rectificaciones

La acción:

**Tomar corrección**

deberá utilizar lógica equivalente.

---

# 117. Idempotencia

Las operaciones críticas deberán poder incluir una clave de idempotencia.

Se recomienda para:

- crear solicitud;
- finalizar factura;
- registrar Nota de Crédito;
- finalizar rectificación.

---

# 118. Tabla opcional `idempotency_keys`

Si se implementa:

```sql
idempotency_keys
----------------
id UUID PK
key VARCHAR(255) NOT NULL UNIQUE
operation VARCHAR(100) NOT NULL
entity_id UUID NULL
created_at TIMESTAMPTZ NOT NULL
expires_at TIMESTAMPTZ NULL
```

---

# 119. Estadísticas

Las estadísticas se calcularán desde:

```text
invoices
credit_notes
invoice_requests
```

---

# 120. Facturación bruta emitida

Conceptualmente:

```text
SUM(invoices.gross_total)
```

para facturas emitidas en el período.

---

# 121. Facturación vigente

Debe excluir facturas:

```text
VOIDED_BY_CREDIT_NOTE
```

o aplicar el efecto de las notas de crédito según la consulta.

---

# 122. Facturación vigente V1

Para el caso de anulación total:

```text
SUM(facturas válidas)
```

será suficiente para la métrica principal.

---

# 123. IVA débito estimado

Podrá calcularse mediante:

```text
SUM(invoices.vat_total)
```

sobre facturas vigentes.

---

# 124. Neto

```text
SUM(invoices.net_total)
```

---

# 125. Ticket promedio

```text
SUM(gross_total)
/
COUNT(facturas válidas)
```

---

# 126. Estadística por fecha

La fecha de referencia será:

```text
invoices.issued_at
```

no:

```text
invoice_requests.created_at
```

---

# 127. Estadística por bodega

La bodega se obtiene a través de:

```text
invoice
→ invoice_request
→ warehouse
```

---

# 128. Rectificaciones entre períodos

Ejemplo:

```text
Factura original:
31 agosto

Nota de Crédito:
2 septiembre

Factura nueva:
2 septiembre
```

Este caso deberá conservar todas sus fechas individuales.

El tratamiento contable exacto en reportes avanzados deberá definirse posteriormente.

---

# 129. V1 de estadísticas

El indicador principal debe reflejar:

**facturación vigente según documentos actualmente válidos.**

No deberá presentarse como cálculo contable oficial.

---

# 130. Auditoría de precios

Los precios originales ingresados deberán persistirse.

No deberá recalcularse históricamente:

```text
unit_price_net
```

cuando cambie una función de redondeo futura.

---

# 131. Regla importante

Los valores utilizados al momento de facturación deben quedar congelados.

Ejemplo:

```text
unit_price_gross
unit_price_net
line_total_gross
line_total_net
```

son históricos.

---

# 132. Snapshot de cliente en factura

Una factura deberá depender de la solicitud, que contiene snapshot tributario.

No debe reconstruirse el cliente histórico únicamente desde `customers`.

---

# 133. Migración desde Google Sheets

Los registros históricos deberán importarse mediante proceso ETL.

---

# 134. Campos legacy

Cuando no sea posible normalizar un dato, podrá preservarse en:

```text
legacy_data JSONB
```

si se aprueba durante migración.

No deberá utilizarse JSONB como sustituto del modelo normalizado para registros nuevos.

---

# 135. Tabla opcional `migration_records`

Para auditoría de migración:

```sql
migration_records
-----------------
id UUID PK
source VARCHAR(100) NOT NULL
source_row_id VARCHAR(200) NULL
entity_type VARCHAR(100) NOT NULL
entity_id UUID NULL
status VARCHAR(50) NOT NULL
error_message TEXT NULL
created_at TIMESTAMPTZ NOT NULL
```

---

# 136. Estados de migración

```text
IMPORTED
SKIPPED
FAILED
MANUAL_REVIEW
```

---

# 137. Datos históricos incompletos

No deberá inventarse información.

Si el registro histórico no contiene un dato:

- utilizar NULL cuando sea permitido;
- marcar origen;
- registrar observación de migración.

---

# 138. Constraints recomendados

Ejemplos:

```sql
CHECK (expected_gross_total > 0)
CHECK (quantity > 0)
CHECK (unit_price_gross > 0)
CHECK (unit_price_net > 0)
CHECK (file_size > 0)
```

---

# 139. Constraints de estados

Los estados podrán implementarse mediante:

- ENUM PostgreSQL;
- CHECK;
- tablas de catálogo.

La decisión concreta corresponderá a la Especificación Técnica.

---

# 140. Recomendación sobre ENUM

Para evitar rigidez excesiva, se recomienda valorar:

```text
VARCHAR + CHECK
```

o:

```text
tablas catálogo
```

si se prevé evolución.

No se impone todavía implementación específica.

---

# 141. Índices únicos recomendados

```text
users.email
warehouses.code
customers.rut_canonical
invoice_requests.request_number
```

---

# 142. Facturas y folios

No se establece unicidad global obligatoria del `sii_folio` mientras no se defina:

- tipo de DTE;
- emisor;
- serie;
- reglas exactas.

La especificación técnica deberá cerrar este punto antes de implementar un constraint único.

---

# 143. RLS

No se considera obligatorio implementar Row Level Security de PostgreSQL en V1 porque la aplicación controla autorización server-side.

Si se propone RLS posteriormente, deberá ser decisión explícita.

Antigravity no deberá incorporarlo unilateralmente.

---

# 144. Seguridad de datos

La base no deberá exponerse directamente al navegador.

Toda interacción deberá pasar por lógica server-side.

---

# 145. Conexión a Neon

Se utilizará una cadena de conexión server-side.

Nunca se expondrá:

```text
DATABASE_URL
```

al frontend.

---

# 146. Datos sensibles

Se consideran sensibles:

- RUT;
- correo;
- teléfono;
- documentos tributarios;
- información comercial.

El acceso deberá respetar roles.

---

# 147. Retención

El modelo debe permitir conservar historial por períodos prolongados.

No se realizará purga automática de:

- facturas;
- notas de crédito;
- rectificaciones.

---

# 148. Tamaño de base de datos

Los PDFs no deberán almacenarse en PostgreSQL.

Esto mantiene el tamaño de Neon controlado.

---

# 149. Documentos

PostgreSQL almacena metadata.

R2 almacena archivo físico.

---

# 150. Monitoreo de almacenamiento

Se podrá calcular:

```text
SUM(documents.file_size)
```

para estimar uso documental registrado.

---

# 151. Vistas recomendadas

Podrán crearse vistas SQL para:

```text
pending_invoice_requests
current_valid_invoices
monthly_billing_summary
warehouse_billing_summary
open_rectifications
```

---

# 152. Vista `pending_invoice_requests`

Conceptualmente:

```sql
WHERE status = 'PENDING'
ORDER BY created_at ASC
```

---

# 153. Vista `current_valid_invoices`

Conceptualmente:

```sql
WHERE status = 'VALID'
```

---

# 154. Vista `monthly_billing_summary`

Deberá agrupar por:

```text
year
month
```

utilizando:

```text
issued_at
```

---

# 155. Vista `warehouse_billing_summary`

Agrupa por:

```text
warehouse_id
```

y período.

---

# 156. Vista `open_rectifications`

Incluye estados diferentes de:

```text
COMPLETED
CANCELLED
```

---

# 157. Triggers

No se recomienda colocar toda la lógica de negocio en triggers.

Los triggers podrán utilizarse cuando exista un beneficio claro para:

- timestamps;
- auditoría técnica;
- integridad simple.

La lógica principal debe permanecer en servicios de dominio.

---

# 158. Migraciones

Todo el esquema deberá gestionarse mediante migraciones versionadas.

---

# 159. Migraciones destructivas

Deberán evitarse.

Preferir:

```text
expand
migrate
contract
```

cuando exista producción con datos.

---

# 160. Desarrollo

La base de desarrollo no deberá utilizar datos reales sensibles salvo necesidad expresa.

---

# 161. Producción

La base de producción deberá estar separada de desarrollo.

---

# 162. Backup

Antes de producción deberá existir estrategia documentada para:

- backup;
- restauración;
- retención;
- prueba de restauración.

---

# 163. Recuperación documental

El modelo debe permitir reconciliar documentos entre:

```text
PostgreSQL
↔
R2
```

mediante:

```text
storage_key
```

---

# 164. Documento huérfano

Deberá ser posible detectar:

```text
archivo en R2 sin fila documents
```

y:

```text
fila documents sin archivo en R2
```

---

# 165. Regla de consistencia de documentos

La operación de finalización deberá comprobar que existe metadata válida y que la carga documental fue exitosa.

---

# 166. Modelo relacional resumido

```text
warehouses
   │
   └── users

customers
   │
   └── invoice_requests
           │
           ├── invoice_request_items
           │
           ├── request_corrections
           │
           ├── invoices
           │       │
           │       └── documents
           │
           └── rectifications
                   │
                   ├── credit_notes
                   │       │
                   │       └── documents
                   │
                   └── invoices
```

---

# 167. Entidades fuera de este modelo

No deberán crearse entidades para:

```text
Hub Maxiofertas
Google Forms
Google Sheets
SII credentials
WhatsApp accounts
```

El Hub está expresamente fuera del alcance de este proyecto.

---

# 168. No crear tabla `hub_users`

No deberá existir sincronización estructural obligatoria con el Hub.

Los usuarios del sistema de facturas son propios.

---

# 169. No crear tabla `google_users`

Google será proveedor de identidad.

No es una entidad de dominio.

---

# 170. No almacenar tokens OAuth permanentes

No deberán almacenarse en estas tablas tokens de Google innecesariamente.

La autenticación será responsabilidad de la capa correspondiente.

---

# 171. No almacenar contraseña

El sistema no deberá tener columna:

```text
password
password_hash
```

si la autenticación se mantiene mediante Google OAuth.

---

# 172. Reglas de negocio protegidas por modelo

## DB-RN-001

Cada solicitud pertenece a una bodega.

## DB-RN-002

Cada solicitud pertenece a un cliente.

## DB-RN-003

Cada solicitud tiene un solicitante.

## DB-RN-004

Los precios ingresados por solicitante son brutos con IVA.

## DB-RN-005

El neto es calculado por el sistema.

## DB-RN-006

No se aceptan cantidades menores que 1.

## DB-RN-007

No se aceptan precios menores o iguales a cero.

## DB-RN-008

Una solicitud completada conserva sus datos históricos.

## DB-RN-009

Una factura no se sobrescribe.

## DB-RN-010

Toda rectificación referencia una factura original.

## DB-RN-011

Toda Nota de Crédito referencia una rectificación y una factura original.

## DB-RN-012

Una rectificación completada debe tener nueva factura.

## DB-RN-013

Una factura anulada sigue existiendo.

## DB-RN-014

Las diferencias SII de ±2 pesos son aceptadas por redondeo.

## DB-RN-015

Diferencias mayores a ±2 son `MISMATCH`.

## DB-RN-016

Los documentos se almacenan externamente.

## DB-RN-017

PostgreSQL almacena metadata documental.

## DB-RN-018

El historial no se elimina en flujo normal.

## DB-RN-019

Los usuarios pueden deshabilitarse sin eliminarse.

## DB-RN-020

Las bodegas pueden deshabilitarse sin eliminarse.

---

# 173. Restricciones para Antigravity

Antigravity no deberá:

- cambiar nombres conceptuales de entidades sin justificación;
- fusionar facturas con solicitudes;
- almacenar PDFs dentro de PostgreSQL;
- guardar montos como `float`;
- eliminar factura original en rectificación;
- sobrescribir PDFs históricos;
- almacenar sólo el precio neto;
- eliminar el precio bruto original;
- recalcular precios históricos en cada lectura;
- modificar datos históricos cuando cambia un cliente;
- crear tablas para Hub Maxiofertas;
- sincronizar usuarios con Hub sin aprobación;
- crear autenticación propia con contraseña;
- introducir otra base de datos.

---

# 174. Regla de bloqueo

Ante una ambigüedad relevante:

```text
BLOCKED — DECISION REQUIRED
```

Antigravity deberá detenerse antes de cambiar el modelo.

---

# 175. Decisiones pendientes para Especificación Técnica

Aún deberán definirse:

1. ORM.
2. estrategia exacta de UUID.
3. algoritmo exacto de numeración `FAC-YYYY-NNNNNN`.
4. algoritmo exacto de RUT.
5. política exacta de redondeo gross→net.
6. método exacto de generación de totales por línea.
7. mecanismo de idempotencia.
8. implementación de estados: enum/check/tablas.
9. formato de migraciones.
10. política de URLs firmadas R2.
11. folio SII obligatorio u opcional.
12. tratamiento futuro de documentos exentos.
13. notas de crédito parciales.
14. relación usuario-múltiples bodegas si se habilita.

---

# 176. Decisiones cerradas en este documento

Se consideran cerradas:

1. PostgreSQL como fuente de verdad.
2. Neon como proveedor previsto.
3. UUID como clave interna recomendada.
4. solicitudes estructuradas por líneas.
5. precio bruto y neto persistidos.
6. precios en pesos sin float.
7. factura como entidad separada de solicitud.
8. rectificación como entidad separada.
9. Nota de Crédito como entidad separada.
10. documentos como metadata externa.
11. auditoría persistente.
12. snapshots de cliente.
13. no eliminación de historial.
14. tolerancia ±2 CLP.
15. Hub fuera del modelo.

---

# 177. Modelo físico preliminar

Resumen de tablas:

```text
users
warehouses
customers
invoice_requests
invoice_request_items
request_corrections
invoices
rectifications
credit_notes
documents
audit_logs
request_status_history
```

Opcionales:

```text
duplicate_checks
idempotency_keys
migration_records
```

---

# 178. Orden recomendado de migraciones iniciales

```text
001_extensions
002_warehouses
003_users
004_customers
005_invoice_requests
006_invoice_request_items
007_request_corrections
008_invoices
009_rectifications
010_credit_notes
011_documents
012_status_history
013_audit_logs
014_indexes
015_views
```

---

# 179. Orden de carga de datos

Para migración histórica:

```text
warehouses
↓
users
↓
customers
↓
invoice_requests
↓
invoice_request_items
↓
invoices
↓
documents
```

---

# 180. Validaciones posteriores a migración

Se deberá comprobar:

- solicitudes sin bodega;
- solicitudes sin cliente;
- RUT duplicados;
- totales inválidos;
- facturas sin solicitud;
- documentos sin entidad;
- estados desconocidos;
- fechas inválidas.

---

# 181. Criterios de aceptación del modelo

El modelo será aceptado cuando:

- soporte todos los flujos del PRD;
- soporte rectificaciones;
- preserve facturas originales;
- soporte documentos R2;
- soporte historial;
- soporte estadísticas;
- evite doble procesamiento mediante transacciones;
- no use float para montos;
- permita migración histórica;
- permita detectar datos inconsistentes;
- no dependa del Hub Maxiofertas.

---

# 182. Dictamen del modelo de datos

## Resultado

**APROBADO CON OBSERVACIONES**

El modelo propuesto se considera adecuado para:

- la operación actual;
- el volumen previsto;
- PostgreSQL/Neon;
- rectificaciones;
- estadísticas;
- auditoría;
- almacenamiento externo de documentos;
- crecimiento futuro moderado.

---

# 183. Observaciones obligatorias antes de implementar

Antes de crear el esquema definitivo deberán cerrarse:

1. algoritmo de redondeo neto;
2. política exacta de totales por línea;
3. folio SII;
4. estrategia de idempotencia;
5. ORM;
6. implementación técnica de estados;
7. política de migración histórica.

---

# 184. Responsable de revisión

**Responsable funcional:** Ángel Ferrer

**Responsable de implementación:** Antigravity

**Responsable de diseño de datos:** Arquitecto/a de Datos Senior

---

# 185. Estado final

**Versión:** 1.0

**Estado recomendado:**

- [ ] APROBADO
- [x] APROBADO CON OBSERVACIONES
- [ ] REQUIERE MODIFICACIONES
- [ ] RECHAZADO

**Fecha de aprobación:** __________________

**Responsable:** __________________

**Observaciones adicionales:**  
____________________________________________________________________

**Riesgos aceptados:**  
____________________________________________________________________

**Cambios exigidos:**  
____________________________________________________________________