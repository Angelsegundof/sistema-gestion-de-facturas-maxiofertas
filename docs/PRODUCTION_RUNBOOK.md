# MANUAL OPERACIONAL DE PRODUCCIÓN (PRODUCTION RUNBOOK)

**Sistema:** Sistema de Gestión de Facturas Maxiofertas  
**Versión:** 1.0.0-rc1  
**Entorno:** Producción (Vercel Serverless + Neon PostgreSQL + Cloudflare R2)  

---

## 1. Arquitectura de Infraestructura

```text
[ Cliente / Navegador ]
         │ (HTTPS / TLS 1.3)
         ▼
[ Vercel Edge / Serverless Functions ] (Next.js App Router)
   ├── Auth & Session: HttpOnly + Secure Cookies (HMAC-SHA256)
   ├── Rate Limiter: Distributed IP-based limiter
   ├── Security Headers: HSTS, CSP, X-Frame-Options DENY
   │
   ├── [ Neon Serverless PostgreSQL ] (SSL Required)
   │     ├── Schema: users, warehouses, customers, invoice_requests,
   │     │           invoices, rectifications, credit_notes, documents,
   │     │           audit_logs, document_share_tokens
   │     └── Pooling: Neon connection pooling
   │
   └── [ Cloudflare R2 Storage ] (Private Bucket)
         ├── Bucket: maxiofertas-facturacion
         ├── Storage: Facturas PDF y Notas de Crédito
         └── Access: URLs presignadas con expiración (15 min) / Token Hash SHA-256
```

---

## 2. Inventario de Variables de Entorno en Producción

| Variable | Tipo | Ámbito | Propósito |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | String | Server | Debe ser estrictamente `production`. |
| `NEXT_PUBLIC_APP_URL` | URL | Public/Server | URL canónica del sistema en producción (ej. `https://facturas.maxiofertas.cl`). |
| `DATABASE_URL` | Secret | Server-only | Connection string a Neon PostgreSQL con `sslmode=require`. |
| `AUTH_SECRET` | Secret | Server-only | Llave criptográfica de firma de sesiones (mínimo 32 caracteres aleatorios). |
| `R2_ACCOUNT_ID` | Secret | Server-only | ID de cuenta de Cloudflare. |
| `R2_ACCESS_KEY_ID` | Secret | Server-only | Access Key de R2 con permisos mínimos sobre el bucket. |
| `R2_SECRET_ACCESS_KEY` | Secret | Server-only | Secret Key de R2. |
| `R2_BUCKET` | String | Server-only | Nombre del bucket R2 (`maxiofertas-facturacion`). |
| `MAX_FILE_SIZE_BYTES` | Number | Server-only | Límite de subida de PDF (5242880 = 5MB). |
| `ROUNDING_TOLERANCE_CLP` | Number | Server-only | Tolerancia cuadratura SII (2 CLP). |
| `DUPLICATE_WINDOW_HOURS` | Number | Server-only | Ventana de detección preventiva de duplicados (24 horas). |

---

## 3. Despliegue y Migraciones

### 3.1 Despliegue en Vercel
1. El despliegue a producción se realiza automáticamente mediante push/merge a la rama `main`.
2. Las variables de entorno de producción están restringidas exclusivamente al entorno **Production** en Vercel.

### 3.2 Aplicación de Migraciones
1. Las migraciones se ejecutan de forma controlada y secuencial:
   ```bash
   npm run db:migrate
   ```
2. Todas las migraciones son deterministas, no destructivas y versionadas en `src/lib/db/migrations/`.

---

## 4. Estrategia de Backup y Recuperación (Disaster Recovery)

### 4.1 PostgreSQL (Neon)
- **Backups Automáticos:** Neon gestiona snapshots automáticos y Continuous Data Protection (PITR - Point-in-Time Recovery).
- **Retención:** 7 días en capa estándar / 30 días en capa extendida.
- **Procedimiento de Restore:**
  1. Ingresar a la consola de Neon.
  2. Seleccionar el punto temporal exacto deseado.
  3. Crear una nueva rama/base a partir de dicho timestamp para validación.
  4. Promover la base restaurada a endpoint primario actualizando `DATABASE_URL` en Vercel.

### 4.2 Almacenamiento Documental (Cloudflare R2)
- **Bucket Privado:** Acceso público deshabilitado.
- **Recuperación:** Los PDFs están respaldados en la nube con durabilidad 99.999999999% (11 9s).

---

## 5. Procedimiento de Rollback

### 5.1 Rollback de Aplicación (Vercel)
1. En caso de fallo tras un despliegue, acceder al Dashboard de Vercel > Deployments.
2. Localizar el último deployment estable (`Instant Rollback`).
3. Hacer clic en **"Promote to Production"** (tiempo de ejecución: < 10 segundos).

### 5.2 Rollback de Migraciones
- Las migraciones en V1 son estrictamente aditivas (forward-only).
- En caso de incompatibilidad severa, restaurar el snapshot de PostgreSQL correspondiente al timestamp previo al deploy.

---

## 6. Monitoreo y Health Check

- **Endpoint de Salud:** `/api/health` o `/api/v1/health`
  - Devuelve `HTTP 200 OK` con `{ status: "ok", service: "maxiofertas-facturacion", database: "connected" }`.
- **Logs y Auditoría:**
  - Registros de autenticación, emisión, y rectificación persistidos en la tabla `audit_logs`.
  - Sin exposición de contraseñas, tokens completos ni claves de API en logs de consola.
