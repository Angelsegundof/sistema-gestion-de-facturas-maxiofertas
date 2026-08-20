import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
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
  let warehouseUser: SanitizedUser;
  let testWarehouse: schema.Warehouse;
  let testCustomer: schema.Customer;

  beforeEach(async () => {
    pglite = new PGlite();
    db = drizzle(pglite, { schema });

    const migrations = [
      "0000_cheerful_giant_girl.sql",
      "0001_sharp_reptil.sql",
      "0002_concerned_molly_hayes.sql",
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
      .values({
        email: "solicitante@maxiofertas.cl",
        name: "Araceli Solicitante",
        passwordHash: "hash123",
        role: "WAREHOUSE_USER",
        warehouseId: testWarehouse.id,
        active: true,
      })
      .returning();
    const user = insertedUsers[0];

    warehouseUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      warehouseId: user.warehouseId,
      active: user.active,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
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
        requestedBy: warehouseUser.id,
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
        requestedBy: warehouseUser.id,
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
        requestedBy: warehouseUser.id,
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
    // 1. Insert existing request
    await db.insert(schema.invoiceRequests).values({
      requestNumber: "FAC-2026-000100",
      warehouseId: testWarehouse.id,
      customerId: testCustomer.id,
      requestedBy: warehouseUser.id,
      status: "PENDING",
      customerRutSnapshot: "76.432.109-K",
      customerLegalNameSnapshot: "Cliente Duplicado Test",
      customerBusinessActivitySnapshot: "Giro",
      expectedGrossTotal: 68000,
      createdAt: new Date(),
    });

    // 2. Query duplicate candidate
    const candidate = await findDuplicateCandidate(db, {
      canonicalRut: "76432109K",
      warehouseId: testWarehouse.id,
      expectedGrossTotal: 68000,
      windowHours: 24,
    });

    expect(candidate).not.toBeNull();
    expect(candidate?.requestNumber).toBe("FAC-2026-000100");
    expect(candidate?.grossTotal).toBe(68000);

    // 3. Different total should NOT trigger duplicate candidate
    const nonCandidate = await findDuplicateCandidate(db, {
      canonicalRut: "76432109K",
      warehouseId: testWarehouse.id,
      expectedGrossTotal: 99000,
      windowHours: 24,
    });

    expect(nonCandidate).toBeNull();
  });

  it("5. Idempotency Support: Re-submitting with same Idempotency-Key prevents duplicate row", async () => {
    const key = "idemp-key-unique-12345";

    // 1. Insert request with idempotency key
    const insertedReqs: schema.InvoiceRequest[] = await db
      .insert(schema.invoiceRequests)
      .values({
        requestNumber: "FAC-2026-000200",
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUser.id,
        status: "PENDING",
        customerRutSnapshot: "76.432.109-K",
        customerLegalNameSnapshot: "Cliente Idempotente",
        customerBusinessActivitySnapshot: "Giro",
        expectedGrossTotal: 25000,
        idempotencyKey: key,
      })
      .returning();
    const first = insertedReqs[0];

    // 2. Attempting second insert with exact same idempotencyKey fails at DB constraint level
    await expect(
      db.insert(schema.invoiceRequests).values({
        requestNumber: "FAC-2026-000201",
        warehouseId: testWarehouse.id,
        customerId: testCustomer.id,
        requestedBy: warehouseUser.id,
        status: "PENDING",
        customerRutSnapshot: "76.432.109-K",
        customerLegalNameSnapshot: "Cliente Idempotente",
        customerBusinessActivitySnapshot: "Giro",
        expectedGrossTotal: 25000,
        idempotencyKey: key,
      })
    ).rejects.toThrow();

    // 3. Fetching by idempotency key returns the original record
    const fetchedList: schema.InvoiceRequest[] = await db
      .select()
      .from(schema.invoiceRequests)
      .where(eq(schema.invoiceRequests.idempotencyKey, key));

    expect(fetchedList[0].id).toBe(first.id);
    expect(fetchedList[0].requestNumber).toBe("FAC-2026-000200");
  });
});
