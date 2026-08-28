# LISTA DE CONTROL PRE-GO-LIVE (PRE-GO-LIVE CHECKLIST)

**Sistema:** Sistema de Gestión de Facturas Maxiofertas  
**Fase:** F11 — Hardening y Producción  
**Estado Actual:** F11A (Preparación e Infraestructura Aprobada)  

---

## 1. Cadena de Integración y Código

- [x] **Git limpio:** Working tree sin archivos modificados ni no rastreados (`working tree clean`).
- [x] **Rama principal:** Rama `main` como rama canónica de producción.
- [x] **Baseline identificado:** Commit de referencia identificado y tag `v1.0.0-rc1`.
- [x] **Escaneo de secretos:** Sin credenciales, tokens ni archivos `.env` en el repositorio Git.
- [x] **Reglas `.gitignore`:** Bloqueo estricto de `.env*` (excepto `.env.example`).
- [x] **QA Bypasses eliminados:** QA Role Switcher y endpoints de prueba bloqueados/removidos en `NODE_ENV=production`.
- [x] **Seeds automáticos deshabilitados:** `seedQa` estrictamente condicionado a desarrollo local.
- [x] **Fallback mock R2 eliminado:** En `NODE_ENV=production`, la aplicación rechaza operaciones si falta R2 en lugar de escribir a RAM.

---

## 2. Infraestructura y Base de Datos

- [x] **Separación de entornos:** Base de desarrollo (PGlite local) totalmente separada de la base productiva (Neon PostgreSQL).
- [x] **Migraciones probadas:** Migraciones `0000` a `0007` reconstruyen la base completa desde cero sin errores.
- [x] **Bucket Cloudflare R2:** Bucket privado `maxiofertas-facturacion` sin acceso público.
- [x] **Presigned URLs:** URLs firmadas con expiración temporal corta (15 min para visualización).
- [x] **Seguridad HTTP:** Encabezados HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff y CSRF Same-Origin activos.
- [x] **Health Check:** Endpoints `/api/health` y `/api/v1/health` activos y seguros.

---

## 3. Estado de Ejecución y Bloqueos de F11A

- [ ] **F11B — Usuarios reales provisionados:** PENDIENTE DE APROBACIÓN HUMANA (NO ejecutar en F11A).
- [ ] **F11B — Dry-run e importación de histórico real:** PENDIENTE DE APROBACIÓN HUMANA (NO ejecutar en F11A).
- [ ] **F11C — Despliegue productivo y Smoke Test:** PENDIENTE DE APROBACIÓN HUMANA (NO ejecutar en F11A).
- [ ] **F11C — Modificación de enlaces en Hub Maxiofertas:** PENDIENTE DE APROBACIÓN HUMANA (NO ejecutar en F11A).
- [ ] **F11C — DNS Cutover final:** PENDIENTE DE APROBACIÓN HUMANA (NO ejecutar en F11A).
