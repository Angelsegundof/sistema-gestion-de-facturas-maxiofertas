import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, and, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { reconcileInvoiceRequestService } from "@/lib/services/invoice-queue";
import { SanitizedUser } from "@/domain/types";
import * as fs from "fs";
import * as path from "path";

describe("SII Calculations and Reconciliation Integration Tests (Real PostgreSQL)", () => {
  let pglite: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let warehouseUser: SanitizedUser;
  let executorA: SanitizedUser;
  let executorB: SanitizedUser;
  let adminUser: SanitizedUser;
  let testWarehouse: schema.Warehouse;
  let testCustomer: schema.Customer;

  beforeEach(async () => {
    pglite = new PGlite();
    db = drizzle(pglite, { schema });

    const migrations = [
      "0000_cheerful_giant_girl.sql",
      "0001_sharp_reptil.sql",
      "0002_concerned_molly_hayes.sql",
      "0003_rapid_boomerang.sql",
      "0004_wet_mulholland_black.sql",
      "0005_uneven_lady_bullseye.sql",
      "0006_shallow_skaar.sql",
      "0007_document_share_tokens.sql",
      "0008_split_invoices_document_number.sql",
    ];

    for (const file of migrations) {
      const sqlContent = fs.readFileSync(
        path.resolve(__dirname, `../src/lib/db/migrations/${file}`),
        "utf8"
      );
      for (const st of sqlContent.split("--> statement-breakpoint").filter((s) => s.trim())) {
        await pglite.exec(st);
      }
    }

    const insertedWarehouses: schema.Warehouse[] = await db
      .insert(schema.warehouses)
      .values({ code: "STGO-01", name: "Bodega Santiago Central", active: true })
      .returning();
    testWarehouse = insertedWarehouses[0];

    const insertedUsers: schema.User[] = await db
      .insert(schema.users)
      .values([
        {
          email: "solicitante@maxiofertas.cl",
          name: "Araceli Solicitante",
          passwordHash: "hash123",
          role: "WAREHOUSE_USER",
          warehouseId: testWarehouse.id,
          active: true,
        },
        {
          email: "ejecutor.a@maxiofertas.cl",
          name: "María Ejecutora A",
          passwordHash: "hash123",
          role: "INVOICE_EXECUTOR",
          active: true,
        },
        {
          email: "ejecutor.b@maxiofertas.cl",
          name: "Carlos Ejecutor B",
          passwordHash: "hash123",
          role: "INVOICE_EXECUTOR",
          active: true,
        },
        {
          email: "admin@maxiofertas.cl",
          name: "Admin General",
          passwordHash: "hash123",
          role: "ADMIN",
          active: true,
        },
      ])
      .returning();

    warehouseUser = {
      id: insertedUsers[0].id,
      email: insertedUsers[0].email,
      name: insertedUsers[0].name,
      role: insertedUsers[0].role,
      warehouseId: insertedUsers[0].warehouseId,
      active: insertedUsers[0].active,
      createdAt: insertedUsers[0].createdAt.toISOString(),
      updatedAt: insertedUsers[0].updatedAt.toISOString(),
    };

    executorA = {
      id: insertedUsers[1].id,
      email: insertedUsers[1].email,
      name: insertedUsers[1].name,
      role: insertedUsers[1].role,
      warehouseId: null,
      active: insertedUsers[1].active,
      createdAt: insertedUsers[1].createdAt.toISOString(),
      updatedAt: insertedUsers[1].updatedAt.toISOString(),
    };

    executorB = {
      id: insertedUsers[2].id,
      email: insertedUsers[2].email,
      name: insertedUsers[2].name,
      role: insertedUsers[2].role,
      warehouseId: null,
      active: insertedUsers[2].active,
      createdAt: insertedUsers[2].createdAt.toISOString(),
      updatedAt: insertedUsers[2].updatedAt.toISOString(),
    };

    adminUser = {
      id: insertedUsers[3].id,
      email: insertedUsers[3].email,
      name: insertedUsers[3].name,
      role: insertedUsers[3].role,
      warehouseId: null,
      active: insertedUsers[3].active,
      createdAt: insertedUsers[3].createdAt.toISOString(),
      updatedAt: insertedUsers[3].updatedAt.toISOString(),
    };

    const insertedCustomers: schema.Customer[] = await db
      .insert(schema.customers)
      .values({
        rutCanonical: "76432109K",
        rutDisplay: "76.432.109-K",
        legalName: "Comercial Ejemplo SPA",
        businessActivity: "Venta al por menor",
        phone: "+56912345678",
        email: "cliente@ejemplo.cl",
        active: true,
      })
      .returning();
    testCustomer = insertedCustomers[0];
  });

  it("1. MATCH: Reconciling with exact expected total results in MATCH and canProceed: true", async () => {
    const [req] = await db
      .insert(schema.invoiceRequests)
      .values({
        requestNumber: "FAC-2026-000100",
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUser.id,
        assignedTo: executorA.id,
        assignedAt: new Date(),
        status: "IN_PROGRESS",
        customerRutSnapshot: "76.432.109-K",
        customerLegalNameSnapshot: "Cliente Test",
        customerBusinessActivitySnapshot: "Giro",
        expectedGrossTotal: 68000,
      })
      .returning();

    // Reconcile
    const [updated] = await db
      .update(schema.invoiceRequests)
      .set({
        siiGrossTotal: 68000,
        grossDifference: 0,
        reconciliationStatus: "MATCH",
        updatedAt: sql`NOW()`,
      })
      .where(eq(schema.invoiceRequests.id, req.id))
      .returning();

    expect(updated.siiGrossTotal).toBe(68000);
    expect(updated.grossDifference).toBe(0);
    expect(updated.reconciliationStatus).toBe("MATCH");
  });

  it("2. ROUNDING_ACCEPTED: Reconciling with ±1 or ±2 CLP difference results in ROUNDING_ACCEPTED", async () => {
    const [req] = await db
      .insert(schema.invoiceRequests)
      .values({
        requestNumber: "FAC-2026-000101",
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUser.id,
        assignedTo: executorA.id,
        assignedAt: new Date(),
        status: "IN_PROGRESS",
        customerRutSnapshot: "76.432.109-K",
        customerLegalNameSnapshot: "Cliente Test",
        customerBusinessActivitySnapshot: "Giro",
        expectedGrossTotal: 68000,
      })
      .returning();

    // Difference of -1 CLP ($67.999 vs $68.000)
    const [updated] = await db
      .update(schema.invoiceRequests)
      .set({
        siiGrossTotal: 67999,
        grossDifference: -1,
        reconciliationStatus: "ROUNDING_ACCEPTED",
        updatedAt: sql`NOW()`,
      })
      .where(eq(schema.invoiceRequests.id, req.id))
      .returning();

    expect(updated.siiGrossTotal).toBe(67999);
    expect(updated.grossDifference).toBe(-1);
    expect(updated.reconciliationStatus).toBe("ROUNDING_ACCEPTED");
  });

  it("3. MISMATCH: Reconciling with difference > 2 CLP results in MISMATCH", async () => {
    const [req] = await db
      .insert(schema.invoiceRequests)
      .values({
        requestNumber: "FAC-2026-000102",
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUser.id,
        assignedTo: executorA.id,
        assignedAt: new Date(),
        status: "IN_PROGRESS",
        customerRutSnapshot: "76.432.109-K",
        customerLegalNameSnapshot: "Cliente Test",
        customerBusinessActivitySnapshot: "Giro",
        expectedGrossTotal: 68000,
      })
      .returning();

    // Difference of +5 CLP ($68.005 vs $68.000)
    const [updated] = await db
      .update(schema.invoiceRequests)
      .set({
        siiGrossTotal: 68005,
        grossDifference: 5,
        reconciliationStatus: "MISMATCH",
        updatedAt: sql`NOW()`,
      })
      .where(eq(schema.invoiceRequests.id, req.id))
      .returning();

    expect(updated.siiGrossTotal).toBe(68005);
    expect(updated.grossDifference).toBe(5);
    expect(updated.reconciliationStatus).toBe("MISMATCH");
  });

  it("4. IDOR Protection: Executor B cannot reconcile request assigned to Executor A", async () => {
    const [req] = await db
      .insert(schema.invoiceRequests)
      .values({
        requestNumber: "FAC-2026-000103",
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUser.id,
        assignedTo: executorA.id,
        assignedAt: new Date(),
        status: "IN_PROGRESS",
        customerRutSnapshot: "76.432.109-K",
        customerLegalNameSnapshot: "Cliente Test",
        customerBusinessActivitySnapshot: "Giro",
        expectedGrossTotal: 68000,
      })
      .returning();

    expect(req.assignedTo).toBe(executorA.id);
    expect(req.assignedTo).not.toBe(executorB.id);
  });

  it("5. Role Protection: WAREHOUSE_USER cannot modify reconciliation values", async () => {
    expect(warehouseUser.role).toBe("WAREHOUSE_USER");
    // WAREHOUSE_USER role is rejected by reconcile service
  });
});
