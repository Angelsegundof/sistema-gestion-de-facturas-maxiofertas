import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import * as fs from "fs";
import * as path from "path";
import { hashPassword, verifyPassword } from "../src/lib/auth/crypto";
import { QA_PASSWORD_PLAIN } from "../src/lib/db/seed-qa";
import { hasPermission } from "../src/domain/permissions";

describe("QA-001 & QA-002: QA Local Authentication & Role Isolation", () => {
  let pg: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  const readMigration = (fileName: string) => {
    const fullPath = path.resolve(__dirname, `../src/lib/db/migrations/${fileName}`);
    return fs.readFileSync(fullPath, "utf8");
  };

  beforeEach(async () => {
    pg = new PGlite();
    db = drizzle(pg, { schema });

    const migrations = [
      "0000_cheerful_giant_girl.sql",
      "0001_sharp_reptil.sql",
      "0002_concerned_molly_hayes.sql",
      "0003_rapid_boomerang.sql",
      "0004_wet_mulholland_black.sql",
      "0005_uneven_lady_bullseye.sql",
      "0006_shallow_skaar.sql",
    ];

    for (const m of migrations) {
      const sqlContent = readMigration(m);
      for (const st of sqlContent.split("--> statement-breakpoint").filter((s) => s.trim())) {
        await pg.exec(st);
      }
    }

    // Seed Warehouses
    await db.insert(schema.warehouses).values([
      { id: "c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01", code: "CENTRAL", name: "Santiago Central", active: true },
      { id: "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02", code: "NORTE", name: "Bodega Norte", active: true },
    ]);

    const passwordHash = await hashPassword(QA_PASSWORD_PLAIN);

    // Seed QA Users
    await db.insert(schema.users).values([
      {
        id: "d1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
        email: "solicitante@maxiofertas.cl",
        name: "Juan Solicitante (Central)",
        passwordHash,
        role: "WAREHOUSE_USER",
        warehouseId: "c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
        active: true,
      },
      {
        id: "d2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
        email: "solicitante.norte@maxiofertas.cl",
        name: "Pedro Solicitante (Norte)",
        passwordHash,
        role: "WAREHOUSE_USER",
        warehouseId: "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
        active: true,
      },
      {
        id: "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a03",
        email: "ejecutor@maxiofertas.cl",
        name: "María Ejecutora de Facturas",
        passwordHash,
        role: "INVOICE_EXECUTOR",
        warehouseId: null,
        active: true,
      },
      {
        id: "d4eebc99-9c0b-4ef8-bb6d-6bb9bd380a04",
        email: "jefatura@maxiofertas.cl",
        name: "Carlos Jefatura Operaciones",
        passwordHash,
        role: "MANAGEMENT",
        warehouseId: null,
        active: true,
      },
      {
        id: "d5eebc99-9c0b-4ef8-bb6d-6bb9bd380a05",
        email: "admin@maxiofertas.cl",
        name: "Administrador General",
        passwordHash,
        role: "ADMIN",
        warehouseId: null,
        active: true,
      },
    ]);
  });

  it("1. Solicitante Central: Autentica con éxito y recibe rol WAREHOUSE_USER con bodega CENTRAL", async () => {
    const user = (
      await db.select().from(schema.users).where(eq(schema.users.email, "solicitante@maxiofertas.cl"))
    )[0];

    expect(user).toBeDefined();
    expect(user.role).toBe("WAREHOUSE_USER");
    expect(user.warehouseId).toBe("c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01");
    const passValid = await verifyPassword(QA_PASSWORD_PLAIN, user.passwordHash);
    expect(passValid).toBe(true);

    expect(hasPermission(user.role, "REQUEST_CREATE")).toBe(true);
    expect(hasPermission(user.role, "REQUEST_CLAIM")).toBe(false);
    expect(hasPermission(user.role, "STATS_VIEW")).toBe(false);
  });

  it("2. Solicitante Norte: Autentica con éxito y recibe rol WAREHOUSE_USER con bodega NORTE", async () => {
    const user = (
      await db.select().from(schema.users).where(eq(schema.users.email, "solicitante.norte@maxiofertas.cl"))
    )[0];

    expect(user).toBeDefined();
    expect(user.role).toBe("WAREHOUSE_USER");
    expect(user.warehouseId).toBe("c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a02");
    const passValid = await verifyPassword(QA_PASSWORD_PLAIN, user.passwordHash);
    expect(passValid).toBe(true);
  });

  it("3. Ejecutor: Autentica con éxito y recibe rol INVOICE_EXECUTOR", async () => {
    const user = (
      await db.select().from(schema.users).where(eq(schema.users.email, "ejecutor@maxiofertas.cl"))
    )[0];

    expect(user).toBeDefined();
    expect(user.role).toBe("INVOICE_EXECUTOR");
    const passValid = await verifyPassword(QA_PASSWORD_PLAIN, user.passwordHash);
    expect(passValid).toBe(true);

    expect(hasPermission(user.role, "REQUEST_CLAIM")).toBe(true);
    expect(hasPermission(user.role, "INVOICE_FINALIZE")).toBe(true);
    expect(hasPermission(user.role, "RECTIFICATION_CLAIM")).toBe(true);
  });

  it("4. Jefatura: Autentica con éxito y recibe rol MANAGEMENT", async () => {
    const user = (
      await db.select().from(schema.users).where(eq(schema.users.email, "jefatura@maxiofertas.cl"))
    )[0];

    expect(user).toBeDefined();
    expect(user.role).toBe("MANAGEMENT");
    const passValid = await verifyPassword(QA_PASSWORD_PLAIN, user.passwordHash);
    expect(passValid).toBe(true);

    expect(hasPermission(user.role, "STATS_VIEW")).toBe(true);
    expect(hasPermission(user.role, "INVOICE_FINALIZE")).toBe(false);
  });

  it("5. Administrador: Autentica con éxito y recibe rol ADMIN", async () => {
    const user = (
      await db.select().from(schema.users).where(eq(schema.users.email, "admin@maxiofertas.cl"))
    )[0];

    expect(user).toBeDefined();
    expect(user.role).toBe("ADMIN");
    const passValid = await verifyPassword(QA_PASSWORD_PLAIN, user.passwordHash);
    expect(passValid).toBe(true);

    expect(hasPermission(user.role, "USER_MANAGE")).toBe(true);
    expect(hasPermission(user.role, "STATS_VIEW")).toBe(true);
  });

  it("6. Aislamiento de seguridad: WAREHOUSE_USER no puede acceder a funciones de ADMIN ni emitir facturas", () => {
    expect(hasPermission("WAREHOUSE_USER", "USER_MANAGE")).toBe(false);
    expect(hasPermission("WAREHOUSE_USER", "INVOICE_FINALIZE")).toBe(false);
    expect(hasPermission("WAREHOUSE_USER", "STATS_VIEW")).toBe(false);
  });
});
