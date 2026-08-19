# Plan de Implementación y Criterios de Aceptación v1.1
## Sistema de Gestión de Facturas Maxiofertas

**Proyecto:** Sistema de Gestión de Facturas Maxiofertas  
**Tipo de documento:** Plan de Implementación / Delivery Plan / Criterios de Aceptación  
**Versión:** 1.1  
**Estado:** Propuesta corregida para aprobación  
**Fecha:** 19 de agosto de 2026  
**Responsable funcional:** Ángel Ferrer  
**Responsable de implementación:** Antigravity  
**Organización:** Maxiofertas  

---

# 1. Propósito

Este documento define el orden obligatorio de implementación del Sistema de Gestión de Facturas Maxiofertas.

Su objetivo es impedir:

- desarrollo sin planificación;
- decisiones improvisadas;
- implementación prematura de pantallas;
- cambios estructurales tardíos;
- introducción de tecnologías no aprobadas;
- desarrollo de funcionalidades fuera de alcance;
- modificaciones al Hub Maxiofertas;
- duplicación innecesaria de autenticación;
- despliegues inseguros;
- paso a producción sin pruebas.

La implementación deberá ejecutarse por fases controladas.

---

# 2. Regla principal

Antigravity no deberá intentar implementar todo el sistema en una sola ejecución.

La secuencia será:

```text
Preparar
↓
Inspeccionar integración de identidad
↓
Construir infraestructura
↓
Construir seguridad
↓
Construir datos
↓
Construir dominio
↓
Construir flujo principal
↓
Construir documentos
↓
Construir rectificaciones
↓
Construir estadísticas
↓
Migrar
↓
Probar
↓
Asegurar
↓
Desplegar
```

---

# 3. Documentos obligatorios

Antes de comenzar, Antigravity deberá leer completamente:

1. PRD.
2. Actualización PRD v1.1.
3. Diseño Funcional y UX.
4. Actualización UX v1.1.
5. Arquitectura de Solución.
6. Enmienda Arquitectónica v1.1 — Integración con Hub Maxiofertas.
7. Modelo de Dominio y Base de Datos.
8. Especificación Técnica / API.
9. Matriz de Roles y Permisos.
10. Estándar de Seguridad.

Estos documentos constituyen la fuente autoritativa.

---

# 4. Regla de precedencia

Ante conflicto:

```text
PRD / reglas funcionales aprobadas
↓
Enmiendas funcionales
↓
Arquitectura
↓
Enmiendas arquitectónicas
↓
Modelo de Datos
↓
API / Contratos
↓
Roles
↓
Seguridad
↓
Plan de implementación
↓
Código
```

La IA no deberá resolver conflictos unilateralmente.

---

# 5. Regla absoluta sobre Hub Maxiofertas

```text
HUB MAXIOFERTAS = SISTEMA EXISTENTE
HUB MAXIOFERTAS = NO TOCAR
```

El Hub se utilizará únicamente como punto de entrada mediante enlaces.

Antigravity no deberá:

- modificar su código;
- modificar su repositorio;
- cambiar Google OAuth;
- cambiar usuarios;
- cambiar permisos;
- cambiar su diseño;
- cambiar sus rutas;
- cambiar su despliegue;
- crear un nuevo Hub;
- crear una copia del Hub;
- instalar dependencias dentro del Hub;
- implementar funciones del sistema de facturación dentro del Hub.

Esta restricción deriva de la Enmienda Arquitectónica v1.1.

---

# 6. Regla absoluta de autenticación

El usuario deberá autenticarse **una sola vez**.

El flujo objetivo será:

```text
Usuario
↓
Google OAuth en Hub Maxiofertas
↓
Hub Maxiofertas
↓
clic en Facturación
↓
Sistema de Gestión de Facturas
↓
identidad reconocida
↓
rol y permisos internos
↓
acceso
```

No se acepta como flujo normal:

```text
Google OAuth en Hub
↓
Hub
↓
Facturación
↓
Google OAuth nuevamente
```

---

# 7. Diferencia entre autenticación y autorización

El Hub será responsable de la autenticación inicial del usuario mediante Google OAuth.

El Sistema de Gestión de Facturas será responsable de:

```text
identidad recibida/reconocida
↓
buscar email en users
↓
active = true
↓
rol
↓
bodega
↓
permisos
```

Esto constituye:

**autorización interna**, no un segundo login.

---

# 8. Prohibición de segundo login

Antigravity no deberá implementar unilateralmente:

- segunda pantalla de Google OAuth;
- login propio;
- correo/contraseña;
- registro independiente;
- autenticación duplicada.

Si técnicamente no logra reutilizar o reconocer la identidad existente sin modificar Hub, deberá reportar:

```text
BLOCKED — AUTHENTICATION ARCHITECTURE DECISION REQUIRED
```

---

# 9. Inspección técnica del Hub

Antigravity podrá realizar una inspección **read-only** de la implementación de autenticación del Hub exclusivamente para conocer:

- proveedor utilizado;
- mecanismo de sesión;
- cookies;
- tokens;
- Auth.js/NextAuth u otra librería;
- dominio de cookies;
- forma de persistencia de sesión;
- posibilidad de reconocimiento entre aplicaciones.

Esta inspección no autoriza modificaciones.

---

# 10. Resultado esperado de la inspección

Antigravity deberá determinar una de estas condiciones:

## Opción A — Identidad reutilizable

Es posible reconocer de forma segura la sesión/identidad existente sin modificar Hub.

Resultado:

```text
AUTH INTEGRATION — COMPATIBLE
```

Se podrá continuar.

## Opción B — Identidad no reutilizable sin intervención

No es posible hacerlo de forma segura sin modificar Hub o introducir segundo login.

Resultado:

```text
BLOCKED — AUTHENTICATION ARCHITECTURE DECISION REQUIRED
```

No implementar solución alternativa sin aprobación.

---

# 11. Alcance tecnológico aprobado

```text
Aplicación:
Next.js

Hosting:
Vercel

Base de datos:
PostgreSQL / Neon

ORM:
Drizzle

Documentos:
Cloudflare R2

Identidad:
Google OAuth ya utilizado en Hub

Repositorio:
GitHub independiente
```

No añadir infraestructura sin aprobación.

---

# 12. Entornos

Mínimo:

```text
development
production
```

Recomendado:

```text
development
staging
production
```

cuando resulte viable.

Producción no se utilizará como entorno de pruebas.

---

# 13. Fases oficiales

La implementación se divide en:

```text
Fase 0  — Preparación documental
Fase 1  — Inspección read-only de identidad Hub
Fase 2  — Proyecto e infraestructura
Fase 3  — Base de datos
Fase 4  — Integración de identidad y autorización
Fase 5  — Maestros básicos
Fase 6  — Solicitudes
Fase 7  — Cola de facturación
Fase 8  — Motor de cálculo y cuadratura
Fase 9  — Gestión documental
Fase 10 — Finalización de factura
Fase 11 — Correcciones previas
Fase 12 — Rectificaciones y Nota de Crédito
Fase 13 — Estadísticas
Fase 14 — Administración
Fase 15 — Migración histórica
Fase 16 — QA integral
Fase 17 — Security Gate
Fase 18 — Preparación de producción
Fase 19 — Puesta en marcha
Fase 20 — Estabilización
```

---

# 14. FASE 0 — Preparación documental

## Objetivo

Asegurar que la IA comprende qué debe construir antes de escribir código.

Antigravity deberá:

1. leer todos los documentos;
2. resumir restricciones;
3. listar módulos;
4. identificar decisiones cerradas;
5. identificar decisiones pendientes;
6. detectar contradicciones;
7. confirmar expresamente:

```text
HUB = NO TOCAR
LOGIN = UNA SOLA VEZ
```

---

# 15. Entregable Fase 0

```text
CHECKPOINT — DOCUMENTACIÓN ANALIZADA
```

Debe indicar:

- alcance entendido;
- arquitectura entendida;
- restricciones;
- dudas;
- riesgos.

No debe escribir funcionalidad de negocio todavía.

---

# 16. FASE 1 — Inspección read-only de identidad Hub

## Objetivo

Determinar técnicamente cómo reconocer al usuario ya autenticado.

---

# 17. Restricción

Esta fase es exclusivamente:

```text
READ ONLY
```

sobre Hub.

No modificar:

- archivos;
- OAuth;
- cookies;
- variables;
- dependencias;
- despliegue.

---

# 18. Inspección requerida

Revisar:

- mecanismo actual Google OAuth;
- librería;
- tipo de sesión;
- cookie de sesión;
- dominio y scope;
- expiración;
- firmas;
- validación;
- posibilidad segura de consumo desde otra aplicación.

---

# 19. Entregable Fase 1

```text
CHECKPOINT — AUTH HUB AUDIT
```

Debe explicar:

1. cómo autentica actualmente el Hub;
2. qué evidencia de identidad existe;
3. si puede validarse desde Facturación;
4. cómo hacerlo sin tocar Hub;
5. riesgos;
6. recomendación.

---

# 20. Resultado obligatorio

Sólo:

```text
AUTH INTEGRATION — COMPATIBLE
```

o:

```text
BLOCKED — AUTHENTICATION ARCHITECTURE DECISION REQUIRED
```

---

# 21. FASE 2 — Proyecto e infraestructura

## Objetivo

Crear el proyecto independiente sin implementar negocio.

---

# 22. Repositorio

Crear repositorio independiente:

```text
maxiofertas-facturacion
```

---

# 23. Aplicación

Inicializar:

```text
Next.js
TypeScript
```

con configuración estricta.

---

# 24. Herramientas

Configurar:

- TypeScript strict;
- lint;
- formatter;
- testing;
- Drizzle;
- schemas;
- variables de entorno.

---

# 25. Vercel

Crear proyecto independiente.

No conectar código con Hub.

---

# 26. Neon

Crear base exclusiva:

```text
Facturación Maxiofertas
```

---

# 27. R2

Configurar almacenamiento independiente.

Separar development/production cuando sea posible.

---

# 28. Health endpoint

Implementar:

```text
GET /api/v1/health
```

Respuesta mínima:

```json
{
  "status": "ok"
}
```

---

# 29. Entregable Fase 2

```text
CHECKPOINT — INFRAESTRUCTURA BASE
```

Debe demostrar:

- build;
- deployment de desarrollo;
- conexión server-side a Neon;
- configuración R2;
- secretos protegidos;
- `.env.example`;
- Hub intacto.

---

# 30. FASE 3 — Base de datos

## Objetivo

Construir el modelo antes de interfaces de negocio.

---

# 31. Tablas mínimas

```text
warehouses
users
customers
invoice_requests
invoice_request_items
request_corrections
invoices
rectifications
credit_notes
documents
request_status_history
audit_logs
```

---

# 32. Reglas

Implementar:

- PK;
- FK;
- UNIQUE;
- CHECK;
- índices;
- no float;
- estados aprobados;
- inmutabilidad histórica.

---

# 33. Migraciones

Versionadas y en Git.

No cambios manuales no documentados.

---

# 34. Seed

Seed controlado para entorno de desarrollo.

No utilizar password.

---

# 35. Entregable Fase 3

```text
CHECKPOINT — MODELO POSTGRESQL IMPLEMENTADO
```

---

# 36. FASE 4 — Integración de identidad y autorización

## Objetivo

Permitir que un usuario autenticado en Hub entre a Facturación sin segundo login.

---

# 37. Regla de entrada

El sistema deberá recibir/reconocer de forma segura la identidad establecida previamente.

---

# 38. Flujo esperado

```text
Usuario autenticado en Hub
↓
clic Facturación
↓
Sistema de Facturación
↓
validar identidad existente
↓
extraer email autenticado
↓
buscar users.email
↓
verificar active
↓
obtener role + warehouse
↓
permitir acceso
```

---

# 39. No implementar autenticación paralela

Queda prohibido implementar como solución final:

```text
Login con Google dentro de Facturación
```

si el usuario ya inició sesión en Hub.

---

# 40. Usuario no registrado en Facturación

Aunque esté autenticado en Hub, si no existe en:

```text
users
```

de Facturación:

```text
403 USER_NOT_AUTHORIZED
```

---

# 41. Usuario inactivo

```text
active = false
```

→ acceso denegado.

---

# 42. Roles

Implementar:

```text
WAREHOUSE_USER
INVOICE_EXECUTOR
MANAGEMENT
ADMIN
```

según Matriz de Roles y Permisos.

---

# 43. Guards

La autorización debe centralizarse.

Ejemplo conceptual:

```text
requireAuthenticatedIdentity()
requireActiveUser()
requireRole()
requireOwnership()
requireAssignment()
```

---

# 44. Pruebas obligatorias

### Caso 1

Usuario inicia sesión en Hub y abre Facturación.

Resultado:

```text
ENTRA SIN SEGUNDO LOGIN
```

### Caso 2

Usuario autenticado pero no registrado.

Resultado:

```text
DENY
```

### Caso 3

Usuario inactivo.

Resultado:

```text
DENY
```

### Caso 4

Usuario manipula URL.

Resultado:

permisos respetados.

---

# 45. Entregable Fase 4

```text
CHECKPOINT — IDENTIDAD REUTILIZADA + RBAC
```

Debe demostrar expresamente:

```text
LOGIN EN HUB = 1
LOGIN EN FACTURACIÓN = 0
```

---

# 46. FASE 5 — Maestros básicos

Implementar:

- bodegas;
- usuarios internos;
- clientes;
- RUT;
- snapshots;
- administración básica.

---

# 47. Usuarios internos

ADMIN podrá:

- crear registro;
- asignar email;
- nombre;
- rol;
- bodega;
- active.

Esto NO crea una cuenta Google ni una cuenta Hub.

---

# 48. FASE 6 — Solicitudes

## Formulario

Optimizado para móvil y escritorio.

Campos:

```text
RUT
Razón social
Giro
Teléfono
Correo
Productos
Cantidad
Precio con IVA
Observaciones
```

---

# 49. Precios

El solicitante sólo ingresa:

```text
precio con IVA
```

No ve:

```text
neto
IVA calculado
```

---

# 50. Datos automáticos

```text
requested_by
```

desde identidad.

```text
warehouse_id
```

desde usuario cuando corresponda.

---

# 51. Duplicados

Ventana inicial:

```text
24 horas
```

con override auditado.

---

# 52. Entregable

```text
CHECKPOINT — FLUJO SOLICITANTE
```

---

# 53. FASE 7 — Cola de facturación

Implementar:

- PENDING;
- antigüedad;
- más antigua primero;
- claim;
- concurrencia;
- mesa de trabajo.

---

# 54. Claim

Atómico.

Dos ejecutores nunca pueden tomar la misma solicitud.

---

# 55. Entregable

```text
CHECKPOINT — COLA DE FACTURACIÓN
```

---

# 56. FASE 8 — Motor de cálculo y cuadratura

Regla:

```text
unitPriceNet =
ROUND_HALF_UP(unitPriceGross / 1.19)
```

con aritmética decimal exacta.

---

# 57. Cuadratura

```text
difference =
siiGrossTotal - expectedGrossTotal
```

Estados:

```text
MATCH
ROUNDING_ACCEPTED
MISMATCH
```

---

# 58. Tolerancia

```text
ABS(difference) <= 2
```

se acepta.

---

# 59. Tests obligatorios

```text
0
+1
-1
+2
-2
+3
-3
```

---

# 60. Entregable

```text
CHECKPOINT — MOTOR DE CUADRATURA
```

---

# 61. FASE 9 — Gestión documental

Implementar R2 privado.

Sólo:

```text
application/pdf
<= 2 MB
```

---

# 62. Upload

Implementar:

- upload intent;
- validación;
- storage key;
- confirmación server-side;
- acceso temporal.

---

# 63. URLs

Nunca URLs públicas permanentes.

---

# 64. Entregable

```text
CHECKPOINT — R2 DOCUMENTAL
```

---

# 65. FASE 10 — Finalización de factura

Precondiciones:

```text
IN_PROGRESS
ejecutor autorizado
cuadratura válida
PDF válido
```

---

# 66. Finalización

Transacción debe:

- crear invoice;
- guardar valores;
- asociar documento;
- completar solicitud;
- auditoría.

---

# 67. Idempotencia

Doble clic:

```text
1 factura
```

---

# 68. Mensaje

Generar mensaje y enlace WhatsApp.

---

# 69. Entregable

```text
CHECKPOINT — SOLICITUD → FACTURA COMPLETA
```

---

# 70. FASE 11 — Correcciones previas

Ejecutor:

```text
Hay un problema con los datos
```

→

```text
NEEDS_CORRECTION
```

Solicitante:

```text
corrige
↓
reenvía
↓
PENDING
```

Historial obligatorio.

---

# 71. Entregable

```text
CHECKPOINT — CORRECCIONES PRE-FACTURA
```

---

# 72. FASE 12 — Rectificaciones

Factura completada:

```text
Solicitar cambio
```

---

# 73. Flujo

```text
REQUESTED
↓
IN_PROGRESS
↓
Nota de Crédito PDF
↓
Factura original anulada
↓
Nueva factura
↓
COMPLETED
```

---

# 74. V1

No requiere:

- folio;
- XML;
- Nota de Crédito parcial.

---

# 75. Inmutabilidad

Factura original nunca se elimina.

---

# 76. Entregable

```text
CHECKPOINT — RECTIFICACIONES
```

---

# 77. FASE 13 — Estadísticas

Implementar:

- total vigente;
- neto estimado;
- IVA débito estimado;
- cantidad de facturas;
- ticket promedio;
- pendientes;
- en proceso;
- por bodega.

---

# 78. Fecha estadística

Usar:

```text
invoice.issued_at
```

---

# 79. Factura anulada

No suma a vigente.

---

# 80. Entregable

```text
CHECKPOINT — ESTADÍSTICAS VALIDADAS
```

---

# 81. FASE 14 — Administración

ADMIN:

- usuarios;
- roles;
- bodegas;
- reasignaciones;
- auditoría.

Jefatura:

```text
READ ONLY
```

---

# 82. Entregable

```text
CHECKPOINT — ADMINISTRACIÓN
```

---

# 83. FASE 15 — Migración histórica

Proceso:

```text
Extract
↓
Normalize
↓
Validate
↓
Dry Run
↓
Approve
↓
Import
↓
Verify
```

---

# 84. Google Sheets

Marcar origen:

```text
GOOGLE_SHEETS_LEGACY
```

---

# 85. Google Drive

Los documentos históricos pueden conservar URLs existentes.

No migración obligatoria a R2.

---

# 86. Entregable

```text
CHECKPOINT — MIGRACIÓN DRY RUN
```

La importación definitiva requiere autorización.

---

# 87. FASE 16 — QA integral

Probar flujos completos:

### Solicitante

```text
crear
duplicado
consultar
corregir
ver factura
solicitar cambio
```

### Ejecutor

```text
cola
claim
copiar
SII
cuadrar
PDF
finalizar
siguiente
```

### Rectificación

Completa.

---

# 88. Prueba crítica de autenticación

QA deberá comenzar con:

```text
1. Abrir Hub
2. Autenticarse Google
3. Abrir Facturación
4. Confirmar que NO aparece segundo login
5. Confirmar rol correcto
```

Esta prueba es obligatoria.

---

# 89. Entregable

```text
CHECKPOINT — QA FUNCIONAL
```

---

# 90. FASE 17 — Security Gate

Ejecutar:

- Auth;
- identidad compartida/reconocida;
- RBAC;
- IDOR;
- XSS;
- CSRF;
- SQL injection;
- uploads;
- mass assignment;
- rate limiting;
- secrets;
- headers;
- dependencias;
- R2;
- concurrencia;
- idempotencia.

---

# 91. Resultado

```text
SECURITY GATE — PASS
```

o:

```text
SECURITY GATE — FAIL
```

FAIL bloquea producción.

---

# 92. FASE 18 — Preparación de producción

Verificar:

- variables;
- Neon;
- migraciones;
- usuarios reales;
- R2 privado;
- backups;
- restauración;
- smoke tests.

---

# 93. Hub

Todavía NO modificar.

---

# 94. Entregable

```text
CHECKPOINT — PRODUCTION READY
```

---

# 95. FASE 19 — Puesta en marcha

Antigravity entregará:

```text
URL principal
URL solicitudes
URL gestión
URL estadísticas/admin
```

---

# 96. Cambio de Hub

El responsable del proyecto realizará manualmente el cambio de enlaces.

Antigravity no lo hará salvo autorización expresa independiente.

---

# 97. Flujo de producción final

```text
Usuario
↓
Hub Maxiofertas
↓
Google OAuth existente
↓
clic Facturación
↓
Sistema Facturación
↓
sin segundo login
↓
rol correspondiente
```

---

# 98. Google Forms / Sheets

Mantener temporalmente como contingencia.

---

# 99. FASE 20 — Estabilización

Priorizar:

1. seguridad;
2. integridad;
3. facturación;
4. documentos;
5. estadísticas;
6. UX secundaria.

No introducir nuevas funcionalidades.

---

# 100. Criterios globales de aceptación

## CA-001

El solicitante puede solicitar desde móvil o computador.

## CA-002

Sólo ingresa precios con IVA.

## CA-003

El neto se calcula automáticamente.

## CA-004

Se detectan duplicados.

## CA-005

La cola se ordena por antigüedad.

## CA-006

Sólo un ejecutor puede tomar una solicitud.

## CA-007

Solicitudes incorrectas pueden devolverse.

## CA-008

El solicitante puede corregir y reenviar.

## CA-009

Diferencia exacta:

```text
MATCH
```

## CA-010

±1 / ±2:

```text
ROUNDING_ACCEPTED
```

## CA-011

>±2:

```text
MISMATCH
```

## CA-012

PDF almacenado en R2 privado.

## CA-013

Factura completada es inmutable.

## CA-014

Se genera mensaje WhatsApp.

## CA-015

Factura realizada puede solicitar rectificación.

## CA-016

Rectificación conserva factura original.

## CA-017

Nota de Crédito queda asociada.

## CA-018

Nueva factura queda independiente.

## CA-019

Factura anulada no suma como vigente.

## CA-020

Jefatura ve estadísticas.

## CA-021

Jefatura no modifica solicitudes.

## CA-022

Solicitante no accede a solicitudes ajenas.

## CA-023

ADMIN gestiona usuarios.

## CA-024

Auditoría registra acciones críticas.

## CA-025

Hub no se modifica.

## CA-026

No existe folio obligatorio.

## CA-027

No existe XML/DTE en V1.

## CA-028

Security Gate:

```text
PASS
```

## CA-029 — Autenticación única

El usuario deberá iniciar sesión una sola vez:

```text
Hub → Google OAuth → Facturación
```

Al abrir Facturación:

```text
NO debe aparecer una segunda pantalla de login.
```

## CA-030 — Autorización interna

Aunque no exista segundo login, Facturación deberá comprobar:

- identidad;
- usuario registrado;
- activo;
- rol;
- bodega;
- propiedad/asignación según acción.

---

# 101. Definition of Done general

Una fase requiere:

```text
Código
+
Migración
+
Validación
+
Pruebas
+
Seguridad
+
Evidencia
+
Checkpoint
```

cuando aplique.

---

# 102. Evidencias de checkpoint

Antigravity deberá informar:

- qué implementó;
- archivos modificados;
- migraciones;
- pruebas ejecutadas;
- resultados;
- riesgos;
- pendientes.

---

# 103. Regla de avance

No saltar fases sin explicación y autorización.

---

# 104. Fuera de alcance V1

No implementar:

- integración directa SII;
- XML/DTE;
- folio obligatorio;
- WhatsApp API;
- ERP;
- inventario;
- notas de crédito parciales;
- aplicación móvil nativa;
- nuevo Hub;
- modificación Hub;
- segundo login para Facturación.

---

# 105. Nueva dependencia

Si Antigravity considera necesario:

- Redis;
- otra DB;
- nueva plataforma;
- servicio pago;
- nueva auth;

deberá detenerse:

```text
BLOCKED — ARCHITECTURE DECISION REQUIRED
```

---

# 106. Regla de autenticación no negociable

Antigravity no podrá resolver una dificultad de integración diciendo:

> “Entonces hacemos login nuevamente en Facturación.”

Eso constituye un cambio funcional y arquitectónico.

Debe reportar bloqueo.

---

# 107. Rollback operacional

Si producción presenta problema grave:

```text
Responsable del proyecto
↓
restaura enlaces anteriores del Hub
↓
Google Forms / Sheets
```

hasta resolver.

---

# 108. Severidades

## P0

Seguridad / pérdida de datos / sistema crítico caído.

Rollback.

## P1

No se puede solicitar o facturar.

Corrección inmediata/rollback.

## P2

Problema secundario.

## P3

Visual/mejora.

---

# 109. Datos no negociables

Nunca perder:

- solicitudes;
- factura original;
- Nota de Crédito;
- nueva factura;
- auditoría.

---

# 110. Prioridad ante incidentes

```text
1 Seguridad
2 Integridad
3 Facturación
4 Documentos
5 Estadísticas
6 UX secundaria
```

---

# 111. Entrega final

Antigravity deberá entregar:

```text
Código
Migraciones
Tests
README
.env.example
Documentación deployment
URL producción
URLs funcionales
Procedimiento backup
Procedimiento restore
Reporte QA
Reporte Security Gate
Reporte migración
```

---

# 112. Checkpoint final

```text
CHECKPOINT — RELEASE CANDIDATE
```

Debe incluir estado de todas las fases.

---

# 113. Resultado permitido

Sólo:

```text
READY FOR PRODUCTION
```

cuando:

```text
QA = PASS
SECURITY = PASS
AUTH SINGLE LOGIN = PASS
MIGRATION = VERIFIED
BACKUP = VERIFIED
RESTORE = VERIFIED
```

---

# 114. Aprobación humana

Antigravity no deberá activar producción definitiva sin autorización del responsable.

Autorización conceptual:

```text
AUTORIZADO — PASAR A PRODUCCIÓN
```

---

# 115. Post-deployment

Entregar:

```text
POST-DEPLOYMENT REPORT
```

con:

- deployment;
- health;
- migraciones;
- autenticación;
- pruebas;
- incidencias;
- URLs;
- estado.

---

# 116. Regla maestra para Antigravity

```text
NO IMPROVISAR.
NO MODIFICAR HUB.
NO CREAR SEGUNDO LOGIN.
NO AMPLIAR ALCANCE.
NO SALTAR CHECKPOINTS.
NO SACRIFICAR SEGURIDAD.
NO ALTERAR HISTORIAL.
```

Ante duda:

```text
BLOCKED — DECISION REQUIRED
```

---

# 117. Dictamen

**Estado:** APROBADO PARA IMPLEMENTACIÓN CONTROLADA

Esta versión corrige expresamente la interpretación de autenticación y establece como requisito obligatorio que el usuario acceda desde Hub Maxiofertas al Sistema de Gestión de Facturas **sin autenticarse nuevamente**.

---

# 118. Estado final

**Versión:** 1.1

- [x] APROBADO PARA IMPLEMENTACIÓN CONTROLADA
- [ ] APROBADO CON OBSERVACIONES
- [ ] REQUIERE MODIFICACIONES
- [ ] RECHAZADO

**Responsable funcional:** Ángel Ferrer

**Fecha de aprobación:** __________________

**Observaciones:**  
____________________________________________________________________

**Riesgos aceptados:**  
____________________________________________________________________