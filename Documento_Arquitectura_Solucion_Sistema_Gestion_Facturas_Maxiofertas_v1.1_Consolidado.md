# Documento de Arquitectura de Solución — Sistema de Gestión de Facturas Maxiofertas

**Proyecto:** Sistema de Gestión de Facturas Maxiofertas  
**Tipo de documento:** Arquitectura de Solución  
**Versión:** 1.1 — Consolidada  
**Estado:** APROBADA CON OBSERVACIONES  
**Fecha:** 19 de agosto de 2026  
**Responsable funcional:** Ángel Ferrer  
**Rol responsable del documento:** Arquitecto/a de Soluciones  
**Implementación prevista:** Antigravity  
**Organización:** Maxiofertas  

---

## Control de versión

| Versión | Fecha | Descripción |
|---|---|---|
| 1.0 | 19-08-2026 | Arquitectura de Solución inicial. |
| 1.1 | 19-08-2026 | Integración de la Enmienda Arquitectónica: separación total del Hub Maxiofertas, eliminación de la dependencia de Google OAuth del Hub, autenticación propia del Sistema de Facturas, repositorios y despliegues independientes y prohibición expresa de modificar el Hub. |

### Autoridad documental

Este documento sustituye al **Documento de Arquitectura de Solución v1.0** y a la **Enmienda Arquitectónica v1.1 — Integración con Hub Maxiofertas**.

A partir de su aprobación deberá utilizarse como el **único documento rector de arquitectura** del Sistema de Gestión de Facturas Maxiofertas.

Las decisiones de esta versión prevalecen sobre cualquier definición anterior incompatible.

---

# 1. Propósito

Este documento define la arquitectura de solución del **Sistema de Gestión de Facturas Maxiofertas**.

Establece:

- componentes;
- responsabilidades;
- separación entre aplicación, datos y documentos;
- separación absoluta respecto del Hub Maxiofertas;
- autenticación y autorización propias;
- despliegue;
- concurrencia;
- flujo documental;
- seguridad;
- auditoría;
- cálculos y redondeo;
- disponibilidad;
- respaldo;
- observabilidad;
- restricciones para Antigravity.

La solución deberá respetar el PRD v1.1 y el Diseño Funcional y UX v1.1 consolidados.

---

# 2. Documentos rectores

1. **PRD — Sistema de Gestión de Facturas Maxiofertas v1.1 Consolidado**.
2. **Documento de Diseño Funcional y UX v1.1 Consolidado**.
3. **Enmienda Arquitectónica v1.1 — Integración con Hub Maxiofertas**, ya incorporada en este documento.

Ante contradicciones:

- prevalece el PRD en materia funcional;
- prevalece esta arquitectura en decisiones técnicas;
- cualquier vacío deberá reportarse como:

```text
BLOCKED — DECISION REQUIRED
```

---

# 3. Decisión fundamental: Hub Maxiofertas fuera de alcance

El **Hub Maxiofertas existente NO forma parte del alcance de implementación** del Sistema de Gestión de Facturas.

Debe tratarse como un:

> **sistema externo, existente, estable e independiente.**

Antigravity no deberá:

- modificar el código del Hub;
- reconstruirlo;
- crear otro Hub;
- cambiar su diseño;
- cambiar su autenticación;
- cambiar Google OAuth;
- modificar usuarios o permisos;
- modificar su repositorio;
- modificar su despliegue;
- introducir dependencias;
- implementar funcionalidades del Sistema de Facturas dentro del Hub;
- compartir sesión entre ambos proyectos;
- convertir el Hub en frontend del Sistema de Facturas.

Regla explícita:

```text
HUB MAXIOFERTAS = NO TOCAR
```

---

# 4. Responsabilidad del Hub

Desde este proyecto, el Hub tendrá una única responsabilidad:

> **Servir como punto de navegación mediante enlaces.**

```text
Hub Maxiofertas
      │
      │ enlace
      ▼
Sistema de Gestión de Facturas
```

No existirá dependencia de:

- código;
- repositorio;
- despliegue;
- base de datos;
- sesión;
- roles;
- Google OAuth;
- configuración.

---

# 5. Cambio de enlaces

Cuando el nuevo sistema esté listo, el responsable del proyecto actualizará manualmente los enlaces del Hub.

Conceptualmente:

```text
ANTES

Solicitar factura
→ Google Forms

Gestionar facturas
→ Google Sheets
```

```text
DESPUÉS

Solicitar factura
→ Sistema de Gestión de Facturas

Gestionar facturas
→ Sistema de Gestión de Facturas
```

Esta modificación **no forma parte del trabajo de Antigravity**.

---

# 6. Aplicaciones independientes

```text
maxiofertas-hub
```

y:

```text
maxiofertas-facturacion
```

son aplicaciones distintas.

No deberán fusionarse.

---

# 7. Repositorios independientes

El Sistema de Gestión de Facturas tendrá su propio repositorio.

Antigravity trabajará exclusivamente allí.

No podrá realizar cambios en el repositorio del Hub.

---

# 8. Despliegues independientes

Cada aplicación tendrá despliegue independiente.

Ejemplo:

```text
Hub
https://maxiofertas-hub.vercel.app
```

```text
Facturación
https://maxiofertas-facturacion.vercel.app
```

Un despliegue de Facturación no deberá implicar desplegar el Hub y viceversa.

---

# 9. Arquitectura general

```text
                    HUB MAXIOFERTAS
                  Sistema ya existente
                       NO TOCAR
                          │
                          │ enlace
                          ▼
              ┌───────────────────────┐
              │ SISTEMA DE FACTURAS   │
              │                       │
              │ Next.js               │
              │ Vercel                │
              │                       │
              │ Autenticación propia  │
              │ Roles internos        │
              │ Reglas de negocio     │
              │ API interna           │
              │ Estadísticas          │
              └──────────┬────────────┘
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
     Neon PostgreSQL          Cloudflare R2
     Datos y auditoría        PDFs y documentos
```

---

# 10. Decisiones arquitectónicas principales

| Área | Decisión |
|---|---|
| Aplicación | Next.js |
| Hosting | Vercel |
| Proyecto | Independiente del Hub |
| Repositorio | Independiente |
| Despliegue | Independiente |
| Base de datos | PostgreSQL |
| PostgreSQL administrado | Neon |
| Documentos | Cloudflare R2 |
| Autenticación del Hub | Fuera de alcance |
| Google OAuth del Hub | No reutilizar ni modificar |
| Autenticación del Sistema de Facturas | Propia e independiente |
| Registro público | No |
| Gestión de usuarios | Manual |
| Identidad principal | Correo electrónico |
| Autorización | Roles internos |
| Dominio inicial | `vercel.app` |
| Integración con Hub | Sólo enlaces |
| Sesión compartida | No requerida |
| Integración SII | Manual |
| Emisión DTE | Fuera de V1 |
| Auditoría | PostgreSQL |

---

# 11. Principios arquitectónicos

## Simplicidad

No incorporar sin necesidad:

- microservicios;
- Kubernetes;
- Kafka;
- Redis obligatorio;
- GraphQL;
- event-driven complejo;
- broker de mensajes;
- SSO complejo.

## Bajo costo

Usar servicios administrados adecuados al volumen esperado.

## Separación de responsabilidades

```text
Vercel
→ aplicación y lógica

Neon
→ datos y transacciones

Cloudflare R2
→ documentos

Autenticación propia
→ identidad del Sistema de Facturas

Hub
→ enlaces únicamente
```

---

# 12. Frontend

Tecnología:

**Next.js**

Responsabilidades:

- formularios;
- navegación;
- vistas por rol;
- UX;
- carga de archivos;
- dashboards;
- estadísticas;
- copiar datos;
- abrir WhatsApp;
- abrir SII;
- responsive.

---

# 13. Validación server-side

Toda operación sensible deberá validarse nuevamente en servidor:

- creación de solicitud;
- asignación;
- cambio de estado;
- carga documental;
- rectificación;
- permisos;
- clientes;
- finalización;
- usuarios.

---

# 14. Backend

La lógica podrá permanecer en el mismo proyecto Next.js.

```text
Next.js
│
├── UI
├── Server Actions / Route Handlers
├── Application Services
├── Domain
├── PostgreSQL
└── Cloudflare R2
```

No se requiere backend separado en V1.

---

# 15. Desacoplamiento interno

```text
UI
↓
Application Services
↓
Domain
↓
Data / External Services
```

La lógica de negocio no deberá incrustarse directamente en componentes visuales.

---

# 16. Base de datos

Se utilizará:

**PostgreSQL mediante Neon**

en un proyecto independiente.

No se reutilizará base de datos del Hub ni de otros sistemas.

---

# 17. Datos en PostgreSQL

- usuarios;
- roles;
- bodegas;
- clientes;
- solicitudes;
- líneas de solicitud;
- precios;
- estados;
- asignaciones;
- observaciones;
- rectificaciones;
- facturas;
- Notas de Crédito;
- referencias documentales;
- auditoría;
- métricas.

---

# 18. Binarios fuera de PostgreSQL

Los PDFs no deberán almacenarse como binarios en la base.

PostgreSQL guardará referencias y metadatos.

---

# 19. Cloudflare R2

Se utilizará un bucket dedicado, por ejemplo:

```text
maxiofertas-facturas
```

Organización sugerida:

```text
facturas/
  2026/
    08/
      FAC-2026-001842/
        factura.pdf

notas-credito/
  2026/
    08/
      FAC-2026-001801/
        nc-12345.pdf
```

---

# 20. Acceso a documentos

No exponer credenciales R2 al navegador.

Utilizar:

- URLs firmadas;
- endpoints controlados;
- mecanismo seguro equivalente.

---

# 21. Tipos documentales iniciales

```text
INVOICE
CREDIT_NOTE
```

Extensibles a futuro.

---

# 22. Autenticación del Hub: fuera de alcance

El Hub posee su propio mecanismo de autenticación.

Ese mecanismo:

- pertenece al Hub;
- no se modifica;
- no se reconstruye;
- no se comparte como dependencia obligatoria.

---

# 23. Revocación de Google OAuth como dependencia del Sistema de Facturas

La Arquitectura v1.0 incluía Google OAuth y planteaba reutilizar la sesión del Hub.

Esa decisión queda **revocada**.

El Sistema de Facturas:

- no dependerá de la sesión Google del Hub;
- no dependerá de cookies del Hub;
- no dependerá de tokens del Hub;
- no dependerá de configuración OAuth del Hub;
- no deberá revisar ni modificar su código de autenticación.

Google OAuth del Hub **no forma parte de la arquitectura del nuevo sistema**.

---

# 24. Autenticación propia del Sistema de Facturas

El Sistema de Gestión de Facturas deberá proteger sus recursos de manera independiente.

El mecanismo deberá:

- identificar usuarios autorizados;
- impedir accesos no autorizados;
- asociar roles;
- asociar bodegas;
- permitir activar/desactivar usuarios;
- proteger el acceso directo por URL;
- funcionar sin modificación del Hub.

El mecanismo técnico concreto se definirá en la **Especificación Técnica**.

---

# 25. Identidad y usuarios internos

Relación conceptual:

```text
email
→ usuario
→ rol
→ bodega
→ activo/inactivo
```

Ejemplo:

```text
usuario@empresa.cl
WAREHOUSE_USER
Santiago
Activo
```

---

# 26. Gestión manual

El número reducido de usuarios permite administración manual.

No existirá:

- auto-registro;
- registro público;
- selección libre de roles;
- alta automática por pertenecer al Hub.

---

# 27. Acceso directo

La seguridad no dependerá de haber ingresado desde el Hub.

También deberá ser seguro:

```text
Navegador
↓
URL directa del Sistema de Facturas
```

---

# 28. Modelo conceptual de usuarios

```text
users
-----
id
email
name
role
warehouse_id
active
created_at
updated_at
```

La estructura final se definirá en Modelo de Datos.

---

# 29. Roles

```text
WAREHOUSE_USER
INVOICE_EXECUTOR
MANAGEMENT
ADMIN
```

---

# 30. Autorización

Cada endpoint u operación protegida deberá validar server-side:

- identidad;
- usuario interno;
- active;
- rol;
- alcance.

---

# 31. Bodegas

Si un solicitante pertenece a una sola bodega, se autocompleta.

El modelo podrá extenderse a múltiples bodegas si se aprueba posteriormente.

---

# 32. Usuarios deshabilitados

Se utilizará:

```text
active = false
```

en lugar de borrar usuarios, preservando auditoría.

---

# 33. Flujo de solicitud

```text
Solicitante
↓
Formulario
↓
Validación
↓
Validación RUT
↓
Cálculo de totales
↓
Detector de duplicado
↓
Confirmación
↓
Transacción PostgreSQL
↓
PENDIENTE
```

---

# 34. Líneas de productos

Conceptualmente:

```text
description
quantity
unit_price_gross
unit_price_net
line_total_gross
```

---

# 35. Precios

El solicitante ingresa sólo:

```text
unit_price_gross
```

Precio con IVA.

No ingresa neto.

---

# 36. Cálculo de neto

Para IVA 19%:

```text
net = gross / 1.19
```

Función centralizada server-side.

---

# 37. Moneda

No utilizar `float`.

Preferir:

- enteros;
- numeric;
- decimal exacto.

---

# 38. Redondeo

Una única política centralizada:

```text
calculateNetFromGross()
calculateGrossFromNet()
calculateDifference()
```

---

# 39. Tolerancia de cuadratura

Regla aprobada:

```text
ABS(total_sii - total_solicitado) <= 2 CLP
```

Estados:

```text
MATCH
ROUNDING_ACCEPTED
MISMATCH
```

---

# 40. Auditoría de cuadratura

Guardar:

```text
expected_gross_total
sii_gross_total
gross_difference
reconciliation_status
```

---

# 41. Finalización

Una factura podrá finalizar cuando:

```text
reconciliation_status IN (
  MATCH,
  ROUNDING_ACCEPTED
)
```

y se cumplan los demás requisitos.

`MISMATCH` requerirá excepción ADMIN con motivo y auditoría.

---

# 42. Duplicados

Podrán evaluarse:

- RUT;
- bodega;
- total;
- líneas de producto;
- ventana temporal.

Resultados conceptuales:

```text
NONE
POSSIBLE
HIGH_CONFIDENCE
```

Será advertencia, no bloqueo absoluto.

---

# 43. Normalización de RUT

```text
canonical:
761234567

display:
76.123.456-7
```

---

# 44. Concurrencia

`Tomar solicitud` deberá ser una operación atómica.

Conceptualmente:

```text
UPDATE invoice_requests
SET status = 'IN_PROGRESS',
    assigned_to = :user
WHERE id = :id
  AND status = 'PENDING';
```

Debe verificarse que sólo una fila haya sido modificada.

---

# 45. Estados de solicitud

```text
PENDING
IN_PROGRESS
NEEDS_CORRECTION
COMPLETED
CANCELLED
DUPLICATE
```

---

# 46. Rectificaciones

La rectificación será una entidad/proceso separado.

Nunca sobrescribirá la factura original.

---

# 47. Flujo de rectificación

```text
Factura completada
↓
Solicitar cambio
↓
Rectificación
↓
Ejecutor toma rectificación
↓
Nota de Crédito
↓
Factura original anulada
↓
Nueva factura
↓
Rectificación completada
```

---

# 48. Estados sugeridos de rectificación

```text
REQUESTED
IN_PROGRESS
CREDIT_NOTE_REGISTERED
NEW_INVOICE_PENDING
COMPLETED
CANCELLED
```

---

# 49. Cadena documental

```text
Solicitud
│
├── Factura original
│
├── Nota de Crédito
└── Factura nueva
```

---

# 50. Inmutabilidad documental

Una factura finalizada:

- no se sobrescribe;
- no se sustituye silenciosamente;
- no se borra del historial.

---

# 51. Estadísticas

Se calcularán desde PostgreSQL.

Inicialmente:

- facturado por período;
- neto;
- IVA débito estimado;
- facturas;
- ticket promedio;
- facturación por bodega;
- pendientes;
- en proceso;
- rectificaciones;
- tiempos promedio.

---

# 52. Facturación vigente

Las facturas totalmente anuladas mediante Nota de Crédito no seguirán sumando.

La nueva factura se contabilizará según su fecha de emisión.

---

# 53. Auditoría

Eventos mínimos:

```text
REQUEST_CREATED
REQUEST_UPDATED
REQUEST_ASSIGNED
REQUEST_CORRECTION_REQUESTED
REQUEST_RESUBMITTED
REQUEST_CANCELLED
REQUEST_MARKED_DUPLICATE
INVOICE_UPLOADED
INVOICE_COMPLETED
RECTIFICATION_REQUESTED
CREDIT_NOTE_REGISTERED
INVOICE_REPLACED
USER_CREATED
USER_ROLE_CHANGED
USER_DISABLED
ADMIN_OVERRIDE
```

---

# 54. Estructura conceptual de auditoría

```text
audit_log
---------
id
user_id
event_type
entity_type
entity_id
old_values
new_values
metadata
created_at
```

---

# 55. Integración SII

V1 no integrará servicios tributarios directamente.

El sistema:

- muestra datos;
- calcula netos;
- permite copiar;
- abre SII;
- registra total;
- almacena PDF;
- registra folio;
- gestiona rectificaciones.

No:

- autentica automáticamente;
- emite DTE;
- firma XML;
- administra CAF;
- genera folios.

---

# 56. WhatsApp

No se utilizará API en V1.

Se generará texto y enlace para apertura manual.

---

# 57. Seguridad

Controles mínimos:

- HTTPS;
- autenticación propia;
- autorización server-side;
- secretos sólo server-side;
- validación de archivos;
- validación de input;
- consultas parametrizadas;
- auditoría;
- aislamiento por rol;
- protección documental.

---

# 58. Variables de entorno

Ejemplos:

```text
DATABASE_URL
AUTH_SECRET
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
```

No deberán ser dependencias del Sistema de Facturas:

```text
GOOGLE_CLIENT_ID DEL HUB
GOOGLE_CLIENT_SECRET DEL HUB
COOKIES DEL HUB
TOKENS DEL HUB
```

---

# 59. Entornos

```text
development
production
```

y eventualmente:

```text
staging
```

Producción no compartirá base ni almacenamiento de pruebas.

---

# 60. Despliegue

```text
GitHub
↓
Vercel
↓
Deploy
```

Producción desde una rama protegida equivalente a `main`.

---

# 61. Migraciones

Las migraciones deberán:

- estar versionadas;
- residir en Git;
- ser reproducibles;
- ser revisables;
- evitar pérdida de datos.

---

# 62. Rollback y backups

La solución deberá permitir:

- rollback de aplicación;
- restauración PostgreSQL;
- recuperación de documentos.

Antes de producción se documentarán:

- frecuencia;
- retención;
- restauración;
- prueba de restauración.

---

# 63. Errores

Si falla R2:

- no finalizar;
- mantener estado válido;
- permitir reintento.

Si falla PostgreSQL:

- rollback;
- no mostrar éxito;
- permitir reintento.

---

# 64. Operaciones críticas transaccionales

- tomar solicitud;
- reenviar corrección;
- finalizar factura;
- registrar Nota de Crédito;
- finalizar rectificación.

---

# 65. Idempotencia

Doble clic o reintento no deberá duplicar operaciones.

---

# 66. Observabilidad

Logging estructurado para:

- errores;
- fallas R2;
- fallas de autenticación;
- errores DB;
- operaciones críticas fallidas.

No registrar secretos ni documentos completos.

---

# 67. Monitoreo de almacenamiento

Registrar:

- cantidad de archivos;
- tamaño acumulado;
- capacidad utilizada.

Umbrales configurables.

---

# 68. Límite inicial de PDF

**2 MB por documento**, salvo cambio aprobado.

---

# 69. Distribución por dispositivo

Solicitante:

```text
Móvil
Escritorio
```

Ejecutor:

```text
Escritorio
```

Jefatura:

```text
Escritorio → gestión
Móvil → estadísticas
```

---

# 70. Rendimiento

Diseñada para:

- decenas de usuarios;
- miles de solicitudes;
- crecimiento gradual;
- estadísticas operacionales.

---

# 71. Índices

Prever índices para:

- estado;
- fecha;
- bodega;
- RUT;
- asignado;
- fecha de emisión;
- número de solicitud.

---

# 72. Caché

No se requiere caché distribuida.

La cola no deberá mostrar datos obsoletos que faciliten doble procesamiento.

---

# 73. Fuente de verdad

PostgreSQL será la fuente de verdad operacional.

No serán fuente de verdad:

- Hub;
- navegador;
- localStorage;
- R2;
- WhatsApp;
- Google Sheets tras el corte.

---

# 74. Migración histórica

```text
Extract
↓
Transform
↓
Validate
↓
Load
↓
Verify
```

Los registros podrán marcarse como:

```text
source = 'GOOGLE_SHEETS_LEGACY'
```

---

# 75. PDFs históricos de Drive

No es obligatorio migrarlos inmediatamente.

Puede conservarse referencia a Google Drive para registros históricos.

Los documentos nuevos utilizarán R2.

---

# 76. Estrategia de corte

```text
Nuevo sistema en pruebas
↓
Validación
↓
Producción
↓
Google Forms / Sheets en contingencia
↓
Monitoreo
↓
Retiro de canales anteriores
```

El cambio de enlaces del Hub lo realizará el responsable del proyecto.

---

# 77. Dominio

V1 podrá utilizar:

```text
*.vercel.app
```

No se requiere dominio personalizado.

---

# 78. Dependencias externas

Dependencias reales del Sistema de Facturas:

```text
Vercel
Neon
Cloudflare R2
SII (manual)
WhatsApp (enlace)
```

El Hub **no es una dependencia de ejecución**.

Google OAuth del Hub **no es una dependencia del Sistema de Facturas**.

---

# 79. Portabilidad

La solución deberá permitir razonablemente:

```text
Neon → otro PostgreSQL
Vercel → otro hosting compatible
```

---

# 80. ORM

Se definirá en Especificación Técnica.

Posibles alternativas:

- Prisma;
- Drizzle;
- SQL tipado.

---

# 81. Autenticación concreta pendiente

Esta arquitectura exige autenticación propia, pero no impone aún proveedor o librería.

La Especificación Técnica deberá definir:

- método de login;
- sesiones;
- expiración;
- recuperación;
- protección CSRF si aplica;
- almacenamiento de credenciales/tokens;
- controles server-side.

No podrá seleccionarse un mecanismo que obligue a modificar el Hub.

---

# 82. ADR-001 — Aplicación independiente

**Decisión:** Sistema de Facturas independiente del Hub.  
**Estado:** APROBADA.

---

# 83. ADR-002 — Next.js + Vercel

**Decisión:** Next.js en Vercel.  
**Estado:** APROBADA.

---

# 84. ADR-003 — PostgreSQL en Neon

**Decisión:** PostgreSQL administrado en Neon.  
**Estado:** APROBADA.

---

# 85. ADR-004 — Cloudflare R2

**Decisión:** R2 para documentos.  
**Estado:** APROBADA.

---

# 86. ADR-005 — Autenticación propia

**Decisión:** El Sistema de Facturas tendrá autenticación independiente.

Google OAuth del Hub queda fuera del alcance y fuera de las dependencias del nuevo sistema.

**Estado:** APROBADA.

---

# 87. ADR-006 — Autorización interna

**Decisión:** roles internos relacionados por usuario/email.  
**Estado:** APROBADA.

---

# 88. ADR-007 — Dominio Vercel

**Decisión:** usar inicialmente `vercel.app`.  
**Estado:** APROBADA.

---

# 89. ADR-008 — SII manual

**Decisión:** sin emisión tributaria directa.  
**Estado:** APROBADA.

---

# 90. ADR-009 — Tolerancia de $2

```text
ABS(SII - solicitud) <= $2
```

**Estado:** APROBADA.

---

# 91. ADR-010 — Documentos inmutables

```text
Factura original
+
Nota de Crédito
+
Nueva factura
```

**Estado:** APROBADA.

---

# 92. ADR-011 — Hub como sistema externo

**Decisión:** Hub Maxiofertas fuera del alcance.

**Responsabilidad del proyecto:** entregar URL(s) del nuevo sistema.

**Responsabilidad del responsable del proyecto:** actualizar manualmente enlaces del Hub.

**Estado:** APROBADA.

---

# 93. Restricción explícita para Antigravity

Si Antigravity considera necesaria cualquier modificación del Hub:

```text
BLOCKED — DECISION REQUIRED
```

No podrá tocar:

- código;
- OAuth;
- usuarios;
- permisos;
- repositorio;
- despliegue;
- configuración.

---

# 94. Componentes prohibidos sin aprobación

No incorporar unilateralmente:

- Redis;
- MongoDB;
- Firebase;
- Supabase;
- otra base de datos;
- otro almacenamiento;
- microservicios;
- colas externas;
- Kubernetes;
- servicios pagos;
- sesión compartida con Hub;
- autenticación dependiente del Hub;
- lógica dentro del Hub.

---

# 95. Estructura sugerida

```text
src/
├── app/
├── components/
├── features/
│   ├── auth/
│   ├── invoices/
│   ├── requests/
│   ├── customers/
│   ├── corrections/
│   ├── statistics/
│   └── admin/
├── lib/
│   ├── db/
│   ├── auth/
│   ├── r2/
│   └── validation/
├── domain/
└── types/

migrations/
tests/
```

---

# 96. Estrategia de implementación

```text
Fase 1  Infraestructura
Fase 2  Autenticación propia y roles
Fase 3  Bodegas y clientes
Fase 4  Solicitudes
Fase 5  Cola de facturación
Fase 6  Cálculos y cuadratura
Fase 7  R2 y documentos
Fase 8  Rectificaciones
Fase 9  Estadísticas
Fase 10 Migración
Fase 11 Hardening y producción
```

No existe fase para:

```text
Modificar Hub
Integrar OAuth del Hub
Reconstruir Hub
Compartir sesión
```

---

# 97. Checkpoints

Antigravity deberá solicitar aprobación tras:

1. infraestructura;
2. autenticación propia;
3. esquema de datos;
4. flujo principal;
5. R2;
6. rectificaciones;
7. estadísticas;
8. migración;
9. producción.

---

# 98. Alcance de entrega

Al finalizar, el sistema deberá proporcionar como mínimo:

```text
URL para solicitar facturas
URL para gestionar facturas
URL para administración / estadísticas
```

Pueden ser rutas de una misma app.

El responsable decidirá cuáles enlaces incorpora al Hub.

---

# 99. Decisiones pendientes

## Base de datos
- modelo exacto;
- constraints;
- índices;
- retención.

## Autenticación propia
- método;
- librería;
- sesiones;
- expiración;
- recuperación;
- controles de seguridad.

## Documentos
- URLs firmadas;
- expiración;
- backup.

## Cálculos
- redondeo exacto;
- múltiples unidades;
- reproducción del resultado SII.

## Estadísticas
- Notas de Crédito en períodos distintos;
- notas parciales futuras.

---

# 100. Riesgos arquitectónicos

## AR-001 — Servicios externos
Mitigación: desacoplamiento y backups.

## AR-002 — Autenticación propia
Mitigación: definición técnica, autorización server-side y pruebas.

## AR-003 — Cuadratura SII
Mitigación: regla centralizada y tolerancia ±2 CLP.

## AR-004 — Datos históricos
Mitigación: ETL controlado.

## AR-005 — Documentos sensibles
Mitigación: acceso controlado.

## AR-006 — Cuotas
Mitigación: monitoreo.

## AR-007 — Acoplamiento accidental al Hub
Mitigación: ADR-011 y regla `HUB MAXIOFERTAS = NO TOCAR`.

---

# 101. Criterios de aceptación

La arquitectura será válida si:

- cumple PRD v1.1;
- cumple Diseño Funcional y UX v1.1;
- utiliza Next.js/Vercel;
- utiliza PostgreSQL/Neon;
- utiliza R2;
- mantiene Hub y Facturación como sistemas distintos;
- no modifica el Hub;
- no depende de Google OAuth del Hub;
- no exige sesión compartida;
- mantiene autenticación propia;
- no permite auto-registro;
- mantiene usuarios y roles propios;
- protege acceso directo;
- evita doble procesamiento;
- soporta rectificaciones;
- soporta estadísticas;
- preserva auditoría;
- mantiene costos controlados.

---

# 102. Arquitectura definitiva

```text
                         ┌─────────────────────┐
                         │   HUB MAXIOFERTAS   │
                         │                     │
                         │ Sistema existente   │
                         │ FUERA DE ALCANCE    │
                         │      NO TOCAR       │
                         └──────────┬──────────┘
                                    │
                                    │ enlace
                                    ▼
                  ┌────────────────────────────────┐
                  │ SISTEMA GESTIÓN DE FACTURAS   │
                  │                                │
                  │ Next.js + Vercel               │
                  │                                │
                  │ • Autenticación propia         │
                  │ • Usuarios y roles propios     │
                  │ • UI                           │
                  │ • Reglas de negocio            │
                  │ • Cálculos                     │
                  │ • API interna                  │
                  │ • Estadísticas                 │
                  └───────────┬──────────┬────────┘
                              │          │
                    ┌─────────▼───┐ ┌────▼──────────┐
                    │ PostgreSQL  │ │ Cloudflare R2 │
                    │ Neon        │ │               │
                    │ Datos       │ │ Facturas PDF  │
                    │ Usuarios    │ │ Notas Crédito │
                    │ Roles       │ │               │
                    │ Auditoría   │ │               │
                    └─────────────┘ └───────────────┘

                              │
                              ▼
                       ┌─────────────┐
                       │     SII     │
                       │   MANUAL    │
                       └─────────────┘
```

---

# 103. Dictamen

**Resultado:** APROBADA CON OBSERVACIONES

La arquitectura es adecuada para el alcance.

La principal corrección incorporada respecto de v1.0 es:

> **El Hub Maxiofertas no forma parte del Sistema de Gestión de Facturas y no debe utilizarse como dependencia de autenticación ni de sesión.**

---

# 104. Observaciones obligatorias antes de producción

1. mecanismo técnico de autenticación propia;
2. esquema definitivo de base de datos;
3. redondeo por línea;
4. transacciones de asignación;
5. idempotencia;
6. URLs seguras;
7. backup PostgreSQL;
8. recuperación R2;
9. migraciones;
10. auditoría;
11. estadísticas de Notas de Crédito;
12. restauración de prueba.

---

# 105. Regla final para Antigravity

El objetivo es:

> **Reemplazar Google Forms + Google Sheets por el nuevo Sistema de Gestión de Facturas.**

No es objetivo:

> **Reconstruir, rediseñar, modificar, integrar ni administrar el Hub Maxiofertas.**

La relación será únicamente:

```text
HUB
  │
  └── ENLACE
        │
        ▼
SISTEMA DE FACTURAS
```

Nada más.

---

# 106. Estado final

**Versión:** 1.1 — Consolidada

- [ ] APROBADA
- [x] APROBADA CON OBSERVACIONES
- [ ] REQUIERE MODIFICACIONES
- [ ] RECHAZADA

**Fecha de aprobación:** __________________  
**Responsable:** __________________

**Observaciones adicionales:**  
____________________________________________________________________

**Riesgos aceptados:**  
____________________________________________________________________

**Cambios exigidos:**  
____________________________________________________________________
