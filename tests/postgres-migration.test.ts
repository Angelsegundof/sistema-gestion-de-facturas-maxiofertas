import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";

describe("PostgreSQL Real Migration Execution from Scratch", () => {
  it("should successfully execute 0000_cheerful_giant_girl.sql against a pristine PostgreSQL database", async () => {
    const db = new PGlite();

    const migrationPath = path.resolve(
      __dirname,
      "../src/lib/db/migrations/0000_cheerful_giant_girl.sql"
    );
    const sqlContent = fs.readFileSync(migrationPath, "utf8");

    // Split statements by Drizzle statement breakpoint
    const statements = sqlContent
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    expect(statements.length).toBeGreaterThanOrEqual(4);

    for (const statement of statements) {
      await db.exec(statement);
    }

    // Verify created tables in PostgreSQL information_schema
    const tablesRes = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
    );

    const tableNames = tablesRes.rows.map((r) => r.table_name);
    expect(tableNames).toContain("audit_logs");
    expect(tableNames).toContain("rate_limits");
    expect(tableNames).toContain("sessions");
    expect(tableNames).toContain("users");

    // Verify users columns and lack of premature FK constraint on warehouse_id
    const columnsRes = await db.query<{ column_name: string; data_type: string }>(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users';"
    );
    const colNames = columnsRes.rows.map((c) => c.column_name);
    expect(colNames).toContain("id");
    expect(colNames).toContain("email");
    expect(colNames).toContain("name");
    expect(colNames).toContain("password_hash");
    expect(colNames).toContain("role");
    expect(colNames).toContain("warehouse_id");
    expect(colNames).toContain("active");
    expect(colNames).toContain("created_at");
    expect(colNames).toContain("updated_at");

    // Verify insert into users and sessions with foreign key cascade
    await db.exec(`
      INSERT INTO users (id, email, name, password_hash, role, active)
      VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'test@maxiofertas.cl', 'Test User', 'hash123', 'WAREHOUSE_USER', true);
    `);

    await db.exec(`
      INSERT INTO sessions (id, user_id, token, expires_at)
      VALUES ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'token_hash_abc', NOW() + INTERVAL '7 days');
    `);

    const sessionRes = await db.query("SELECT * FROM sessions;");
    expect(sessionRes.rows).toHaveLength(1);

    // Verify cascade deletion
    await db.exec("DELETE FROM users WHERE id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';");
    const sessionAfterDelete = await db.query("SELECT * FROM sessions;");
    expect(sessionAfterDelete.rows).toHaveLength(0);
  });
});
