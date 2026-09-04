import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, and } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  generateRequestNumber,
  findDuplicateCandidate,
} from "@/lib/services/invoice-requests";
import { SanitizedUser } from "@/domain/types";
import * as fs from "fs";
import * as path from "path";

describe("Invoice Requests Domain Integration Tests (Real PostgreSQL)", () => {
  let pglite: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let warehouseUserA: SanitizedUser;
  let warehouseUserB: SanitizedUser;
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
      "0009_customer_delivery_status.sql",
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
          email: "solicitante.a@maxiofertas.cl",
          name: "Araceli Solicitante A",
          passwordHash: "hash123",
          role: "WAREHOUSE_USER",
          warehouseId: testWarehouse.id,
          active: true,
        },
        {
          email: "solicitante.b@maxiofertas.cl",
          name: "Bernardo Solicitante B",
          passwordHash: "hash123",
          role: "WAREHOUSE_USER",
          warehouseId: testWarehouse.id,
          active: true,
        },
      ])
      .returning();

    warehouseUserA = {
      id: insertedUsers[0].id,
      email: insertedUsers[0].email,
      name: insertedUsers[0].name,
      role: insertedUsers[0].role,
      warehouseId: insertedUsers[0].warehouseId,
      active: insertedUsers[0].active,
      createdAt: insertedUsers[0].createdAt.toISOString(),
      updatedAt: insertedUsers[0].updatedAt.toISOString(),
    };

    warehouseUserB = {
      id: insertedUsers[1].id,
      email: insertedUsers[1].email,
      name: insertedUsers[1].name,
      role: insertedUsers[1].role,
      warehouseId: insertedUsers[1].warehouseId,
      active: insertedUsers[1].active,
      createdAt: insertedUsers[1].createdAt.toISOString(),
      updatedAt: insertedUsers[1].updatedAt.toISOString(),
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

  it("1. Full creation flow: Creates invoice request with calculated items and customer snapshots", async () => {
    const requestNumber = await generateRequestNumber(db);
    expect(requestNumber).toMatch(/^FAC-\d{4}-\d{6}$/);

    const insertedRequests: schema.InvoiceRequest[] = await db
      .insert(schema.invoiceRequests)
      .values({
        requestNumber,
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUserA.id,
        status: "PENDING",
        customerRutSnapshot: testCustomer.rutDisplay,
        customerLegalNameSnapshot: testCustomer.legalName,
        customerBusinessActivitySnapshot: testCustomer.businessActivity,
        customerPhoneSnapshot: testCustomer.phone,
        customerEmailSnapshot: testCustomer.email,
        expectedGrossTotal: 68000,
        notes: "Entrega urgente en bodega",
      })
      .returning();

    const req = insertedRequests[0];
    expect(req.id).toBeDefined();
    expect(req.status).toBe("PENDING");
    expect(req.expectedGrossTotal).toBe(68000);

    // Insert Items
    await db.insert(schema.invoiceRequestItems).values([
      {
        invoiceRequestId: req.id,
        lineNumber: 1,
        description: "Toldo 3x3 estructura",
        quantity: 2,
        unitPriceGross: 28000,
        unitPriceNet: 23529,
        lineTotalGross: 56000,
        lineTotalNet: 47058,
        vatRate: "19.00",
      },
      {
        invoiceRequestId: req.id,
        lineNumber: 2,
        description: "Lateral de toldo",
        quantity: 1,
        unitPriceGross: 12000,
        unitPriceNet: 10084,
        lineTotalGross: 12000,
        lineTotalNet: 10084,
        vatRate: "19.00",
      },
    ]);

    const items = await db
      .select()
      .from(schema.invoiceRequestItems)
      .where(eq(schema.invoiceRequestItems.invoiceRequestId, req.id));

    expect(items).toHaveLength(2);
    expect(items[0].lineTotalGross + items[1].lineTotalGross).toBe(68000);
  });

  it("2. Snapshot Inmutability: Modifying customer master data does not alter existing invoice requests", async () => {
    const insertedRequests: schema.InvoiceRequest[] = await db
      .insert(schema.invoiceRequests)
      .values({
        requestNumber: "FAC-2026-000001",
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUserA.id,
        status: "PENDING",
        customerRutSnapshot: testCustomer.rutDisplay,
        customerLegalNameSnapshot: testCustomer.legalName,
        customerBusinessActivitySnapshot: testCustomer.businessActivity,
        expectedGrossTotal: 50000,
      })
      .returning();
    const req = insertedRequests[0];

    // Update customer master record
    await db
      .update(schema.customers)
      .set({
        legalName: "Nuevo Nombre Modificado 2027 SPA",
        businessActivity: "Nuevo Giro Comercial",
      })
      .where(eq(schema.customers.id, testCustomer.id));

    // Verify request snapshot remained completely intact
    const savedReqList: schema.InvoiceRequest[] = await db
      .select()
      .from(schema.invoiceRequests)
      .where(eq(schema.invoiceRequests.id, req.id));

    expect(savedReqList[0].customerLegalNameSnapshot).toBe("Comercial Ejemplo SPA");
    expect(savedReqList[0].customerBusinessActivitySnapshot).toBe("Venta al por menor");
  });

  it("3. Sequential & Unique Request Numbers: Generates collision-free identifiers", async () => {
    const numbers = new Set<string>();

    for (let i = 0; i < 5; i++) {
      const num = await generateRequestNumber(db);
      numbers.add(num);
      await db.insert(schema.invoiceRequests).values({
        requestNumber: num,
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUserA.id,
        status: "PENDING",
        customerRutSnapshot: "76.432.109-K",
        customerLegalNameSnapshot: "Test",
        customerBusinessActivitySnapshot: "Giro",
        expectedGrossTotal: 10000,
      });
    }

    expect(numbers.size).toBe(5);
  });

  it("4. Duplicate Detection Algorithm: Warns on similar recent requests within 24h", async () => {
    await db.insert(schema.invoiceRequests).values({
      requestNumber: "FAC-2026-000100",
      warehouseId: testWarehouse.id,
      customerId: testCustomer.id,
      requestedBy: warehouseUserA.id,
      status: "PENDING",
      customerRutSnapshot: "76.432.109-K",
      customerLegalNameSnapshot: "Cliente Duplicado Test",
      customerBusinessActivitySnapshot: "Giro",
      expectedGrossTotal: 68000,
      createdAt: new Date(),
    });

    const candidate = await findDuplicateCandidate(db, {
      canonicalRut: "76432109K",
      warehouseId: testWarehouse.id,
      expectedGrossTotal: 68000,
      windowHours: 24,
    });

    expect(candidate).not.toBeNull();
    expect(candidate?.requestNumber).toBe("FAC-2026-000100");
    expect(candidate?.grossTotal).toBe(68000);

    const nonCandidate = await findDuplicateCandidate(db, {
      canonicalRut: "76432109K",
      warehouseId: testWarehouse.id,
      expectedGrossTotal: 99000,
      windowHours: 24,
    });

    expect(nonCandidate).toBeNull();
  });

  it("6. Idempotency Security & Multi-User Isolation: User A and User B isolation with same key", async () => {
    const sharedKey = "shared-client-uuid-777";

    // 1. User A inserts request with key
    const [reqA] = await db
      .insert(schema.invoiceRequests)
      .values({
        requestNumber: "FAC-2026-000301",
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUserA.id,
        status: "PENDING",
        customerRutSnapshot: "76.432.109-K",
        customerLegalNameSnapshot: "Cliente de A",
        customerBusinessActivitySnapshot: "Giro A",
        expectedGrossTotal: 25000,
        idempotencyKey: sharedKey,
      })
      .returning();

    // 2. User A sending same key and same payload is scoped to User A
    const [fetchedA] = await db
      .select()
      .from(schema.invoiceRequests)
      .where(
        and(
          eq(schema.invoiceRequests.requestedBy, warehouseUserA.id),
          eq(schema.invoiceRequests.idempotencyKey, sharedKey)
        )
      );
    expect(fetchedA.id).toBe(reqA.id);

    // 3. User B sends the same key: PostgreSQL constraint UNIQUE(requested_by, idempotency_key) permits User B without error
    const [reqB] = await db
      .insert(schema.invoiceRequests)
      .values({
        requestNumber: "FAC-2026-000302",
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUserB.id,
        status: "PENDING",
        customerRutSnapshot: "76.432.109-K",
        customerLegalNameSnapshot: "Cliente de B",
        customerBusinessActivitySnapshot: "Giro B",
        expectedGrossTotal: 40000,
        idempotencyKey: sharedKey,
      })
      .returning();

    expect(reqB.id).not.toBe(reqA.id);
    expect(reqB.requestedBy).toBe(warehouseUserB.id);
    expect(reqA.requestedBy).toBe(warehouseUserA.id);

    // 4. User B querying their idempotency key sees ONLY User B's request (NO IDOR leakage)
    const [fetchedB] = await db
      .select()
      .from(schema.invoiceRequests)
      .where(
        and(
          eq(schema.invoiceRequests.requestedBy, warehouseUserB.id),
          eq(schema.invoiceRequests.idempotencyKey, sharedKey)
        )
      );
    expect(fetchedB.id).toBe(reqB.id);
    expect(fetchedB.customerLegalNameSnapshot).toBe("Cliente de B");
  });
});
