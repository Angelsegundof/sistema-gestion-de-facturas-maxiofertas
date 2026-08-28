# Sistema de Gestión de Facturas Maxiofertas

Sistema centralizado y de alta disponibilidad para la gestión, emisión, rectificación y consulta de facturas electrónicas para las 16 sucursales y bodegas de Maxiofertas en Chile.

---

## 🛠️ Stack Tecnológico

* **Frontend & Backend API:** [Next.js 16](https://nextjs.org/) (App Router, Turbopack, React 19)
* **Lenguaje:** TypeScript estricto
* **Base de Datos:** PostgreSQL en [Neon](https://neon.tech/) (Connection Pooling & SSL)
* **ORM & Migraciones:** [Drizzle ORM](https://orm.drizzle.team/)
* **Almacenamiento Documental:** [Cloudflare R2](https://www.cloudflare.com/products/r2/) (Almacenamiento privado S3-compatible)
* **Plataforma de Despliegue:** [Vercel](https://vercel.com/)
* **Testing:** [Vitest](https://vitest.dev/) con PGlite en memoria y suites de integración PostgreSQL

---

## 🏢 Estructura de Bodegas y Sucursales

El sistema opera con 16 bodegas y sucursales a lo largo de Chile:

1. **Santiago Central** (`CENTRAL`)
2. **Bodega Rancagua** (`RANCAGUA`)
3. **Bodega Castro Chiloé** (`CASTRO`)
4. **Bodega Concepción** (`CONCEPCION`)
5. **Bodega Temuco** (`TEMUCO`)
6. **Bodega Talca** (`TALCA`)
7. **Bodega Viña del Mar** (`VINA`)
8. **Bodega Antofagasta** (`ANTOFAGASTA`)
9. **Bodega Chillán** (`CHILLAN`)
10. **Bodega Puerto Montt** (`PUERTO_MONTT`)
11. **Bodega Los Ángeles** (`LOS_ANGELES`)
12. **Bodega Curicó** (`CURICO`)
13. **Bodega Valdivia** (`VALDIVIA`)
14. **Bodega La Serena** (`LA_SERENA`)
15. **Bodega Osorno** (`OSORNO`)
16. **Bodega Copiapó** (`COPIAPO`)

---

## 👥 Matriz de Roles y Permisos (RBAC)

* **`WAREHOUSE_USER` (Solicitante de Bodega):** Creación de solicitudes de facturación para su sucursal, seguimiento de estado en tiempo real, solicitud de cambios/rectificaciones.
* **`INVOICE_EXECUTOR` (Ejecutor de Facturación):** Toma y procesamiento de solicitudes en cola, validación tributaria de montos netos e IVA (19%), carga de facturas PDF en Cloudflare R2, emisión de enlaces seguros para WhatsApp.
* **`MANAGEMENT` (Jefatura y Supervisión):** Visualización de estadísticas consolidadas, filtros por sucursal, métricas de rendimiento por ejecutor (mes actual, promedio histórico).
* **`ADMIN` (Administrador General):** Control global de usuarios, auditoría completa (`audit_logs`), administración de bodegas, resolución de notas de crédito y rectificaciones.

---

## 🔒 Estándares de Seguridad

* **Sesiones Seguras:** Cookies `HttpOnly`, `Secure`, `SameSite=Lax` con expiración controlada y tokens criptográficos HMAC-SHA256.
* **Protección de Datos:** Cero exposición de credenciales o URLs directas a buckets privados. Enlaces compartibles `/f/[token]` con tokens efímeros y hash SHA-256 en base de datos.
* **Aislamiento Multi-tenant por Bodega:** Validación server-side estricta para evitar accesos cruzados no autorizados (anti-IDOR).
* **Protección contra Fuerza Bruta:** Rate limiting distribuido por IP y usuario en endpoints de autenticación.
* **Auditoría:** Registro inmutable de eventos en la tabla `audit_logs`.

---

## 🚀 Entornos y Despliegue

### Requisitos Previos

* Node.js `>= 20.x`
* npm `>= 10.x`

### Variables de Entorno Requeridas

Copiar `.env.example` a `.env.local` para desarrollo:

```bash
cp .env.example .env.local
```

Variables principales:
* `DATABASE_URL`: Cadena de conexión PostgreSQL (Neon con SSL)
* `CLOUDFLARE_R2_ACCOUNT_ID`: Identificador de cuenta Cloudflare
* `CLOUDFLARE_R2_ACCESS_KEY_ID`: Access Key para Cloudflare R2
* `CLOUDFLARE_R2_SECRET_ACCESS_KEY`: Secret Key para Cloudflare R2
* `CLOUDFLARE_R2_BUCKET_NAME`: `maxiofertas-facturacion`
* `APP_BASE_URL`: `https://facturas.maxiofertas.cl`
* `JWT_SECRET` / `SESSION_SECRET`: Secretos criptográficos para firma de sesiones
* `NODE_ENV`: `production`

---

## 🧪 Pruebas y Control de Calidad

```bash
# Validación de linter
npm run lint

# Chequeo estricto de tipos TypeScript
npx tsc --noEmit

# Ejecución de la suite completa de pruebas unitarias y de integración
npm test

# Compilación optimizada para producción
npm run build
```

---

## 📄 Licencia

Uso exclusivo interno para **Maxiofertas SpA**. Todos los derechos reservados.
