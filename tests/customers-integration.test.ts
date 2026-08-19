import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { normalizeRut, formatRut } from "@/lib/validation/rut";
import * as fs from "fs";
import * as path from "path";

describe("Customers Domain Integration & Concurrency Tests (Real PostgreSQL)", () => {
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

  it("should create customer and enforce canonical RUT uniqueness in PostgreSQL", async () => {
    const rawRut = "76.432.109-K";
    const canonical = normalizeRut(rawRut);
    const display = formatRut(rawRut);

    const [c1] = await db
      .insert(schema.customers)
      .values({
        rutCanonical: canonical,
        rutDisplay: display,
        legalName: "Inversiones Maxiofertas SPA",
        businessActivity: "Venta Mayorista",
        email: "contacto@maxiofertas.cl",
        active: true,
      })
      .returning();

    expect(c1.id).toBeDefined();
    expect(c1.rutCanonical).toBe("76432109K");

    // Second insert with different formatting but same canonical RUT rejected by DB constraint
    await expect(
      db.insert(schema.customers).values({
        rutCanonical: "76432109K",
        rutDisplay: "76432109-k",
        legalName: "Duplicado Inversiones",
        businessActivity: "Giro",
        active: true,
      })
    ).rejects.toThrow();
  });

  it("34. Concurrency test: Parallel requests creating the same RUT resolve to a single customer", async () => {
    const rawRut = "11.111.111-1";
    const canonical = normalizeRut(rawRut);
    const display = formatRut(rawRut);

    const createCustomerSafe = async (legalName: string) => {
      const [result] = await db
        .insert(schema.customers)
        .values({
          rutCanonical: canonical,
          rutDisplay: display,
          legalName,
          businessActivity: "Comercio",
          active: true,
        })
        .onConflictDoUpdate({
          target: schema.customers.rutCanonical,
          set: {
            legalName,
            updatedAt: new Date(),
          },
        })
        .returning();
      return result;
    };

    const [resA, resB] = await Promise.all([
      createCustomerSafe("Empresa A (Hilo 1)"),
      createCustomerSafe("Empresa A (Hilo 2)"),
    ]);

    expect(resA.id).toBe(resB.id);

    // Confirm only ONE record exists in PostgreSQL
    const allCustomers = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.rutCanonical, canonical));

    expect(allCustomers).toHaveLength(1);
    expect(allCustomers[0].rutCanonical).toBe("111111111");
  });

  it("should query customer by canonical RUT and support autocompletion data retrieval", async () => {
    await db.insert(schema.customers).values({
      rutCanonical: "55555555",
      rutDisplay: "5.555.555-5",
      legalName: "Distribuidora del Sur Ltda",
      businessActivity: "Distribuci?n de Materiales",
      phone: "+56912345678",
      email: "ventas@delsur.cl",
      active: true,
    });

    const [found] = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.rutCanonical, normalizeRut("5.555.555-5")))
      .limit(1);

    expect(found).toBeDefined();
    expect(found.legalName).toBe("Distribuidora del Sur Ltda");
    expect(found.phone).toBe("+56912345678");
  });
});
