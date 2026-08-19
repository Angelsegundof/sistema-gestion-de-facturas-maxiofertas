import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import * as fs from "fs";
import * as path from "path";

describe("Warehouses Domain Integration Tests (Real PostgreSQL)", () => {
  let pglite: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(async () => {
    pglite = new PGlite();
    db = drizzle(pglite, { schema });

    const migrations = ["0000_cheerful_giant_girl.sql", "0001_sharp_reptil.sql"];
    for (const file of migrations) {
      const sqlContent = fs.readFileSync(
        path.resolve(__dirname, `../src/lib/db/migrations/${file}`),
        "utf8"
      );
      for (const st of sqlContent.split("--> statement-breakpoint").filter((s) => s.trim())) {
        await pglite.exec(st);
      }
    }
  });

  it("should create and query warehouses with unique code constraint", async () => {
    const [w1] = await db
      .insert(schema.warehouses)
      .values({ code: "STGO-01", name: "Bodega Santiago Central", active: true })
      .returning();

    expect(w1.id).toBeDefined();
    expect(w1.code).toBe("STGO-01");

    // Duplicate code rejected by PostgreSQL UNIQUE constraint
    await expect(
      db.insert(schema.warehouses).values({ code: "STGO-01", name: "Otra Bodega", active: true })
    ).rejects.toThrow();
  });

  it("should link user to warehouse via foreign key and handle deactivation cleanly", async () => {
    const [warehouse] = await db
      .insert(schema.warehouses)
      .values({ code: "OSORNO-01", name: "Bodega Osorno", active: true })
      .returning();

    const [user] = await db
      .insert(schema.users)
      .values({
        email: "bodega.osorno@maxiofertas.cl",
        name: "Operador Osorno",
        passwordHash: "hash123",
        role: "WAREHOUSE_USER",
        warehouseId: warehouse.id,
        active: true,
      })
      .returning();

    expect(user.warehouseId).toBe(warehouse.id);

    // Deactivate warehouse (active = false) preserving user history
    await db
      .update(schema.warehouses)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(schema.warehouses.id, warehouse.id));

    const [updatedWarehouse] = await db
      .select()
      .from(schema.warehouses)
      .where(eq(schema.warehouses.id, warehouse.id));
    expect(updatedWarehouse.active).toBe(false);

    const [userAfter] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, user.id));
    expect(userAfter.warehouseId).toBe(warehouse.id);
  });
});
