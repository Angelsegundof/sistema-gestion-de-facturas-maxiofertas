import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";

describe("PostgreSQL Migrations Scenarios (Real PostgreSQL)", () => {
  const readMigration = (fileName: string) => {
    const fullPath = path.resolve(__dirname, `../src/lib/db/migrations/${fileName}`);
    return fs.readFileSync(fullPath, "utf8");
  };

  it("Scenario A: Full fresh migration from scratch (0000 -> 0001 -> 0002 -> 0003) on empty DB", async () => {
    const db = new PGlite();

    const m0 = readMigration("0000_cheerful_giant_girl.sql");
    for (const st of m0.split("--> statement-breakpoint").filter((s) => s.trim())) {
      await db.exec(st);
    }

    const m1 = readMigration("0001_sharp_reptil.sql");
    for (const st of m1.split("--> statement-breakpoint").filter((s) => s.trim())) {
      await db.exec(st);
    }

    const m2 = readMigration("0002_concerned_molly_hayes.sql");
    for (const st of m2.split("--> statement-breakpoint").filter((s) => s.trim())) {
      await db.exec(st);
    }

    const m3 = readMigration("0003_rapid_boomerang.sql");
    for (const st of m3.split("--> statement-breakpoint").filter((s) => s.trim())) {
      await db.exec(st);
    }

    const m4 = readMigration("0004_wet_mulholland_black.sql");
    for (const st of m4.split("--> statement-breakpoint").filter((s) => s.trim())) {
      await db.exec(st);
    }

    const m5 = readMigration("0005_uneven_lady_bullseye.sql");
    for (const st of m5.split("--> statement-breakpoint").filter((s) => s.trim())) {
      await db.exec(st);
    }

    const tablesRes = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
    );
    const tables = tablesRes.rows.map((r) => r.table_name);

    expect(tables).toContain("audit_logs");
    expect(tables).toContain("credit_notes");
    expect(tables).toContain("customers");
    expect(tables).toContain("documents");
    expect(tables).toContain("invoice_request_items");
    expect(tables).toContain("invoice_requests");
    expect(tables).toContain("rate_limits");
    expect(tables).toContain("rectifications");
    expect(tables).toContain("request_corrections");
    expect(tables).toContain("sessions");
    expect(tables).toContain("users");
    expect(tables).toContain("warehouses");

    // Verify foreign keys from documents
    const docFkRes = await db.query<{ constraint_name: string }>(
      "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'documents' AND constraint_type = 'FOREIGN KEY';"
    );
    const docFkNames = docFkRes.rows.map((r) => r.constraint_name);
    expect(docFkNames).toContain("documents_invoice_request_id_invoice_requests_id_fk");
    expect(docFkNames).toContain("documents_uploaded_by_users_id_fk");
  });

  it("Scenario B: Upgrade from Phase 4 schema to Phase 5 with existing data preservation", async () => {
    const db = new PGlite();

    // 1. Run migrations up to Phase 4 (0000, 0001, 0002)
    const m0 = readMigration("0000_cheerful_giant_girl.sql");
    for (const st of m0.split("--> statement-breakpoint").filter((s) => s.trim())) {
      await db.exec(st);
    }

    const m1 = readMigration("0001_sharp_reptil.sql");
    for (const st of m1.split("--> statement-breakpoint").filter((s) => s.trim())) {
      await db.exec(st);
    }

    const m2 = readMigration("0002_concerned_molly_hayes.sql");
    for (const st of m2.split("--> statement-breakpoint").filter((s) => s.trim())) {
      await db.exec(st);
    }

    // 2. Insert existing Phase 4 data
    await db.exec(`
      INSERT INTO warehouses (id, code, name, active)
      VALUES ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03', 'CENTRAL', 'Bodega Central', true);
    `);

    await db.exec(`
      INSERT INTO users (id, email, name, password_hash, role, warehouse_id, active)
      VALUES ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'solicitante@maxiofertas.cl', 'Solicitante Existente', 'hash123', 'WAREHOUSE_USER', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03', true);
    `);

    await db.exec(`
      INSERT INTO customers (id, rut_canonical, rut_display, legal_name, business_activity, active)
      VALUES ('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04', '76432109K', '76.432.109-K', 'Cliente Existente SPA', 'Giro', true);
    `);

    await db.exec(`
      INSERT INTO invoice_requests (id, request_number, warehouse_id, customer_id, requested_by, status, customer_rut_snapshot, customer_legal_name_snapshot, customer_business_activity_snapshot, expected_gross_total)
      VALUES ('11eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'FAC-2026-000001', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03', 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'PENDING', '76.432.109-K', 'Cliente Existente SPA', 'Giro', 68000);
    `);

    // 3. Apply Phase 5 upgrade migration (0003)
    const m3 = readMigration("0003_rapid_boomerang.sql");
    for (const st of m3.split("--> statement-breakpoint").filter((s) => s.trim())) {
      await db.exec(st);
    }

    // 4. Verify existing records are completely intact
    const userRes = await db.query("SELECT * FROM users WHERE email = 'solicitante@maxiofertas.cl';");
    expect(userRes.rows).toHaveLength(1);

    const reqRes = await db.query("SELECT * FROM invoice_requests WHERE request_number = 'FAC-2026-000001';");
    expect(reqRes.rows).toHaveLength(1);

    // 5. Insert new Phase 5 observation
    await db.exec(`
      INSERT INTO request_corrections (id, invoice_request_id, reason, comment, requested_by)
      VALUES ('22eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', '11eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'INVALID_RUT', 'RUT de prueba', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01');
    `);

    const obsRes = await db.query("SELECT * FROM request_corrections WHERE invoice_request_id = '11eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';");
    expect(obsRes.rows).toHaveLength(1);
  });
});
