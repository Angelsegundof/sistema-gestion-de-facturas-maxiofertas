import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";

describe("PostgreSQL Migrations Scenarios (Real PostgreSQL)", () => {
  const readMigration = (fileName: string) => {
    const fullPath = path.resolve(__dirname, `../src/lib/db/migrations/${fileName}`);
    return fs.readFileSync(fullPath, "utf8");
  };

  it("Scenario A: Full fresh migration from scratch (0000 -> 0001) on empty DB", async () => {
    const db = new PGlite();

    const m0 = readMigration("0000_cheerful_giant_girl.sql");
    for (const st of m0.split("--> statement-breakpoint").filter((s) => s.trim())) {
      await db.exec(st);
    }

    const m1 = readMigration("0001_sharp_reptil.sql");
    for (const st of m1.split("--> statement-breakpoint").filter((s) => s.trim())) {
      await db.exec(st);
    }

    const tablesRes = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
    );
    const tables = tablesRes.rows.map((r) => r.table_name);

    expect(tables).toContain("audit_logs");
    expect(tables).toContain("customers");
    expect(tables).toContain("rate_limits");
    expect(tables).toContain("sessions");
    expect(tables).toContain("users");
    expect(tables).toContain("warehouses");

    // Verify foreign key from users to warehouses exists
    const fkRes = await db.query<{ constraint_name: string }>(
      "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'users' AND constraint_type = 'FOREIGN KEY';"
    );
    const fkNames = fkRes.rows.map((r) => r.constraint_name);
    expect(fkNames).toContain("users_warehouse_id_warehouses_id_fk");
  });

  it("Scenario B: Upgrade from Phase 2.1 schema to Phase 3 with existing data preservation", async () => {
    const db = new PGlite();

    // 1. Run Phase 2.1 migration
    const m0 = readMigration("0000_cheerful_giant_girl.sql");
    for (const st of m0.split("--> statement-breakpoint").filter((s) => s.trim())) {
      await db.exec(st);
    }

    // 2. Insert existing Phase 2.1 user and session data
    await db.exec(`
      INSERT INTO users (id, email, name, password_hash, role, active)
      VALUES ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'admin@maxiofertas.cl', 'Admin Existente', 'hash123', 'ADMIN', true);
    `);

    await db.exec(`
      INSERT INTO sessions (id, user_id, token, expires_at)
      VALUES ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'token_hash_xyz', NOW() + INTERVAL '7 days');
    `);

    // 3. Apply Phase 3 upgrade migration
    const m1 = readMigration("0001_sharp_reptil.sql");
    for (const st of m1.split("--> statement-breakpoint").filter((s) => s.trim())) {
      await db.exec(st);
    }

    // 4. Verify existing user and session remained intact
    const userRes = await db.query("SELECT * FROM users WHERE email = 'admin@maxiofertas.cl';");
    expect(userRes.rows).toHaveLength(1);

    const sessionRes = await db.query("SELECT * FROM sessions WHERE token = 'token_hash_xyz';");
    expect(sessionRes.rows).toHaveLength(1);

    // 5. Create warehouse and link to existing user
    await db.exec(`
      INSERT INTO warehouses (id, code, name, active)
      VALUES ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03', 'CENTRAL', 'Bodega Central', true);
    `);

    await db.exec(`
      UPDATE users SET warehouse_id = 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03'
      WHERE id = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01';
    `);

    const updatedUserRes = await db.query<{ warehouse_id: string }>(
      "SELECT warehouse_id FROM users WHERE id = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01';"
    );
    expect(updatedUserRes.rows[0].warehouse_id).toBe("e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03");
  });
});
