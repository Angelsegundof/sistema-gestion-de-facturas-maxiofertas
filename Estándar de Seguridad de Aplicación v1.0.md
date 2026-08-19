# Estándar de Seguridad de Aplicación v1.0
## Sistema de Gestión de Facturas Maxiofertas

**Proyecto:** Sistema de Gestión de Facturas Maxiofertas  
**Tipo de documento:** Seguridad de Aplicación / DevSecOps / Requisitos de Seguridad  
**Versión:** 1.0  
**Estado:** Propuesta para revisión y aprobación  
**Fecha:** 19 de agosto de 2026  
**Responsable funcional:** Ángel Ferrer  
**Rol responsable del documento:** Arquitecto/a de Seguridad / Application Security Engineer  
**Implementación prevista:** Antigravity  
**Organización:** Maxiofertas  

---

# 1. Propósito

Este documento define los controles de seguridad obligatorios del Sistema de Gestión de Facturas Maxiofertas.

Su objetivo es reducir el riesgo de:

- acceso no autorizado;
- escalamiento de privilegios;
- exposición de facturas;
- manipulación de solicitudes;
- fraude interno;
- ataques a API;
- robo de sesión;
- inyección;
- XSS;
- CSRF;
- IDOR/BOLA;
- abuso de carga de archivos;
- exposición de secretos;
- filtraciones desde logs;
- abuso automatizado;
- corrupción de datos;
- ataques contra dependencias;
- configuraciones inseguras;
- pérdida de trazabilidad.

La seguridad deberá formar parte de la implementación desde el inicio.

No se considerará el proyecto terminado si la aplicación funciona correctamente pero no cumple este documento.

---

# 2. Estándares de referencia

La implementación deberá alinearse, cuando corresponda, con:

- OWASP ASVS 5.0.
- OWASP Top 10 2025.
- OWASP API Security Top 10.
- principio de mínimo privilegio.
- defensa en profundidad.
- Secure by Default.
- Deny by Default.
- Zero Trust aplicado a autorización interna.

---

# 3. Objetivo de seguridad

El sistema debe asumir que:

> cualquier request recibido puede haber sido manipulado.

Nunca deberá confiarse únicamente en:

- interfaz;
- URL;
- parámetro enviado;
- estado local;
- rol recibido desde frontend;
- identificador UUID;
- nombre de archivo;
- MIME declarado por navegador.

---

# 4. Principio de confianza cero

Cada operación deberá verificar nuevamente:

```text
¿Quién eres?
↓
¿Estás activo?
↓
¿Qué rol tienes?
↓
¿Puedes acceder a esta entidad?
↓
¿Puedes realizar esta acción?
↓
¿El estado actual permite esta acción?
```

---

# 5. Hub Maxiofertas

El Hub está fuera de alcance.

Antigravity:

**NO deberá modificar su código, autenticación, configuración ni permisos.**

El sistema de facturación deberá protegerse por sí mismo.

Nunca deberá considerarse seguro un request sólo porque:

> “vino desde el Hub”.

---

# 6. Seguridad del acceso directo

La URL:

```text
*.vercel.app
```

deberá considerarse pública y descubrible.

La aplicación deberá ser segura incluso si un atacante conoce la URL exacta.

La seguridad nunca dependerá de ocultar el enlace.

---

# 7. Autenticación

El sistema utilizará Google OAuth.

No deberá implementar:

- contraseña propia;
- registro público;
- recuperación de contraseña;
- login alternativo.

---

# 8. Autorización interna

Después de autenticarse con Google:

```text
email autenticado
↓
users.email
↓
active
↓
role
↓
contexto de acceso
```

Sólo entonces se autoriza una acción.

---

# 9. No confiar en email del navegador

El frontend no podrá enviar:

```json
{
  "email": "admin@empresa.cl"
}
```

para definir identidad.

La identidad debe provenir exclusivamente de la sesión autenticada validada server-side.

---

# 10. Usuario deshabilitado

Cada operación sensible deberá comprobar:

```text
active = true
```

No deberá confiar exclusivamente en una sesión creada horas antes.

---

# 11. Roles

Se mantienen únicamente:

```text
WAREHOUSE_USER
INVOICE_EXECUTOR
MANAGEMENT
ADMIN
```

No deberán existir roles ocultos, temporales o implícitos sin aprobación.

---

# 12. Deny by Default

Regla obligatoria:

> Si el permiso no está explícitamente concedido, se deniega.

---

# 13. Autorización contextual

No será suficiente verificar:

```text
role = INVOICE_EXECUTOR
```

Para modificar una solicitud en proceso deberá verificarse también:

```text
assigned_to = current_user.id
```

salvo ADMIN.

---

# 14. Protección contra IDOR / BOLA

Todos los endpoints que reciban identificadores como:

```text
/api/v1/invoice-requests/{id}
/api/v1/invoices/{id}
/api/v1/documents/{id}
```

deberán comprobar autorización sobre la entidad.

Nunca deberá asumirse que un UUID es secreto.

---

# 15. Ejemplo prohibido

No deberá existir lógica equivalente a:

```text
SELECT *
FROM invoice_requests
WHERE id = :id
```

seguido directamente de:

```text
return solicitud
```

sin verificar propiedad/permisos.

---

# 16. Solicitud ajena

Si un solicitante intenta acceder a una solicitud ajena:

respuesta recomendada:

```text
404 Not Found
```

para evitar revelar su existencia.

---

# 17. Escalamiento vertical

Un `WAREHOUSE_USER` no deberá poder:

- llamar endpoints ADMIN;
- cambiar rol;
- registrar factura;
- reasignar;
- acceder a estadísticas globales.

Aunque manipule manualmente la URL.

---

# 18. Seguridad server-side

Todo control crítico deberá existir server-side.

Ocultar:

```text
[Editar]
```

no constituye autorización.

---

# 19. Sesiones

Las cookies de sesión deberán usar cuando aplique:

```text
HttpOnly
Secure
SameSite
```

con configuración compatible con OAuth.

---

# 20. HTTPS

Toda comunicación deberá utilizar HTTPS.

No se deberán aceptar conexiones HTTP de producción.

---

# 21. Protección CSRF

Si la autenticación utiliza cookies, todas las operaciones que modifican estado deberán contar con protección frente a CSRF mediante las capacidades del framework/librería elegida y las políticas de cookie adecuadas.

---

# 22. XSS

Todo texto ingresado por usuarios se considerará no confiable.

Ejemplos:

- razón social;
- giro;
- productos;
- observaciones;
- comentarios.

No deberá renderizarse HTML libre.

---

# 23. React

No deberá utilizarse:

```text
dangerouslySetInnerHTML
```

con contenido de usuario salvo justificación explícita y sanitización robusta.

---

# 24. Inyección SQL

Todas las consultas deberán ser:

- parametrizadas;
- generadas mediante ORM seguro;
- sin concatenación de strings con input.

---

# 25. Ejemplo prohibido

```text
"... WHERE rut = '" + userInput + "'"
```

---

# 26. Validación de entrada

Toda entrada deberá validarse:

```text
tipo
longitud
formato
rango
estado
permiso
```

---

# 27. Validación doble

Se deberá validar:

- frontend por UX;
- backend por seguridad.

Backend es autoritativo.

---

# 28. Límites de texto

Se deberán establecer longitudes máximas.

Ejemplo recomendado:

```text
Razón social: 200
Giro: 250
Producto: 500
Comentario: 2000
Nombre usuario: 150
```

Evitar campos de texto ilimitado salvo necesidad.

---

# 29. JSON

No aceptar payloads arbitrariamente grandes.

Se deberán establecer límites de request body.

---

# 30. Mass Assignment

No deberá hacerse:

```text
UPDATE entity
SET ...todo lo que vino en req.body
```

Los campos permitidos deberán declararse explícitamente.

---

# 31. Ejemplo

Solicitante envía:

```json
{
  "status": "COMPLETED",
  "role": "ADMIN"
}
```

El servidor debe rechazar/ignorar esos campos.

---

# 32. Estados

Los estados sólo deberán modificarse mediante comandos de dominio.

Nunca permitir:

```text
PATCH /request
status = cualquiera
```

---

# 33. Archivos

Los PDFs constituyen una superficie de ataque importante.

La aplicación deberá validar:

- tamaño;
- MIME esperado;
- extensión;
- consistencia básica;
- entidad asociada;
- permiso.

---

# 34. Tamaño

V1:

```text
2 MB máximo
```

---

# 35. Tipos

V1:

```text
application/pdf
```

No aceptar:

```text
.exe
.js
.html
.svg
.zip
```

como documentos tributarios.

---

# 36. Nombre de archivo

Nunca utilizar directamente un nombre enviado por usuario como ruta de almacenamiento.

Generar internamente:

```text
UUID
```

---

# 37. Path traversal

Debe impedirse cualquier intento como:

```text
../../secret
```

en nombres o keys.

---

# 38. R2

El bucket deberá ser privado.

Cloudflare R2 cifra automáticamente los objetos en reposo y soporta tráfico protegido mediante TLS.

---

# 39. Credenciales R2

Nunca deberán llegar al navegador:

```text
R2_SECRET_ACCESS_KEY
R2_ACCESS_KEY_ID
```

---

# 40. URLs firmadas

Los documentos deberán accederse mediante URLs temporales o endpoints controlados.

Cloudflare R2 permite URLs prefirmadas con acceso temporal a operaciones específicas y expiración definida.

---

# 41. Expiración de lectura

Se recomienda inicialmente:

```text
5 minutos
```

para URLs de lectura.

Podrá ajustarse.

---

# 42. Expiración de upload

Se recomienda:

```text
5–10 minutos
```

---

# 43. URLs firmadas

No deberán almacenarse en base de datos.

Se guarda:

```text
storage_key
```

---

# 44. Upload intent

Una URL de subida deberá permitir:

- un objeto;
- una key;
- una operación;
- tiempo limitado.

---

# 45. Confirmación server-side

Después del upload el backend deberá comprobar que el objeto existe antes de asociarlo definitivamente.

---

# 46. Malware

Aunque V1 sólo acepte PDF, el sistema deberá tratar todo archivo como no confiable.

No deberá:

- ejecutarlo;
- parsear JavaScript embebido;
- procesar contenido activo innecesariamente.

---

# 47. Descarga

La respuesta de documento deberá usar headers adecuados, por ejemplo:

```text
Content-Type: application/pdf
X-Content-Type-Options: nosniff
```

---

# 48. Security Headers

La aplicación deberá configurar headers de seguridad apropiados.

Como mínimo evaluar:

```text
Content-Security-Policy
X-Content-Type-Options
Referrer-Policy
Permissions-Policy
Strict-Transport-Security
```

Vercel permite configurar headers HTTP de respuesta en el despliegue.

---

# 49. Content Security Policy

Se deberá definir una CSP restrictiva.

Evitar:

```text
script-src *
unsafe-eval
```

salvo necesidad estrictamente justificada.

---

# 50. Frame protection

La aplicación no deberá poder ser embebida libremente en sitios externos.

Configurar CSP:

```text
frame-ancestors
```

según necesidad.

---

# 51. Clickjacking

Debe impedirse clickjacking mediante CSP adecuada.

---

# 52. CORS

Como la aplicación y API forman parte del mismo sistema:

no habilitar:

```text
Access-Control-Allow-Origin: *
```

sin justificación.

---

# 53. Métodos HTTP

Sólo habilitar los necesarios.

No aceptar métodos inesperados.

---

# 54. Rate limiting

Deberá aplicarse protección contra abuso en endpoints sensibles.

Como mínimo:

- login/auth callbacks cuando corresponda;
- creación de solicitudes;
- búsqueda repetitiva;
- upload intent;
- documentos;
- endpoints ADMIN.

---

# 55. Rate limit

No deberá bloquear operación legítima normal.

La configuración deberá ser conservadora.

---

# 56. Abuso automatizado

Un usuario autenticado tampoco debe poder generar:

```text
10000 solicitudes/minuto
```

por error o abuso.

---

# 57. Límites de recursos

La API deberá protegerse contra consumo no restringido de:

- CPU;
- memoria;
- queries;
- uploads;
- paginación.

OWASP API Security identifica el consumo no restringido de recursos como un riesgo relevante de API.

---

# 58. Paginación

No permitir:

```text
pageSize=1000000
```

Máximo:

```text
100
```

en V1.

---

# 59. Búsquedas

Las consultas de búsqueda deberán tener:

- longitud mínima cuando corresponda;
- índices;
- límites.

---

# 60. PostgreSQL

Las conexiones a Neon deberán utilizar TLS.

Neon soporta y exige conexiones cifradas y recomienda modos estrictos como `verify-full` cuando el cliente lo soporta.

---

# 61. Base de datos no pública para cliente

El navegador nunca debe conectarse directamente a PostgreSQL.

---

# 62. DATABASE_URL

Sólo server-side.

No usar prefijos de variables públicas.

---

# 63. Privilegios DB

La cuenta utilizada por la aplicación deberá tener únicamente permisos necesarios.

Evitar usar un superusuario para operación normal si el proveedor/configuración permite roles más restringidos.

---

# 64. Migraciones

Las credenciales de migración podrán tener privilegios distintos a las de runtime si resulta práctico.

---

# 65. Secretos

Todos los secretos se almacenarán en el gestor de variables de entorno de Vercel.

---

# 66. Secretos prohibidos en repositorio

Nunca commitear:

```text
.env
.env.local
credentials.json
secret.txt
```

con valores reales.

---

# 67. `.gitignore`

Deberá cubrir archivos sensibles.

---

# 68. `.env.example`

Sólo nombres de variables.

Sin valores secretos.

---

# 69. Logs

Nunca registrar:

- access tokens;
- refresh tokens;
- cookies;
- DATABASE_URL;
- R2 secrets;
- claves OAuth.

---

# 70. Datos personales en logs

Minimizar:

- RUT;
- teléfono;
- correo.

Los logs técnicos no necesitan volcar payloads completos.

---

# 71. Manejo de errores

El frontend nunca deberá recibir:

- stack traces;
- SQL errors;
- nombres internos de tabla;
- rutas del servidor;
- secretos.

---

# 72. Error público

Ejemplo:

```json
{
  "code": "INTERNAL_ERROR",
  "message": "Ocurrió un problema. Intenta nuevamente."
}
```

---

# 73. Error interno

Los detalles deberán quedar sólo en logging server-side.

---

# 74. Request ID

Cada error crítico deberá poder correlacionarse mediante un identificador.

---

# 75. Auditoría

La auditoría deberá ser separada de logs técnicos.

---

# 76. Eventos críticos

Registrar:

- login rechazado;
- usuario deshabilitado intentando acceso;
- cambio de rol;
- reasignación;
- cancelación;
- override;
- factura completada;
- rectificación;
- Nota de Crédito;
- documento accedido cuando sea relevante.

---

# 77. Audit logs

No deberán ser modificables desde la interfaz común.

---

# 78. Manipulación de auditoría

Sólo procesos internos controlados podrán escribir en auditoría.

No deberá existir endpoint genérico:

```text
POST /audit
```

para usuarios.

---

# 79. Protección frente a doble envío

Idempotencia obligatoria en operaciones críticas.

Reduce tanto errores como vectores de abuso.

---

# 80. Operaciones idempotentes

- crear solicitud;
- completar factura;
- registrar Nota de Crédito;
- completar rectificación.

---

# 81. Concurrencia

La operación `claim` deberá ser atómica.

No depender de estado del frontend.

---

# 82. Race conditions

Deberán existir pruebas específicas de concurrencia.

---

# 83. Integridad financiera

Los montos:

- nunca float;
- siempre recalculados server-side;
- no confiar en totales cliente.

---

# 84. Precio neto

El neto se calcula server-side.

Un atacante no podrá enviar un neto manipulado.

---

# 85. IVA

La tasa V1:

```text
19%
```

deberá ser controlada server-side.

---

# 86. Cuadratura

El frontend no decide:

```text
MATCH
ROUNDING_ACCEPTED
MISMATCH
```

Lo calcula el servidor.

---

# 87. Tolerancia

```text
±2 CLP
```

será lógica server-side.

---

# 88. Rectificaciones

Una factura finalizada no podrá modificarse mediante endpoint genérico.

---

# 89. Inmutabilidad

Después de completar una factura:

bloquear cambios de:

- cliente snapshot;
- productos;
- netos;
- bruto;
- documento original.

---

# 90. Nota de Crédito

La creación deberá ser transaccional con el cambio de estado correspondiente.

---

# 91. SSRF

Cualquier funcionalidad que reciba URLs externas deberá considerarse potencial SSRF.

V1 deberá evitar funcionalidades que permitan al usuario pedir al servidor:

> “descarga esta URL”.

---

# 92. External URLs

Los enlaces históricos de Google Drive sólo deberán mostrarse/almacenarse como referencias controladas.

No deberá implementarse un fetch arbitrario de URLs introducidas por usuarios.

---

# 93. Open Redirect

Los parámetros de redirección deberán validarse.

Nunca hacer:

```text
redirect(req.query.next)
```

sin allowlist.

---

# 94. OAuth redirect URIs

Deberán estar explícitamente configuradas.

No usar wildcards innecesarios.

---

# 95. Supply Chain

Todas las dependencias representan riesgo.

OWASP Top 10 2025 incluye fallas de cadena de suministro de software como una categoría principal.

---

# 96. Dependencias

Antigravity deberá:

- minimizar dependencias;
- preferir paquetes mantenidos;
- evitar paquetes abandonados;
- no instalar librerías “por comodidad” si no son necesarias.

---

# 97. Lockfile

El repositorio deberá incluir lockfile.

---

# 98. Auditoría de dependencias

Antes de producción ejecutar:

```text
npm audit
```

o equivalente.

Los hallazgos críticos/altos deberán revisarse.

---

# 99. Actualizaciones

No actualizar automáticamente dependencias mayores en producción sin pruebas.

---

# 100. Versiones

Evitar dependencias con rangos excesivamente abiertos.

---

# 101. Secret scanning

El repositorio deberá utilizar protección contra commits de secretos cuando esté disponible.

---

# 102. SAST

Antes de producción se recomienda ejecutar análisis estático.

Podrá utilizarse:

- CodeQL;
- herramienta equivalente.

---

# 103. Dependabot

Se recomienda habilitar alertas de dependencias vulnerables si el repositorio está en GitHub.

---

# 104. Build seguro

El build no deberá imprimir variables sensibles.

---

# 105. Preview Deployments

Los despliegues preview deberán:

- no usar producción DB;
- no usar bucket producción;
- no exponer datos reales.

---

# 106. Entornos

Separar:

```text
development
production
```

y preferentemente:

```text
staging
```

cuando sea viable.

---

# 107. Neon

Desarrollo y producción no deben compartir los mismos datos operacionales.

---

# 108. R2

Desarrollo no debe subir archivos al bucket de producción.

---

# 109. Datos de prueba

No utilizar facturas reales en pruebas automatizadas salvo necesidad específica y controlada.

---

# 110. Backups

La seguridad incluye disponibilidad e integridad.

Debe existir respaldo de PostgreSQL y estrategia de recuperación.

---

# 111. Restauración

No basta con “tener backup”.

Antes de producción deberá existir al menos una prueba documentada de restauración.

---

# 112. R2

Los documentos tributarios requieren estrategia de recuperación.

No deberán depender exclusivamente de una copia lógica desconocida.

---

# 113. Protección contra borrado

No deberá existir endpoint para borrado masivo de documentos en V1.

---

# 114. DELETE

Evitar DELETE físico sobre entidades principales.

---

# 115. Administrador

Incluso ADMIN no debe poder borrar masivamente facturas desde UI.

---

# 116. Alertas

Se recomienda alertar/loggear eventos como:

- múltiples 403;
- múltiples accesos a IDs inexistentes;
- ráfagas de upload;
- errores repetidos de autenticación;
- intentos administrativos denegados.

---

# 117. Brute force

Google OAuth reduce el riesgo de brute force local porque no existen contraseñas propias.

Aun así deben monitorearse accesos rechazados.

---

# 118. Session fixation

La librería de autenticación deberá gestionar rotación/creación segura de sesión tras autenticación.

---

# 119. Logout

Debe existir cierre de sesión funcional.

---

# 120. Cache

Respuestas autenticadas no deberán cachearse públicamente.

---

# 121. Headers Cache-Control

Datos sensibles:

```text
Cache-Control: private, no-store
```

cuando corresponda.

---

# 122. Service workers

No introducir PWA/service worker en V1 si no es necesario.

Un service worker mal configurado puede complicar caché y control de versiones.

---

# 123. Información de infraestructura

No mostrar públicamente:

- DB provider;
- bucket name;
- internal IDs innecesarios;
- errores de Neon;
- secretos Vercel.

---

# 124. Health endpoint

Debe exponer información mínima:

```json
{
  "status": "ok"
}
```

No:

```json
{
  "db": "neon-abc.us-east...",
  "bucket": "...",
  "version": "Postgres ..."
}
```

---

# 125. Fingerprinting

Evitar headers innecesarios que revelen información técnica cuando puedan deshabilitarse razonablemente.

---

# 126. Seguridad de ADMIN

Las funciones ADMIN deberán requerir autenticación reciente si la librería/flujo lo soporta razonablemente.

Como mínimo, un usuario deshabilitado pierde acceso inmediatamente en cada request.

---

# 127. Acciones administrativas sensibles

Deben requerir confirmación:

- cambiar rol;
- deshabilitar usuario;
- reasignar;
- override.

---

# 128. Reautorización futura

Puede evaluarse en V2 exigir autenticación reciente para operaciones administrativas críticas.

No bloquea V1.

---

# 129. Datos exportados

Si se implementan exportaciones futuras:

deberán respetar permisos y proteger CSV injection.

No forma parte de V1.

---

# 130. CSV injection

Si se exporta CSV en futuro, valores que comiencen por:

```text
=
+
-
@
```

deberán tratarse apropiadamente.

---

# 131. DoS funcional

El sistema deberá limitar:

- número de items por solicitud;
- tamaño de descripción;
- cantidad de uploads;
- page size.

---

# 132. Máximo de productos

Se recomienda definir un máximo razonable V1.

Ejemplo:

```text
50 líneas
```

por solicitud.

Si el negocio requiere más, ajustar antes de producción.

---

# 133. Timeout

Las operaciones externas deberán tener timeout.

No dejar requests colgados indefinidamente.

---

# 134. R2 timeout

Si R2 falla:

- abortar;
- no completar factura;
- permitir reintento.

---

# 135. Database timeout

Queries anormalmente largas deberán detectarse y revisarse.

---

# 136. Índices

Toda consulta frecuente deberá estar respaldada por índices apropiados para evitar degradación y abuso.

---

# 137. Información excesiva de API

Las respuestas deberán devolver únicamente campos necesarios.

No usar:

```text
SELECT *
```

como contrato automático de API.

---

# 138. Broken Object Property Authorization

El servidor deberá controlar qué campos puede ver cada rol.

Ejemplo:

WAREHOUSE_USER no necesita:

```text
audit metadata
internal reconciliation details
```

---

# 139. Gestión de errores excepcionales

OWASP Top 10 2025 incluye el manejo incorrecto de condiciones excepcionales como riesgo relevante.

Por tanto:

- no continuar después de errores parciales;
- rollback transacciones;
- no asumir éxito de servicios externos;
- manejar estados imposibles.

---

# 140. Falla parcial

Ejemplo:

```text
PDF subió
pero DB falló
```

deberá existir mecanismo de reconciliación/limpieza.

---

# 141. Falla inversa

```text
DB dice documento válido
pero objeto no existe
```

debe ser detectable.

---

# 142. Auditoría de consistencia

Se recomienda tarea administrativa/manual para comprobar:

```text
documents ↔ R2
```

---

# 143. Testing de seguridad

Antes de producción se deberán ejecutar pruebas específicas.

---

# 144. Test IDOR

Intentar:

- cambiar IDs;
- acceder a solicitudes ajenas;
- acceder a documentos ajenos.

---

# 145. Test de roles

Cada endpoint deberá probar al menos:

```text
allowed role
denied role
inactive user
```

---

# 146. Test XSS

Probar inputs como texto hostil.

Ejemplo conceptual:

```text
<script>alert(1)</script>
```

El resultado debe mostrarse como texto o rechazarse, nunca ejecutarse.

---

# 147. Test SQL injection

Probar entradas maliciosas sin que afecten consultas.

---

# 148. Test CSRF

Comprobar operaciones mutables bajo política de autenticación real.

---

# 149. Test upload

Probar:

- PDF correcto;
- ejecutable renombrado `.pdf`;
- archivo >2MB;
- nombre extraño;
- MIME falso.

---

# 150. Test concurrencia

Dos ejecutores tomando misma solicitud.

Sólo uno debe ganar.

---

# 151. Test de privilege escalation

WAREHOUSE_USER intentando llamar:

```text
/admin/users
```

Resultado:

```text
DENY
```

---

# 152. Test de mass assignment

Intentar enviar:

```json
{
  "role": "ADMIN"
}
```

en payload no administrativo.

Debe ser ignorado/rechazado.

---

# 153. Test de documentos

Con UUID conocido de otra factura:

acceso deberá ser denegado.

---

# 154. Test de URL firmada

Después de expiración:

el documento ya no deberá ser accesible con esa URL.

---

# 155. Test de secret leakage

Buscar en:

- bundle cliente;
- logs;
- responses;
- source maps;
- errores.

No debe aparecer ningún secreto.

---

# 156. Test de headers

Verificar:

```text
CSP
nosniff
Referrer-Policy
HSTS
```

según configuración final.

---

# 157. Security checklist preproducción

Antes de liberar:

```text
[ ] Auth validada
[ ] RBAC validado
[ ] IDOR tests
[ ] CSRF revisado
[ ] XSS tests
[ ] SQL injection tests
[ ] Upload tests
[ ] Rate limits
[ ] Headers
[ ] Secrets revisados
[ ] Dependencias revisadas
[ ] R2 privado
[ ] URLs firmadas
[ ] DB TLS
[ ] Backups
[ ] Restore test
[ ] Logs
[ ] Auditoría
[ ] Concurrencia
[ ] Idempotencia
```

---

# 158. Severidad de vulnerabilidades

Se clasificará:

```text
CRITICAL
HIGH
MEDIUM
LOW
```

---

# 159. Regla de salida a producción

No se deberá desplegar producción con vulnerabilidades conocidas:

```text
CRITICAL
```

o:

```text
HIGH
```

sin aceptación explícita del riesgo.

---

# 160. Hallazgo crítico

Ejemplos:

- bypass autenticación;
- lectura de facturas ajenas;
- privilegios ADMIN obtenibles;
- secreto R2 expuesto;
- DATABASE_URL expuesto.

Bloquean producción.

---

# 161. Hallazgo alto

Ejemplos:

- IDOR;
- XSS persistente;
- CSRF crítico;
- upload arbitrario;
- SQL injection.

Bloquean producción salvo decisión explícita.

---

# 162. Security Gate

Antigravity deberá ejecutar antes de producción:

```text
CHECKPOINT — SECURITY GATE
```

---

# 163. Contenido del Security Gate

Debe reportar:

1. autenticación verificada;
2. matriz RBAC verificada;
3. pruebas IDOR;
4. pruebas de archivos;
5. secretos;
6. dependencias;
7. headers;
8. auditoría;
9. R2;
10. PostgreSQL;
11. backups;
12. vulnerabilidades pendientes.

---

# 164. Resultado permitido

El checkpoint deberá terminar en:

```text
SECURITY GATE — PASS
```

o:

```text
SECURITY GATE — FAIL
```

---

# 165. FAIL

Si FAIL:

no avanzar a producción.

---

# 166. No autocorregir arquitectura

Si la solución de un hallazgo requiere:

- cambiar proveedor;
- modificar Hub;
- introducir servicio externo;
- cambiar autenticación;

Antigravity deberá usar:

```text
BLOCKED — DECISION REQUIRED
```

---

# 167. Seguridad continua

Después de producción:

- revisar dependencias;
- revisar errores;
- revisar eventos de seguridad;
- aplicar parches;
- mantener backups.

---

# 168. No confiar en “nadie conoce la app”

Se establece expresamente:

> La aplicación deberá diseñarse bajo el supuesto de que un atacante conoce la URL, las rutas de la API, el stack tecnológico y los nombres de las entidades.

La seguridad deberá seguir funcionando.

---

# 169. No confiar en UUID

UUID reduce enumeración simple.

No sustituye autorización.

---

# 170. No confiar en frontend

Toda regla crítica se repite server-side.

---

# 171. No confiar en usuario autenticado

Un usuario autenticado también puede:

- equivocarse;
- manipular requests;
- intentar privilegios indebidos.

La autorización se aplica a cada acción.

---

# 172. No confiar en IA

Todo código generado por IA deberá revisarse como código no confiable hasta:

- compilar;
- pasar tests;
- pasar seguridad;
- cumplir contratos.

---

# 173. Prohibiciones expresas para Antigravity

Antigravity no deberá:

- desactivar auth temporalmente en producción;
- crear backdoors;
- hardcodear ADMIN por email en lógica dispersa;
- usar `role` del frontend;
- hacer R2 público;
- exponer claves en cliente;
- usar `Access-Control-Allow-Origin: *` por conveniencia;
- desactivar TLS;
- aceptar todos los MIME;
- quitar validaciones para “hacer funcionar” una prueba;
- ignorar errores críticos de auditoría.

---

# 174. No usar bypass temporal

Código tipo:

```text
if (process.env.NODE_ENV === "production") {
  // TODO auth later
}
```

o equivalente inseguro no deberá existir.

---

# 175. Backdoors de desarrollo

Cualquier mecanismo de desarrollo tipo:

```text
?admin=true
```

queda prohibido.

---

# 176. Seed ADMIN

El primer ADMIN deberá crearse mediante proceso controlado.

No mediante ruta pública.

---

# 177. Datos iniciales

El seed no deberá incluir:

- secretos;
- usuarios ficticios privilegiados en producción;
- contraseñas.

---

# 178. Observabilidad sin exposición

Los errores internos podrán ir a logs.

El usuario recibe mensaje simple.

---

# 179. Protección de privacidad

Minimizar datos mostrados a cada rol.

El principio:

> necesidad de conocer.

---

# 180. Datos de cliente

WAREHOUSE_USER sólo necesita datos relacionados con sus operaciones.

No deberá existir buscador global de todos los clientes sin necesidad.

---

# 181. Enumeration de clientes

El endpoint de RUT deberá contar con protección razonable contra consultas masivas automatizadas.

---

# 182. Documentos tributarios

Se consideran información sensible.

Nunca deberán indexarse por buscadores.

---

# 183. Robots

Se recomienda evitar indexación de la aplicación mediante:

```text
robots
```

y headers/meta adecuados.

Esto no sustituye autenticación.

---

# 184. Source maps

Los source maps de producción deberán configurarse de manera que no expongan información innecesaria públicamente.

---

# 185. Production debug

No habilitar debug detallado en producción.

---

# 186. Configuración segura por defecto

Producción deberá iniciar con:

```text
auth ON
RBAC ON
R2 private
HTTPS
no debug
no public DB
```

---

# 187. OWASP ASVS como criterio de revisión

Antes de producción se recomienda utilizar OWASP ASVS 5.0 como checklist de verificación, especialmente en:

- autenticación;
- sesión;
- autorización;
- validación;
- criptografía;
- manejo de errores;
- archivos;
- APIs.

---

# 188. Objetivo de nivel ASVS

Para este sistema se recomienda usar **ASVS Level 2 como referencia de objetivo**, por tratar datos comerciales y documentos tributarios, sin pretender ser una aplicación de riesgo extremo.

---

# 189. Seguridad de diseño

No deberá añadirse una funcionalidad sólo porque es fácil implementar si aumenta significativamente superficie de ataque.

Ejemplos:

- URLs públicas;
- exportaciones globales;
- uploads múltiples arbitrarios;
- APIs genéricas.

---

# 190. Menos superficie

Preferir:

```text
endpoint específico
```

sobre:

```text
endpoint genérico de actualización de cualquier campo
```

---

# 191. API inventory

Todos los endpoints deberán estar documentados.

No deberán existir rutas ocultas o experimentales en producción.

---

# 192. Deprecated endpoints

Una ruta retirada deberá eliminarse o bloquearse.

No dejar endpoints antiguos sin protección.

---

# 193. Seguridad en Preview

Los previews de Vercel con funciones sensibles deberán protegerse y no utilizar producción inadvertidamente.

---

# 194. Rollback

Un rollback de frontend no debe dejar esquema DB en estado incompatible.

Las migraciones deberán planificarse con seguridad.

---

# 195. Migraciones

No ejecutar:

```text
DROP TABLE
DROP COLUMN
```

en producción sin evaluación y respaldo.

---

# 196. Backup previo

Cambios destructivos requieren backup previo comprobable.

---

# 197. Acceso administrativo a proveedores

Las cuentas Vercel, Neon y Cloudflare deberán usar:

- MFA cuando esté disponible;
- credenciales únicas;
- no compartir claves por chat o repositorio.

---

# 198. Tokens de servicio

Crear tokens con mínimo alcance posible.

---

# 199. Rotación

Ante sospecha de exposición:

- revocar;
- regenerar;
- actualizar secrets;
- revisar logs.

---

# 200. Incidente de seguridad

Debe existir capacidad mínima para:

1. deshabilitar usuario;
2. revocar secreto;
3. bloquear acceso;
4. identificar acciones auditadas;
5. restaurar información.

---

# 201. Auditoría de incidente

Los timestamps y actor deberán permitir reconstruir qué ocurrió.

---

# 202. Regla de no borrado de evidencia

Ante incidente:

no borrar audit logs relacionados.

---

# 203. Seguridad de disponibilidad

Errores de una consulta estadística no deberán tumbar el flujo de facturación.

---

# 204. Circuitos independientes

Mantener módulos desacoplados suficientemente para que:

```text
estadísticas fallan
```

no implique:

```text
no puedo facturar
```

---

# 205. Revisión antes de cada release

Cambios que afecten:

- auth;
- roles;
- documentos;
- DB;
- uploads;

requieren revisión de seguridad explícita.

---

# 206. Definition of Done de seguridad

Una funcionalidad no estará terminada hasta cumplir:

```text
autenticación
autorización
validación
errores seguros
auditoría
tests
```

cuando aplique.

---

# 207. Criterios de aceptación

Este documento se considera cumplido cuando:

- acceso directo está protegido;
- RBAC funciona server-side;
- IDOR está mitigado;
- R2 es privado;
- secretos no se exponen;
- archivos se validan;
- transacciones protegen integridad;
- logs no filtran secretos;
- headers están configurados;
- dependencias están revisadas;
- Security Gate pasa.

---

# 208. Regla de implementación para IA

Antigravity deberá considerar este documento:

**OBLIGATORIO Y BLOQUEANTE.**

No podrá degradar controles por rapidez de desarrollo.

---

# 209. Regla de bloqueo de seguridad

Ante duda:

```text
BLOCKED — SECURITY DECISION REQUIRED
```

Deberá reportar:

- riesgo;
- módulo;
- impacto;
- alternativas;
- recomendación.

---

# 210. Dictamen

## Resultado

**APROBADA CON OBSERVACIONES**

La estrategia establece una línea base de seguridad adecuada para una aplicación interna/operacional que maneja información comercial y documentos tributarios.

---

# 211. Observaciones obligatorias antes de producción

Deberán verificarse de forma real:

1. autenticación;
2. sesiones;
3. RBAC;
4. IDOR/BOLA;
5. R2 privado;
6. URLs firmadas;
7. TLS Neon;
8. headers;
9. upload PDF;
10. dependency scan;
11. secret scan;
12. backups;
13. restore;
14. auditoría;
15. Security Gate.

---

# 212. Estado final

**Versión:** 1.0

- [ ] APROBADA
- [x] APROBADA CON OBSERVACIONES
- [ ] REQUIERE MODIFICACIONES
- [ ] RECHAZADA

**Responsable funcional:** Ángel Ferrer

**Responsable de seguridad:** __________________

**Fecha:** __________________

**Riesgos aceptados:**  
____________________________________________________________________

**Observaciones:**  
____________________________________________________________________