# Matriz de Roles y Permisos v1.0
## Sistema de Gestión de Facturas Maxiofertas

**Proyecto:** Sistema de Gestión de Facturas Maxiofertas  
**Tipo de documento:** Matriz de Roles y Permisos  
**Versión:** 1.0  
**Estado:** Propuesta para revisión y aprobación  
**Fecha:** 19 de agosto de 2026  
**Responsable funcional:** Ángel Ferrer  
**Rol responsable del documento:** Business Analyst / Arquitecto de Seguridad Funcional  
**Implementación prevista:** Antigravity  
**Organización:** Maxiofertas  

---

# 1. Propósito

Este documento define qué puede ver y qué puede hacer cada rol dentro del Sistema de Gestión de Facturas Maxiofertas.

Su objetivo es evitar:

- acceso excesivo;
- edición indebida;
- cambios de estado no autorizados;
- exposición de información innecesaria;
- interpretación libre de permisos por parte de la implementación.

Toda autorización deberá aplicarse en:

1. interfaz;
2. API;
3. lógica server-side.

Ocultar un botón no constituye una medida de seguridad suficiente.

---

# 2. Roles oficiales

Se definen cuatro roles:

```text
WAREHOUSE_USER
INVOICE_EXECUTOR
MANAGEMENT
ADMIN
```

Textos funcionales:

| Rol técnico | Nombre funcional |
|---|---|
| WAREHOUSE_USER | Solicitante / Bodega |
| INVOICE_EXECUTOR | Ejecutor de Facturación |
| MANAGEMENT | Jefatura / Gerencia |
| ADMIN | Administrador |

No deberán crearse roles adicionales sin aprobación.

---

# 3. Principio de mínimo privilegio

Cada rol deberá recibir únicamente los permisos necesarios para cumplir su función.

La regla general será:

> Si una acción no está expresamente permitida, se considera denegada.

---

# 4. Solicitante / Bodega — WAREHOUSE_USER

Su función es:

- solicitar facturas;
- revisar sus solicitudes;
- corregir solicitudes devueltas;
- consultar facturas realizadas;
- solicitar corrección de facturas ya emitidas.

No debe gestionar el trabajo interno de los ejecutores.

---

# 5. Ejecutor de Facturación — INVOICE_EXECUTOR

Su función es:

- revisar cola de trabajo;
- tomar solicitudes;
- procesarlas;
- solicitar correcciones;
- ingresar datos para cuadratura;
- subir documentos;
- completar facturas;
- procesar rectificaciones.

No administra usuarios ni configuración general.

---

# 6. Jefatura / Gerencia — MANAGEMENT

Su función principal es:

- supervisar;
- consultar operación;
- revisar estadísticas;
- analizar resultados.

Es esencialmente un rol de lectura.

No deberá modificar solicitudes ni facturas durante el flujo normal.

---

# 7. Administrador — ADMIN

Es el rol con mayores privilegios.

Puede:

- gestionar usuarios;
- gestionar bodegas;
- revisar toda la operación;
- reasignar;
- intervenir casos excepcionales;
- consultar auditoría.

El rol ADMIN no debe utilizarse como reemplazo habitual del rol ejecutor si no es necesario.

---

# 8. Matriz general

Leyenda:

```text
✓ Permitido
R Permitido sólo lectura
P Permitido bajo condición
— No permitido
```

| Función | Bodega | Ejecutor | Jefatura | Admin |
|---|---:|---:|---:|---:|
| Entrar al sistema | ✓ | ✓ | ✓ | ✓ |
| Ver perfil propio | ✓ | ✓ | ✓ | ✓ |
| Crear solicitud | ✓ | — | — | ✓ |
| Ver solicitudes propias | ✓ | — | — | ✓ |
| Ver todas las solicitudes | — | ✓ | ✓ | ✓ |
| Tomar solicitud | — | ✓ | — | ✓ |
| Reasignar solicitud | — | — | — | ✓ |
| Corregir solicitud antes de facturar | P | — | — | ✓ |
| Solicitar corrección a bodega | — | ✓ | — | ✓ |
| Cancelar solicitud | P | — | — | ✓ |
| Marcar duplicada | — | P | — | ✓ |
| Ingresar total SII | — | ✓ | — | ✓ |
| Subir factura PDF | — | ✓ | — | ✓ |
| Finalizar factura | — | ✓ | — | ✓ |
| Ver factura realizada | ✓ | ✓ | ✓ | ✓ |
| Solicitar cambio posterior | ✓ | — | — | ✓ |
| Tomar rectificación | — | ✓ | — | ✓ |
| Registrar Nota de Crédito | — | ✓ | — | ✓ |
| Subir Nota de Crédito | — | ✓ | — | ✓ |
| Generar factura corregida | — | ✓ | — | ✓ |
| Finalizar rectificación | — | ✓ | — | ✓ |
| Ver estadísticas | — | P | ✓ | ✓ |
| Ver auditoría | — | — | R/P | ✓ |
| Gestionar usuarios | — | — | — | ✓ |
| Gestionar bodegas | — | — | — | ✓ |
| Activar/desactivar usuarios | — | — | — | ✓ |

---

# 9. Permisos sobre solicitudes

## 9.1 Crear

### WAREHOUSE_USER

Permitido.

Sólo podrá crear solicitudes:

- a nombre propio;
- para una bodega autorizada.

No podrá enviar:

```text
requested_by
```

arbitrariamente.

El servidor obtiene este valor desde la sesión.

### ADMIN

Permitido para casos administrativos.

---

# 10. Bodega de la solicitud

Un `WAREHOUSE_USER` asociado a una única bodega:

no podrá seleccionar otra.

El servidor deberá ignorar o rechazar un `warehouseId` no autorizado.

---

# 11. Visualización de solicitudes — solicitante

El solicitante podrá ver:

- las solicitudes creadas por él;
- o las autorizadas por política de bodega si posteriormente se aprueba.

Para V1 se utilizará como criterio predeterminado:

> propias del usuario.

No deberá ver solicitudes de otros usuarios por defecto.

---

# 12. Datos visibles al solicitante

Puede ver:

- número;
- cliente;
- productos;
- total IVA incluido;
- estado;
- correcciones;
- documento final;
- historial funcional simple.

No necesita ver:

- netos para SII;
- asignaciones internas;
- auditoría técnica;
- diferencia de cuadratura interna;
- metadata R2.

---

# 13. Edición de solicitud pendiente

Una solicitud:

```text
PENDING
```

no deberá considerarse libremente editable de forma indefinida.

Para V1 la edición principal por el solicitante ocurrirá cuando:

```text
NEEDS_CORRECTION
```

El flujo normal es:

```text
Ejecutor solicita corrección
↓
Solicitante corrige
↓
Reenvía
```

---

# 14. Solicitud en proceso

Cuando:

```text
IN_PROGRESS
```

el solicitante:

- puede verla;
- no puede editarla;
- no puede reasignarla;
- no puede cambiar estado.

---

# 15. Solicitud completada

Cuando:

```text
COMPLETED
```

el solicitante:

- puede verla;
- puede abrir factura;
- puede solicitar un cambio;
- no puede modificar los datos originales.

---

# 16. Solicitud cancelada

El solicitante podrá verla en historial.

No podrá reactivarla directamente.

---

# 17. Cancelación por solicitante

Para V1 se recomienda permitir cancelar únicamente si:

```text
status = PENDING
```

y todavía no ha sido tomada.

Debe solicitar confirmación.

Una vez:

```text
IN_PROGRESS
```

la cancelación deberá gestionarse por administrador o proceso interno.

---

# 18. Solicitudes duplicadas

El solicitante puede:

- recibir advertencia;
- continuar bajo confirmación.

No puede marcar arbitrariamente solicitudes históricas como duplicadas.

---

# 19. Permisos de ejecutor sobre solicitudes

El ejecutor puede consultar:

- pendientes;
- en proceso;
- necesitan corrección;
- realizadas;
- rectificaciones.

---

# 20. Cola de trabajo

`INVOICE_EXECUTOR` puede ver solicitudes de todas las bodegas que el sistema determine operativamente.

En V1 se asume cola general salvo futura restricción.

---

# 21. Tomar solicitud

Permitido para:

```text
INVOICE_EXECUTOR
ADMIN
```

Sólo cuando:

```text
status = PENDING
assigned_to IS NULL
```

---

# 22. Solicitud tomada por otro

El ejecutor puede verla como ocupada.

No puede quitarla al otro ejecutor.

Sólo ADMIN puede reasignar.

---

# 23. Editar datos del solicitante

El ejecutor no deberá corregir directamente información de bodega durante el flujo normal.

Si detecta error debe utilizar:

**Solicitar corrección**

Esto mantiene responsabilidad clara.

---

# 24. Solicitar corrección

Permitido para:

```text
INVOICE_EXECUTOR asignado
ADMIN
```

Debe registrar:

- motivo;
- comentario cuando corresponda.

---

# 25. Total SII

Sólo:

```text
INVOICE_EXECUTOR asignado
ADMIN
```

pueden registrar:

```text
siiGrossTotal
```

---

# 26. Precio neto

Visible para:

```text
INVOICE_EXECUTOR
ADMIN
```

No para:

```text
WAREHOUSE_USER
```

Jefatura puede verlo en detalle si se considera necesario, pero no es dato principal.

---

# 27. PDF de factura

Sólo podrá subirlo:

```text
INVOICE_EXECUTOR asignado
ADMIN
```

---

# 28. Finalización

Sólo podrá finalizar:

```text
INVOICE_EXECUTOR asignado
ADMIN
```

y únicamente cuando las precondiciones técnicas se cumplan.

---

# 29. Reemplazo de PDF previo a cierre

Mientras la factura todavía no esté finalizada, el ejecutor asignado podrá reemplazar un archivo cargado incorrectamente.

---

# 30. Reemplazo después de cierre

No permitido.

Una factura realizada se corrige mediante rectificación.

---

# 31. Jefatura — solicitudes

`MANAGEMENT` tendrá acceso de lectura a:

- todas las solicitudes;
- estados;
- ejecutores;
- tiempos;
- bodegas;
- clientes;
- documentos finales cuando corresponda.

---

# 32. Jefatura — edición

No podrá:

- tomar;
- editar;
- cancelar;
- completar;
- reasignar;
- registrar Nota de Crédito;
- cambiar estados.

Su función es supervisión.

---

# 33. Jefatura — estadísticas

Permitido.

Podrá consultar:

- total facturado;
- neto;
- IVA débito estimado;
- número de facturas;
- ticket promedio;
- facturación por bodega;
- evolución;
- operación pendiente.

---

# 34. Jefatura — móvil

La interfaz móvil deberá priorizar estadísticas y resumen.

Los permisos son los mismos que en escritorio.

El dispositivo no modifica autorización.

---

# 35. Auditoría para jefatura

Se recomienda que `MANAGEMENT` pueda consultar una auditoría funcional limitada cuando resulte necesaria para supervisión.

Ejemplo:

- quién hizo la factura;
- cuándo;
- cuándo se corrigió.

No deberá tener acceso por defecto a:

- logs técnicos;
- secretos;
- metadata sensible interna.

---

# 36. Administración

ADMIN puede consultar todas las solicitudes independientemente del estado.

---

# 37. Reasignación

Sólo:

```text
ADMIN
```

Puede cambiar:

```text
assigned_to
```

Debe indicar motivo.

Auditoría obligatoria.

---

# 38. Cambios de estado manuales

ADMIN no deberá tener una caja genérica tipo:

```text
Cambiar estado a cualquier cosa
```

Los estados deberán cambiar mediante acciones de dominio.

Incluso ADMIN deberá respetar transiciones controladas.

---

# 39. Override administrativo

Si se implementa una excepción:

```text
ADMIN_OVERRIDE
```

deberá requerir:

- motivo obligatorio;
- auditoría;
- confirmación.

No deberá utilizarse como flujo normal.

---

# 40. Usuarios

Sólo ADMIN podrá:

- crear;
- modificar;
- activar;
- desactivar;
- cambiar rol;
- cambiar bodega.

---

# 41. Usuario no se elimina

ADMIN deshabilita:

```text
active = false
```

No borra normalmente.

---

# 42. Auto-registro

Ningún rol puede crear su propia cuenta.

No existe registro público.

---

# 43. Cambiar su propio rol

Ningún usuario puede modificar su propio rol desde la interfaz normal.

Sólo ADMIN puede modificar roles.

---

# 44. Protección del último administrador

Se recomienda impedir que el sistema quede sin ningún ADMIN activo.

Si se intenta desactivar al último:

```text
409
LAST_ADMIN_PROTECTED
```

---

# 45. Gestión de bodegas

Sólo ADMIN podrá:

- crear;
- editar nombre/código;
- activar;
- desactivar.

---

# 46. Eliminación de bodega

No disponible como operación normal.

---

# 47. Clientes — creación

Un cliente podrá crearse implícitamente durante una solicitud.

Roles que pueden causar esta creación:

```text
WAREHOUSE_USER
ADMIN
```

mediante flujo normal.

---

# 48. Clientes — consulta

### WAREHOUSE_USER

Puede buscar por RUT durante la creación.

### INVOICE_EXECUTOR

Puede consultar clientes relacionados con solicitudes.

### MANAGEMENT

Lectura.

### ADMIN

Lectura/administración cuando se habilite.

---

# 49. Cliente maestro — edición

El solicitante puede proponer datos actualizados durante la creación/corrección.

El servidor podrá actualizar el registro maestro siguiendo la regla técnica aprobada.

Las facturas históricas no cambian.

---

# 50. Rectificación — quién solicita

Permitido:

```text
WAREHOUSE_USER
ADMIN
```

sobre una factura válida relacionada.

---

# 51. Rectificación de factura ajena

Un WAREHOUSE_USER no podrá solicitar cambio sobre una factura que no corresponda a una solicitud autorizada para él.

---

# 52. Rectificación — consulta

### WAREHOUSE_USER

Puede ver sus propias rectificaciones.

### INVOICE_EXECUTOR

Puede ver cola general.

### MANAGEMENT

Puede ver todas en lectura.

### ADMIN

Puede ver todas.

---

# 53. Tomar rectificación

Permitido:

```text
INVOICE_EXECUTOR
ADMIN
```

con control de concurrencia.

---

# 54. Nota de Crédito

Sólo puede registrar:

```text
INVOICE_EXECUTOR asignado
ADMIN
```

---

# 55. Documento de Nota de Crédito

Sólo:

```text
INVOICE_EXECUTOR asignado
ADMIN
```

puede subirlo.

---

# 56. Nueva factura rectificada

Sólo:

```text
INVOICE_EXECUTOR asignado
ADMIN
```

puede procesarla.

---

# 57. Rectificación — solicitante

El solicitante no necesita conocer el detalle operativo tributario.

Visualmente verá:

```text
Cambio solicitado
Corrigiendo factura
Factura corregida
```

No tendrá controles para registrar Nota de Crédito.

---

# 58. Rectificación — jefatura

Sólo lectura.

Puede ver:

- original;
- motivo;
- Nota de Crédito registrada;
- nueva factura;
- ejecutor;
- fechas.

---

# 59. Documentos

Los documentos deberán respetar permisos de la entidad a la que pertenecen.

No basta con conocer el `documentId`.

---

# 60. Lectura de factura PDF

Permitida para:

### WAREHOUSE_USER

Si corresponde a una solicitud propia/autorizada.

### INVOICE_EXECUTOR

Si tiene acceso operativo a la solicitud.

### MANAGEMENT

Sí.

### ADMIN

Sí.

---

# 61. Lectura Nota de Crédito

Para solicitante puede mostrarse sólo cuando sea útil.

Roles internos:

```text
INVOICE_EXECUTOR
MANAGEMENT
ADMIN
```

pueden verla según relación.

---

# 62. URL firmada

La API sólo generará URL si el usuario tiene permiso sobre el documento.

---

# 63. Auditoría

### WAREHOUSE_USER

No acceso a auditoría técnica.

Puede ver timeline funcional de su solicitud.

### INVOICE_EXECUTOR

Puede ver historial operacional relacionado.

### MANAGEMENT

Lectura funcional limitada.

### ADMIN

Acceso completo a auditoría de negocio.

---

# 64. Estadísticas

Matriz:

| Estadística | Bodega | Ejecutor | Jefatura | Admin |
|---|---:|---:|---:|---:|
| Total facturado global | — | — | ✓ | ✓ |
| IVA débito estimado global | — | — | ✓ | ✓ |
| Por bodega | — | — | ✓ | ✓ |
| Evolución mensual | — | — | ✓ | ✓ |
| Pendientes actuales | P | ✓ | ✓ | ✓ |
| Realizadas hoy | P | ✓ | ✓ | ✓ |
| Desempeño ejecutores | — | P | ✓ | ✓ |

`P` implica únicamente información operacional necesaria.

---

# 65. Estadísticas para bodega

En V1 el solicitante no requiere módulo financiero.

Puede ver contadores simples de:

```text
Pendientes
Necesitan corrección
Realizadas
```

No necesita ver facturación global.

---

# 66. Estadísticas para ejecutor

Puede ver indicadores operacionales como:

```text
Pendientes
En proceso
Realizadas hoy
```

No necesita necesariamente ver cifras financieras globales.

---

# 67. Datos de otras bodegas

WAREHOUSE_USER:

```text
DENY
```

salvo futura política explícita.

---

# 68. API `/me`

Todos los roles autenticados:

```text
ALLOW
```

---

# 69. API de solicitudes

## `POST /invoice-requests`

```text
WAREHOUSE_USER = ALLOW
INVOICE_EXECUTOR = DENY
MANAGEMENT = DENY
ADMIN = ALLOW
```

---

# 70. API cola general

## `GET /invoice-requests`

```text
WAREHOUSE_USER = DENY
INVOICE_EXECUTOR = ALLOW
MANAGEMENT = ALLOW READ ONLY
ADMIN = ALLOW
```

---

# 71. API propias

## `GET /invoice-requests/mine`

```text
WAREHOUSE_USER = ALLOW
INVOICE_EXECUTOR = DENY
MANAGEMENT = DENY
ADMIN = ALLOW cuando necesario
```

---

# 72. API claim

```text
WAREHOUSE_USER = DENY
INVOICE_EXECUTOR = ALLOW
MANAGEMENT = DENY
ADMIN = ALLOW
```

---

# 73. API reassign

```text
ADMIN ONLY
```

---

# 74. API correction request

```text
INVOICE_EXECUTOR asignado
ADMIN
```

---

# 75. API correction submit

```text
WAREHOUSE_USER propietario
ADMIN
```

---

# 76. API reconcile

```text
INVOICE_EXECUTOR asignado
ADMIN
```

---

# 77. API complete invoice

```text
INVOICE_EXECUTOR asignado
ADMIN
```

---

# 78. API rectification create

```text
WAREHOUSE_USER relacionado
ADMIN
```

---

# 79. API rectification claim

```text
INVOICE_EXECUTOR
ADMIN
```

---

# 80. API credit note

```text
INVOICE_EXECUTOR asignado
ADMIN
```

---

# 81. API rectification complete

```text
INVOICE_EXECUTOR asignado
ADMIN
```

---

# 82. API statistics

```text
MANAGEMENT
ADMIN
```

Podrán existir endpoints operativos de contador para ejecutores sin dar acceso al módulo financiero.

---

# 83. API admin users

```text
ADMIN ONLY
```

---

# 84. Matriz de estados — solicitante

| Estado | Ver | Editar | Cancelar | Solicitar cambio |
|---|---:|---:|---:|---:|
| PENDING | ✓ | — | P | — |
| IN_PROGRESS | ✓ | — | — | — |
| NEEDS_CORRECTION | ✓ | ✓ | P | — |
| COMPLETED | ✓ | — | — | ✓ |
| CANCELLED | ✓ | — | — | — |
| DUPLICATE | ✓ | — | — | — |

---

# 85. Matriz de estados — ejecutor

| Estado | Ver | Tomar | Procesar | Solicitar corrección | Completar |
|---|---:|---:|---:|---:|---:|
| PENDING | ✓ | ✓ | — | — | — |
| IN_PROGRESS propia | ✓ | — | ✓ | ✓ | ✓ |
| IN_PROGRESS ajena | ✓ | — | — | — | — |
| NEEDS_CORRECTION | ✓ | — | — | — | — |
| COMPLETED | ✓ | — | — | — | — |
| CANCELLED | ✓ | — | — | — | — |
| DUPLICATE | ✓ | — | — | — | — |

---

# 86. Matriz rectificación — solicitante

| Estado | Ver | Editar | Cancelar |
|---|---:|---:|---:|
| REQUESTED | ✓ | — | P |
| IN_PROGRESS | ✓ | — | — |
| CREDIT_NOTE_REGISTERED | ✓ | — | — |
| NEW_INVOICE_PENDING | ✓ | — | — |
| COMPLETED | ✓ | — | — |
| CANCELLED | ✓ | — | — |

---

# 87. Matriz rectificación — ejecutor

| Estado | Tomar | Registrar NC | Nueva factura | Finalizar |
|---|---:|---:|---:|---:|
| REQUESTED | ✓ | — | — | — |
| IN_PROGRESS propia | — | ✓ | — | — |
| CREDIT_NOTE_REGISTERED | — | — | ✓ | — |
| NEW_INVOICE_PENDING | — | — | ✓ | ✓ |
| COMPLETED | — | — | — | — |

---

# 88. Propiedad de solicitudes

La lógica de propiedad deberá usar:

```text
requested_by
```

y/o regla de bodega aprobada.

Para V1 se adopta:

> El solicitante gestiona principalmente sus propias solicitudes.

---

# 89. Cambio futuro a visibilidad por bodega

Si se decide que todos los solicitantes de una bodega puedan ver todas las solicitudes de su bodega:

esto será una nueva decisión de permisos.

No deberá asumirse ahora.

---

# 90. Campos server-managed

El navegador nunca deberá controlar directamente:

```text
requested_by
assigned_to
status
completed_at
created_at
reconciliation_status
duplicate_warning
```

Estos campos pertenecen al servidor.

---

# 91. Campos prohibidos en request de bodega

Un solicitante no podrá enviar para ser aceptado:

```json
{
  "status": "COMPLETED",
  "assignedTo": "...",
  "requestedBy": "...",
  "unitPriceNet": 1000
}
```

El servidor debe ignorar/rechazar.

---

# 92. Validación horizontal

La aplicación deberá proteger contra:

> cambiar el UUID en la URL para ver una solicitud de otra persona.

Todos los endpoints deberán validar relación con entidad.

---

# 93. Protección IDOR

Casos obligatorios de prueba:

```text
WAREHOUSE_USER A
intenta GET
solicitud de WAREHOUSE_USER B
```

Resultado:

```text
403 o 404
```

según política técnica.

Nunca datos.

---

# 94. Autorización por rol + contexto

No basta con:

```text
role = INVOICE_EXECUTOR
```

Para acciones sobre una solicitud en proceso también deberá comprobarse:

```text
assigned_to = currentUser.id
```

salvo ADMIN.

---

# 95. Ejecutor sobre solicitud ajena

Puede consultar datos básicos si está dentro de la cola operativa.

No puede modificarla.

---

# 96. Seguridad de estadísticas

WAREHOUSE_USER no deberá poder llamar directamente endpoints globales de estadísticas.

---

# 97. Seguridad administrativa

`/admin/*` deberá comprobar rol server-side en cada acción.

---

# 98. Interfaz

El frontend deberá mostrar sólo las acciones permitidas.

Pero ésta será una mejora UX, no el control de seguridad principal.

---

# 99. Página no autorizada

Mensaje:

> No tienes permiso para realizar esta acción.

Evitar mostrar detalles de implementación.

---

# 100. Cambios de permisos

Toda modificación de:

- rol;
- bodega;
- active;

debe quedar auditada.

---

# 101. Cambio de rol

Sólo ADMIN.

Registrar:

```text
old_role
new_role
actor
timestamp
```

---

# 102. Desactivación

Un usuario inactivo:

- conserva historial;
- deja de poder autenticarse en la aplicación;
- sigue apareciendo como autor de operaciones anteriores.

---

# 103. Sesiones existentes

Cuando un usuario sea deshabilitado, cada request server-side deberá comprobar `active`.

No deberá depender sólo de que expire una sesión antigua.

---

# 104. Principio sobre ADMIN

ADMIN puede intervenir, pero el sistema deberá seguir reglas de dominio.

No equivale a:

> saltarse cualquier constraint.

---

# 105. Regla de no escalamiento

Un usuario no puede concederse privilegios a sí mismo.

---

# 106. Permisos sobre Hub Maxiofertas

**Ningún rol de este sistema tiene permisos sobre el Hub Maxiofertas.**

El Hub está fuera de alcance.

No deberán existir acciones como:

```text
EDIT_HUB
MANAGE_HUB
SYNC_HUB_USERS
```

---

# 107. Permisos sobre SII

El sistema no administra credenciales SII.

Los ejecutores utilizan SII externamente.

No se modelan permisos tributarios de SII dentro de esta aplicación.

---

# 108. Permisos sobre R2

Ningún usuario final recibe credenciales R2.

El acceso se realiza a través del backend.

---

# 109. Resumen RBAC

```text
WAREHOUSE_USER
→ solicita y consulta lo propio

INVOICE_EXECUTOR
→ procesa trabajo asignado

MANAGEMENT
→ observa y analiza

ADMIN
→ administra e interviene
```

---

# 110. Regla de implementación

Cada endpoint deberá declarar explícitamente:

```text
roles allowed
context checks
state checks
```

Ejemplo:

```text
completeInvoice()

role:
INVOICE_EXECUTOR | ADMIN

context:
assignedTo == currentUser
OR role == ADMIN

state:
IN_PROGRESS
```

---

# 111. Pruebas obligatorias de permisos

Para cada endpoint:

1. usuario permitido;
2. usuario de rol prohibido;
3. usuario inactivo;
4. usuario inexistente;
5. usuario permitido pero entidad ajena;
6. estado inválido.

---

# 112. Casos críticos QA

## QA-RBAC-001

Bodega intenta ver solicitud de otra bodega/usuario.

**Resultado:** DENY.

## QA-RBAC-002

Ejecutor intenta completar factura asignada a otro.

**Resultado:** DENY.

## QA-RBAC-003

Jefatura intenta editar solicitud.

**Resultado:** DENY.

## QA-RBAC-004

Solicitante intenta modificar factura completada.

**Resultado:** DENY.

## QA-RBAC-005

Admin reasigna solicitud.

**Resultado:** ALLOW + AUDIT.

## QA-RBAC-006

Usuario deshabilitado conserva sesión vieja e intenta acción.

**Resultado:** DENY.

---

# 113. Códigos sugeridos

```text
FORBIDDEN
ENTITY_NOT_OWNED
REQUEST_NOT_ASSIGNED_TO_USER
ROLE_NOT_ALLOWED
USER_DISABLED
INVALID_STATE_TRANSITION
```

---

# 114. No mostrar diferencias de seguridad

Para accesos horizontales puede utilizarse:

```text
404
```

en vez de revelar que la entidad existe.

La decisión concreta deberá ser uniforme.

---

# 115. Política recomendada

Para recursos ajenos de `WAREHOUSE_USER`:

```text
404 Not Found
```

Para acción conocida pero rol insuficiente:

```text
403 Forbidden
```

---

# 116. Roles no acumulativos

Para V1, cada usuario tendrá un rol principal.

No se implementará inicialmente:

```text
usuario con múltiples roles
```

salvo nueva decisión.

---

# 117. Excepción ADMIN

ADMIN incorpora permisos administrativos y supervisión.

No requiere además tener `MANAGEMENT`.

---

# 118. Ejecutor y bodega

En V1 no se restringen ejecutores por bodega.

Todos los ejecutores podrán operar la cola general.

Si posteriormente se necesita segmentación, será nueva regla.

---

# 119. Jefatura

Tiene visibilidad global.

No edición.

---

# 120. Criterios de aceptación

La matriz será aceptada cuando:

- cada acción relevante tenga dueño;
- no existan permisos ambiguos;
- jefatura sea lectura;
- bodega no vea datos ajenos;
- ejecutor sólo modifique lo asignado;
- admin pueda intervenir con auditoría;
- Hub permanezca fuera de alcance;
- documentos respeten permisos;
- API valide autorización server-side.

---

# 121. Decisiones cerradas

Queda definido:

1. cuatro roles solamente;
2. solicitante ve principalmente lo propio;
3. ejecutor trabaja cola general;
4. ejecutor sólo modifica asignadas;
5. jefatura es lectura;
6. admin gestiona usuarios;
7. admin reasigna;
8. factura completada no se edita;
9. rectificación la solicita bodega;
10. rectificación la procesa ejecutor;
11. R2 nunca se expone directamente;
12. Hub no forma parte del RBAC.

---

# 122. Pendientes no bloqueantes

Podrán decidirse posteriormente:

- permitir a solicitantes ver todas las solicitudes de su bodega;
- permitir cancelación de rectificación aún no tomada;
- permitir estadísticas operacionales adicionales al ejecutor;
- vistas de auditoría más avanzadas para jefatura.

Estos puntos no deberán ampliar permisos silenciosamente en V1.

---

# 123. Regla para Antigravity

Ante cualquier acción no incluida explícitamente:

```text
DENY BY DEFAULT
```

Si considera necesario agregar un permiso:

```text
BLOCKED — DECISION REQUIRED
```

No deberá concederlo por conveniencia de implementación.

---

# 124. Dictamen

**Estado:** APROBADA CON OBSERVACIONES

La matriz propuesta cubre los flujos definidos y aplica mínimo privilegio.

Las observaciones restantes son evolutivas y no bloquean V1.

---

# 125. Estado final

**Versión:** 1.0

- [ ] APROBADA
- [x] APROBADA CON OBSERVACIONES
- [ ] REQUIERE MODIFICACIONES
- [ ] RECHAZADA

**Responsable funcional:** Ángel Ferrer

**Fecha de aprobación:** __________________

**Observaciones:**  
____________________________________________________________________

**Cambios exigidos:**  
____________________________________________________________________