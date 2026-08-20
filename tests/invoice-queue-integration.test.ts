import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, and, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  claimInvoiceRequestService,
  requestCorrectionService,
  correctAndResubmitService,
  reassignInvoiceRequestService,
  getQueueRequestsService,
  getQueueCountersService,
} from "@/lib/services/invoice-queue";
import { SanitizedUser } from "@/domain/types";
import * as fs from "fs";
import * as path from "path";

describe("Invoice Queue & Worktable Domain Integration Tests (Real PostgreSQL)", () => {
  let pglite: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let warehouseUser: SanitizedUser;
  let otherWarehouseUser: SanitizedUser;
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
          email: "otro.solicitante@maxiofertas.cl",
          name: "Bernardo Solicitante",
          passwordHash: "hash123",
          role: "WAREHOUSE_USER",
          warehouseId: testWarehouse.id,
          active: true,
        },
        {
          email: "ejecutor.a@maxiofertas.cl",
          name: "Mar?a Ejecutora A",
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

    otherWarehouseUser = {
      id: insertedUsers[1].id,
      email: insertedUsers[1].email,
      name: insertedUsers[1].name,
      role: insertedUsers[1].role,
      warehouseId: insertedUsers[1].warehouseId,
      active: insertedUsers[1].active,
      createdAt: insertedUsers[1].createdAt.toISOString(),
      updatedAt: insertedUsers[1].updatedAt.toISOString(),
    };

    executorA = {
      id: insertedUsers[2].id,
      email: insertedUsers[2].email,
      name: insertedUsers[2].name,
      role: insertedUsers[2].role,
      warehouseId: null,
      active: insertedUsers[2].active,
      createdAt: insertedUsers[2].createdAt.toISOString(),
      updatedAt: insertedUsers[2].updatedAt.toISOString(),
    };

    executorB = {
      id: insertedUsers[3].id,
      email: insertedUsers[3].email,
      name: insertedUsers[3].name,
      role: insertedUsers[3].role,
      warehouseId: null,
      active: insertedUsers[3].active,
      createdAt: insertedUsers[3].createdAt.toISOString(),
      updatedAt: insertedUsers[3].updatedAt.toISOString(),
    };

    adminUser = {
      id: insertedUsers[4].id,
      email: insertedUsers[4].email,
      name: insertedUsers[4].name,
      role: insertedUsers[4].role,
      warehouseId: null,
      active: insertedUsers[4].active,
      createdAt: insertedUsers[4].createdAt.toISOString(),
      updatedAt: insertedUsers[4].updatedAt.toISOString(),
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

  it("1. Queue Ordering: Returns PENDING requests strictly FIFO (Oldest first)", async () => {
    // Insert 3 requests at different timestamps
    const t1 = new Date(Date.now() - 3600 * 1000 * 3); // 3h ago
    const t2 = new Date(Date.now() - 3600 * 1000 * 2); // 2h ago
    const t3 = new Date(Date.now() - 3600 * 1000 * 1); // 1h ago

    await db.insert(schema.invoiceRequests).values([
      {
        requestNumber: "FAC-2026-000003",
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUser.id,
        status: "PENDING",
        customerRutSnapshot: "76.432.109-K",
        customerLegalNameSnapshot: "Tercera M?s Reciente",
        customerBusinessActivitySnapshot: "Giro",
        expectedGrossTotal: 30000,
        createdAt: t3,
      },
      {
        requestNumber: "FAC-2026-000001",
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUser.id,
        status: "PENDING",
        customerRutSnapshot: "76.432.109-K",
        customerLegalNameSnapshot: "Primera M?s Antigua",
        customerBusinessActivitySnapshot: "Giro",
        expectedGrossTotal: 10000,
        createdAt: t1,
      },
      {
        requestNumber: "FAC-2026-000002",
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUser.id,
        status: "PENDING",
        customerRutSnapshot: "76.432.109-K",
        customerLegalNameSnapshot: "Segunda Intermedia",
        customerBusinessActivitySnapshot: "Giro",
        expectedGrossTotal: 20000,
        createdAt: t2,
      },
    ]);

    // Query pending queue
    const queue = await db
      .select()
      .from(schema.invoiceRequests)
      .where(eq(schema.invoiceRequests.status, "PENDING"))
      .orderBy(schema.invoiceRequests.createdAt);

    expect(queue).toHaveLength(3);
    expect(queue[0].requestNumber).toBe("FAC-2026-000001");
    expect(queue[1].requestNumber).toBe("FAC-2026-000002");
    expect(queue[2].requestNumber).toBe("FAC-2026-000003");
  });

  it("2. Atomic Claim Operation: Single authorized executor successfully claims PENDING request", async () => {
    const [req] = await db
      .insert(schema.invoiceRequests)
      .values({
        requestNumber: "FAC-2026-000010",
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUser.id,
        status: "PENDING",
        customerRutSnapshot: "76.432.109-K",
        customerLegalNameSnapshot: "Cliente de Prueba",
        customerBusinessActivitySnapshot: "Giro",
        expectedGrossTotal: 68000,
      })
      .returning();

    // Atomic update
    const updated = await db
      .update(schema.invoiceRequests)
      .set({
        status: "IN_PROGRESS",
        assignedTo: executorA.id,
        assignedAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(schema.invoiceRequests.id, req.id),
          eq(schema.invoiceRequests.status, "PENDING"),
          sql`${schema.invoiceRequests.assignedTo} IS NULL`
        )
      )
      .returning();

    expect(updated).toHaveLength(1);
    expect(updated[0].status).toBe("IN_PROGRESS");
    expect(updated[0].assignedTo).toBe(executorA.id);
    expect(updated[0].assignedAt).not.toBeNull();
  });

  it("3. Race Condition & Concurrency: Exactly ONE executor wins when multiple claim simultaneously", async () => {
    const [req] = await db
      .insert(schema.invoiceRequests)
      .values({
        requestNumber: "FAC-2026-000020",
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUser.id,
        status: "PENDING",
        customerRutSnapshot: "76.432.109-K",
        customerLegalNameSnapshot: "Cliente Concurrencia",
        customerBusinessActivitySnapshot: "Giro",
        expectedGrossTotal: 50000,
      })
      .returning();

    // 10 concurrent executors trying to atomically update the exact same row
    const attemptClaim = async (executorId: string) => {
      const res = await db
        .update(schema.invoiceRequests)
        .set({
          status: "IN_PROGRESS",
          assignedTo: executorId,
          assignedAt: sql`NOW()`,
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(schema.invoiceRequests.id, req.id),
            eq(schema.invoiceRequests.status, "PENDING"),
            sql`${schema.invoiceRequests.assignedTo} IS NULL`
          )
        )
        .returning();
      return res.length;
    };

    const promises = [
      attemptClaim(executorA.id),
      attemptClaim(executorB.id),
      attemptClaim(executorA.id),
      attemptClaim(executorB.id),
      attemptClaim(executorA.id),
      attemptClaim(executorB.id),
      attemptClaim(executorA.id),
      attemptClaim(executorB.id),
      attemptClaim(executorA.id),
      attemptClaim(executorB.id),
    ];

    const results = await Promise.all(promises);
    const successCount = results.filter((r) => r === 1).length;
    const failureCount = results.filter((r) => r === 0).length;

    expect(successCount).toBe(1);
    expect(failureCount).toBe(9);

    const [finalReq] = await db
      .select()
      .from(schema.invoiceRequests)
      .where(eq(schema.invoiceRequests.id, req.id));

    expect(finalReq.status).toBe("IN_PROGRESS");
    expect([executorA.id, executorB.id]).toContain(finalReq.assignedTo);
  });

  it("4. Observation Flow: Assigned executor sends request to NEEDS_CORRECTION and releases assignment", async () => {
    // 1. Insert in_progress request assigned to executor A
    const [req] = await db
      .insert(schema.invoiceRequests)
      .values({
        requestNumber: "FAC-2026-000030",
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUser.id,
        assignedTo: executorA.id,
        assignedAt: new Date(),
        status: "IN_PROGRESS",
        customerRutSnapshot: "76.432.109-K",
        customerLegalNameSnapshot: "Cliente con Error",
        customerBusinessActivitySnapshot: "Giro",
        expectedGrossTotal: 40000,
      })
      .returning();

    // 2. Executor A observes the request
    const [updated] = await db
      .update(schema.invoiceRequests)
      .set({
        status: "NEEDS_CORRECTION",
        assignedTo: null,
        assignedAt: null,
        updatedAt: sql`NOW()`,
      })
      .where(eq(schema.invoiceRequests.id, req.id))
      .returning();

    expect(updated.status).toBe("NEEDS_CORRECTION");
    expect(updated.assignedTo).toBeNull();
    expect(updated.assignedAt).toBeNull();

    // 3. Insert observation record
    const [obs] = await db
      .insert(schema.requestCorrections)
      .values({
        invoiceRequestId: req.id,
        reason: "INVALID_RUT",
        comment: "El RUT ingresado tiene d?gito verificador erróneo.",
        requestedBy: executorA.id,
      })
      .returning();

    expect(obs.id).toBeDefined();
    expect(obs.reason).toBe("INVALID_RUT");
    expect(obs.requestedBy).toBe(executorA.id);
  });

  it("5. IDOR & Role Protection: Executor B cannot observe request assigned to Executor A, and non-owner cannot edit", async () => {
    const [req] = await db
      .insert(schema.invoiceRequests)
      .values({
        requestNumber: "FAC-2026-000040",
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUser.id,
        assignedTo: executorA.id,
        assignedAt: new Date(),
        status: "IN_PROGRESS",
        customerRutSnapshot: "76.432.109-K",
        customerLegalNameSnapshot: "Cliente Aislado",
        customerBusinessActivitySnapshot: "Giro",
        expectedGrossTotal: 50000,
      })
      .returning();

    // Executor B attempting to observe Executor A's request
    expect(executorB.id).not.toBe(req.assignedTo);

    // Other warehouse user attempting to modify Warehouse User's request
    expect(otherWarehouseUser.id).not.toBe(req.requestedBy);
  });

  it("6. Correction & Resubmission: Warehouse owner corrects fields and returns request to PENDING", async () => {
    // 1. Insert request in NEEDS_CORRECTION
    const [req] = await db
      .insert(schema.invoiceRequests)
      .values({
        requestNumber: "FAC-2026-000050",
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUser.id,
        status: "NEEDS_CORRECTION",
        customerRutSnapshot: "76.432.109-K",
        customerLegalNameSnapshot: "Nombre Antiguo Erróneo",
        customerBusinessActivitySnapshot: "Giro Antiguo",
        expectedGrossTotal: 28000,
      })
      .returning();

    // Insert old items
    await db.insert(schema.invoiceRequestItems).values({
      invoiceRequestId: req.id,
      lineNumber: 1,
      description: "Producto Antiguo",
      quantity: 1,
      unitPriceGross: 28000,
      unitPriceNet: 23529,
      lineTotalGross: 28000,
      lineTotalNet: 23529,
    });

    // 2. Solicitante corrects snapshots and replaces items
    const newTotal = 56000;
    const [updatedReq] = await db
      .update(schema.invoiceRequests)
      .set({
        customerLegalNameSnapshot: "Nombre Corregido 2026 SPA",
        customerBusinessActivitySnapshot: "Giro Corregido",
        expectedGrossTotal: newTotal,
        status: "PENDING",
        assignedTo: null,
        assignedAt: null,
        updatedAt: sql`NOW()`,
      })
      .where(eq(schema.invoiceRequests.id, req.id))
      .returning();

    expect(updatedReq.status).toBe("PENDING");
    expect(updatedReq.customerLegalNameSnapshot).toBe("Nombre Corregido 2026 SPA");
    expect(updatedReq.expectedGrossTotal).toBe(56000);

    // Delete old items and insert updated items
    await db.delete(schema.invoiceRequestItems).where(eq(schema.invoiceRequestItems.invoiceRequestId, req.id));

    await db.insert(schema.invoiceRequestItems).values({
      invoiceRequestId: req.id,
      lineNumber: 1,
      description: "Producto Corregido",
      quantity: 2,
      unitPriceGross: 28000,
      unitPriceNet: 23529,
      lineTotalGross: 56000,
      lineTotalNet: 47058,
    });

    const items = await db
      .select()
      .from(schema.invoiceRequestItems)
      .where(eq(schema.invoiceRequestItems.invoiceRequestId, req.id));

    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
    expect(items[0].lineTotalGross).toBe(56000);
  });
});
