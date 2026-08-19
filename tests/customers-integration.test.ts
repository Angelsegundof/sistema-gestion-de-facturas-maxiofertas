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

  it("8. Concurrency test: Parallel requests creating same RUT preserve existing master data without overwrite", async () => {
    const rawRut = "76.432.109-K";
    const canonical = normalizeRut(rawRut);
    const display = formatRut(rawRut);

    // 1. Existing customer in database
    await db.insert(schema.customers).values({
      rutCanonical: canonical,
      rutDisplay: display,
      legalName: "COMERCIAL ORIGINAL SPA",
      businessActivity: "Giro Original",
      active: true,
    });

    // 2. Helper implementing the safe ON CONFLICT DO NOTHING policy
    const createCustomerSafe = async (attemptedLegalName: string) => {
      const inserted = await db
        .insert(schema.customers)
        .values({
          rutCanonical: canonical,
          rutDisplay: display,
          legalName: attemptedLegalName,
          businessActivity: "Comercio",
          active: true,
        })
        .onConflictDoNothing({
          target: schema.customers.rutCanonical,
        })
        .returning();

      if (inserted.length > 0) {
        return inserted[0];
      }

      // Fetch existing without modifying
      const [existing] = await db
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.rutCanonical, canonical))
        .limit(1);

      return existing;
    };

    // 3. Concurrent requests with different names
    const [resA, resB] = await Promise.all([
      createCustomerSafe("NOMBRE A"),
      createCustomerSafe("NOMBRE B"),
    ]);

    expect(resA.id).toBe(resB.id);

    // 4. Confirm only ONE record exists in PostgreSQL and master data is intact
    const allCustomers = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.rutCanonical, canonical));

    expect(allCustomers).toHaveLength(1);
    expect(allCustomers[0].rutCanonical).toBe("76432109K");
    expect(allCustomers[0].legalName).toBe("COMERCIAL ORIGINAL SPA"); // Intact!
  });

  it("should query customer by canonical RUT and support autocompletion data retrieval", async () => {
    await db.insert(schema.customers).values({
      rutCanonical: "55555559",
      rutDisplay: "5.555.555-9",
      legalName: "Distribuidora del Sur Ltda",
      businessActivity: "Distribuci?n de Materiales",
      phone: "+56912345678",
      email: "ventas@delsur.cl",
      active: true,
    });

    const [found] = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.rutCanonical, normalizeRut("5.555.555-9")))
      .limit(1);

    expect(found).toBeDefined();
    expect(found.legalName).toBe("Distribuidora del Sur Ltda");
    expect(found.phone).toBe("+56912345678");
  });
});
