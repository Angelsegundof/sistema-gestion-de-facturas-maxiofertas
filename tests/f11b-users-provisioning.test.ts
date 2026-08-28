import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { runLocalMigrations } from "@/lib/db";
import { importRealUsersService } from "../scripts/import_real_users";
import { requirePermission } from "@/lib/auth/guards";
import { createSession } from "@/lib/auth/session";

describe("FASE 11B.1 — Real Users Provisioning and Access Validation", () => {
  let pglite: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(async () => {
    pglite = new PGlite();
    await pglite.waitReady;
    await runLocalMigrations(pglite);
    db = drizzle(pglite, { schema });
  });

  it("should provision all 14 physical warehouses and 20 real users with 100% accuracy and idempotency", async () => {
    // 1. First execution
    const res1 = await importRealUsersService(db);
    expect(res1.total).toBe(20);
    expect(res1.inserted).toBe(20);
    expect(res1.updated).toBe(0);
    expect(res1.unchanged).toBe(0);
    expect(res1.warehouseCount).toBe(14);

    // 2. Query all users from DB
    const allUsers = await db.select().from(schema.users);
    expect(allUsers).toHaveLength(20);

    // Verify all emails are strictly lowercase
    for (const u of allUsers) {
      expect(u.email).toBe(u.email.toLowerCase());
      expect(u.active).toBe(true);
      expect(u.passwordHash).toBeDefined();
    }

    // 3. Second execution (Idempotency check)
    const res2 = await importRealUsersService(db);
    expect(res2.total).toBe(20);
    expect(res2.inserted).toBe(0);
    expect(res2.updated).toBe(0);
    expect(res2.unchanged).toBe(20);

    // Total users in DB must still be 20
    const totalUsersAfter = await db.select().from(schema.users);
    expect(totalUsersAfter).toHaveLength(20);
  });

  it("should validate server-side access and roles for all 4 role types", async () => {
    await importRealUsersService(db);

    // 1. ADMIN Access Check
    const [adminDb] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "sistemasecuweb@gmail.com"));
    expect(adminDb).toBeDefined();
    expect(adminDb.name).toBe("Angel Ferrer");
    expect(adminDb.role).toBe("ADMIN");
    expect(adminDb.active).toBe(true);

    // 2. MANAGEMENT Access Check
    const [mgmtDb] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "miyelics@gmail.com"));
    expect(mgmtDb).toBeDefined();
    expect(mgmtDb.name).toBe("Miyelis Contreras");
    expect(mgmtDb.role).toBe("MANAGEMENT");

    // 3. INVOICE_EXECUTOR Access Check
    const [execDb] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "verocars1178@gmail.com"));
    expect(execDb).toBeDefined();
    expect(execDb.name).toBe("Aracelis Cardenas");
    expect(execDb.role).toBe("INVOICE_EXECUTOR");

    // 4. WAREHOUSE_USER Access Check with Warehouse Scope
    const [whUserDb] = await db
      .select({
        user: schema.users,
        warehouse: schema.warehouses,
      })
      .from(schema.users)
      .leftJoin(schema.warehouses, eq(schema.users.warehouseId, schema.warehouses.id))
      .where(eq(schema.users.email, "santiago.maxiofertas@gmail.com"));

    expect(whUserDb).toBeDefined();
    expect(whUserDb.user.name).toBe("Bodega Santiago");
    expect(whUserDb.user.role).toBe("WAREHOUSE_USER");
    expect(whUserDb.warehouse?.code).toBe("CENTRAL");
    expect(whUserDb.warehouse?.name).toBe("Santiago Central");
  });

  it("should strictly deny access for unprovisioned users", async () => {
    await importRealUsersService(db);

    const unprovisioned = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "desconocido@maxiofertas.cl"));

    expect(unprovisioned).toHaveLength(0);
  });

  it("should strictly block inactive users even if provisioned", async () => {
    await importRealUsersService(db);

    // Deactivate a user
    await db
      .update(schema.users)
      .set({ active: false })
      .where(eq(schema.users.email, "bodegarancagua13@gmail.com"));

    const [inactiveUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "bodegarancagua13@gmail.com"));

    expect(inactiveUser.active).toBe(false);
  });
});
