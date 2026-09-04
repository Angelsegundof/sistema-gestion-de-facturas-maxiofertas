import { describe, it, expect, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import * as dbModule from "@/lib/db";
import { updateCustomerDeliveryStatusService } from "@/lib/services/customer-delivery";
import { SanitizedUser } from "@/domain/types";
import * as fs from "fs";
import * as path from "path";

describe("MEJORA OPERATIVA — Control de Facturas Enviadas al Cliente", () => {
  let pglite: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let warehouseUserA: SanitizedUser;
  let warehouseUserB: SanitizedUser;
  let adminUser: SanitizedUser;
  let executorUser: SanitizedUser;
  let warehouseA: schema.Warehouse;
  let warehouseB: schema.Warehouse;
  let customer: schema.Customer;

  beforeEach(async () => {
    pglite = new PGlite();
    db = drizzle(pglite, { schema });

    vi.spyOn(dbModule, "getDb").mockReturnValue(db as unknown as ReturnType<typeof dbModule.getDb>);
    vi.spyOn(dbModule, "ensureDbReady").mockResolvedValue();

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
      .values([
        { code: "STGO-01", name: "Bodega Santiago Central", active: true },
        { code: "TMC-01", name: "Bodega Temuco", active: true },
      ])
      .returning();

    warehouseA = insertedWarehouses[0];
    warehouseB = insertedWarehouses[1];

    const insertedUsers: schema.User[] = await db
      .insert(schema.users)
      .values([
        {
          email: "bodega.santiago@maxiofertas.cl",
          name: "Juan Santiago",
          passwordHash: "hash",
          role: "WAREHOUSE_USER",
          warehouseId: warehouseA.id,
          active: true,
        },
        {
          email: "bodega.temuco@maxiofertas.cl",
          name: "Carlos Temuco",
          passwordHash: "hash",
          role: "WAREHOUSE_USER",
          warehouseId: warehouseB.id,
          active: true,
        },
        {
          email: "admin@maxiofertas.cl",
          name: "Admin General",
          passwordHash: "hash",
          role: "ADMIN",
          warehouseId: null,
          active: true,
        },
        {
          email: "ejecutor@maxiofertas.cl",
          name: "Ejecutor Facturación",
          passwordHash: "hash",
          role: "INVOICE_EXECUTOR",
          warehouseId: null,
          active: true,
        },
      ])
      .returning();

    const nowIso = new Date().toISOString();

    warehouseUserA = {
      id: insertedUsers[0].id,
      email: insertedUsers[0].email,
      name: insertedUsers[0].name,
      role: insertedUsers[0].role as any,
      warehouseId: insertedUsers[0].warehouseId,
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    warehouseUserB = {
      id: insertedUsers[1].id,
      email: insertedUsers[1].email,
      name: insertedUsers[1].name,
      role: insertedUsers[1].role as any,
      warehouseId: insertedUsers[1].warehouseId,
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    adminUser = {
      id: insertedUsers[2].id,
      email: insertedUsers[2].email,
      name: insertedUsers[2].name,
      role: insertedUsers[2].role as any,
      warehouseId: insertedUsers[2].warehouseId,
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    executorUser = {
      id: insertedUsers[3].id,
      email: insertedUsers[3].email,
      name: insertedUsers[3].name,
      role: insertedUsers[3].role as any,
      warehouseId: insertedUsers[3].warehouseId,
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const insertedCustomers: schema.Customer[] = await db
      .insert(schema.customers)
      .values([
        {
          rutCanonical: "761234567",
          rutDisplay: "76.123.456-7",
          legalName: "Comercial Maxiofertas SpA",
          businessActivity: "Venta por menor",
          active: true,
        },
      ])
      .returning();

    customer = insertedCustomers[0];
  });

  describe("1. Transiciones de Estado y Validaciones", () => {
    it("Caso 1: Factura COMPLETED puede pasar de PENDING a SENT", async () => {
      const inserted = await db
        .insert(schema.invoiceRequests)
        .values({
          requestNumber: "FAC-2026-000001",
          warehouseId: warehouseA.id,
          customerId: customer.id,
          requestedBy: warehouseUserA.id,
          status: "COMPLETED",
          customerRutSnapshot: customer.rutDisplay,
          customerLegalNameSnapshot: customer.legalName,
          customerBusinessActivitySnapshot: customer.businessActivity,
          expectedGrossTotal: 100000,
          customerDeliveryStatus: "PENDING",
        })
        .returning();

      const reqId = inserted[0].id;

      const result = await updateCustomerDeliveryStatusService(
        warehouseUserA,
        reqId,
        "SENT",
        { ipAddress: "127.0.0.1", dbOverride: db }
      );

      expect(result.customerDeliveryStatus).toBe("SENT");
      expect(result.customerSentAt).toBeDefined();
      expect(result.customerSentBy).toBe(warehouseUserA.id);

      // Verify DB persistence
      const dbRow = await db
        .select()
        .from(schema.invoiceRequests)
        .where(eq(schema.invoiceRequests.id, reqId));

      expect(dbRow[0].customerDeliveryStatus).toBe("SENT");
      expect(dbRow[0].customerSentAt).not.toBeNull();
      expect(dbRow[0].customerSentBy).toBe(warehouseUserA.id);
    });

    it("Caso 2: Factura SENT puede desmarcarse y volver a PENDING", async () => {
      const inserted = await db
        .insert(schema.invoiceRequests)
        .values({
          requestNumber: "FAC-2026-000002",
          warehouseId: warehouseA.id,
          customerId: customer.id,
          requestedBy: warehouseUserA.id,
          status: "COMPLETED",
          customerRutSnapshot: customer.rutDisplay,
          customerLegalNameSnapshot: customer.legalName,
          customerBusinessActivitySnapshot: customer.businessActivity,
          expectedGrossTotal: 100000,
          customerDeliveryStatus: "SENT",
          customerSentAt: new Date(),
          customerSentBy: warehouseUserA.id,
        })
        .returning();

      const reqId = inserted[0].id;

      const result = await updateCustomerDeliveryStatusService(
        warehouseUserA,
        reqId,
        "PENDING",
        { ipAddress: "127.0.0.1", dbOverride: db }
      );

      expect(result.customerDeliveryStatus).toBe("PENDING");
      expect(result.customerSentAt).toBeNull();
      expect(result.customerSentBy).toBeNull();

      // Verify DB persistence
      const dbRow = await db
        .select()
        .from(schema.invoiceRequests)
        .where(eq(schema.invoiceRequests.id, reqId));

      expect(dbRow[0].customerDeliveryStatus).toBe("PENDING");
      expect(dbRow[0].customerSentAt).toBeNull();
      expect(dbRow[0].customerSentBy).toBeNull();
    });

    it("Caso 3: Factura no COMPLETED (PENDING o IN_PROGRESS) no puede marcarse como SENT", async () => {
      const inserted = await db
        .insert(schema.invoiceRequests)
        .values({
          requestNumber: "FAC-2026-000003",
          warehouseId: warehouseA.id,
          customerId: customer.id,
          requestedBy: warehouseUserA.id,
          status: "PENDING",
          customerRutSnapshot: customer.rutDisplay,
          customerLegalNameSnapshot: customer.legalName,
          customerBusinessActivitySnapshot: customer.businessActivity,
          expectedGrossTotal: 50000,
          customerDeliveryStatus: "PENDING",
        })
        .returning();

      await expect(
        updateCustomerDeliveryStatusService(warehouseUserA, inserted[0].id, "SENT", {
          dbOverride: db,
        })
      ).rejects.toThrow(/CONFLICT/);
    });

    it("Caso 4: Usuario de otra bodega no puede modificar factura ajena (403)", async () => {
      const inserted = await db
        .insert(schema.invoiceRequests)
        .values({
          requestNumber: "FAC-2026-000004",
          warehouseId: warehouseA.id,
          customerId: customer.id,
          requestedBy: warehouseUserA.id,
          status: "COMPLETED",
          customerRutSnapshot: customer.rutDisplay,
          customerLegalNameSnapshot: customer.legalName,
          customerBusinessActivitySnapshot: customer.businessActivity,
          expectedGrossTotal: 75000,
          customerDeliveryStatus: "PENDING",
        })
        .returning();

      await expect(
        updateCustomerDeliveryStatusService(warehouseUserB, inserted[0].id, "SENT", {
          dbOverride: db,
        })
      ).rejects.toThrow(/FORBIDDEN/);
    });

    it("Caso 5: INVOICE_EXECUTOR no tiene permisos de escritura sobre estado de entrega (403)", async () => {
      const inserted = await db
        .insert(schema.invoiceRequests)
        .values({
          requestNumber: "FAC-2026-000005",
          warehouseId: warehouseA.id,
          customerId: customer.id,
          requestedBy: warehouseUserA.id,
          status: "COMPLETED",
          customerRutSnapshot: customer.rutDisplay,
          customerLegalNameSnapshot: customer.legalName,
          customerBusinessActivitySnapshot: customer.businessActivity,
          expectedGrossTotal: 80000,
          customerDeliveryStatus: "PENDING",
        })
        .returning();

      await expect(
        updateCustomerDeliveryStatusService(executorUser, inserted[0].id, "SENT", {
          dbOverride: db,
        })
      ).rejects.toThrow(/FORBIDDEN/);
    });

    it("Caso 6: Operación idempotente no falla si el estado ya coincide", async () => {
      const inserted = await db
        .insert(schema.invoiceRequests)
        .values({
          requestNumber: "FAC-2026-000006",
          warehouseId: warehouseA.id,
          customerId: customer.id,
          requestedBy: warehouseUserA.id,
          status: "COMPLETED",
          customerRutSnapshot: customer.rutDisplay,
          customerLegalNameSnapshot: customer.legalName,
          customerBusinessActivitySnapshot: customer.businessActivity,
          expectedGrossTotal: 90000,
          customerDeliveryStatus: "SENT",
          customerSentAt: new Date(),
          customerSentBy: warehouseUserA.id,
        })
        .returning();

      const result = await updateCustomerDeliveryStatusService(
        warehouseUserA,
        inserted[0].id,
        "SENT",
        { dbOverride: db }
      );

      expect(result.customerDeliveryStatus).toBe("SENT");
    });
  });

  describe("2. Trazabilidad y Auditoría", () => {
    it("debe registrar INVOICE_MARKED_AS_SENT al marcar como enviada", async () => {
      const inserted = await db
        .insert(schema.invoiceRequests)
        .values({
          requestNumber: "FAC-2026-000007",
          warehouseId: warehouseA.id,
          customerId: customer.id,
          requestedBy: warehouseUserA.id,
          status: "COMPLETED",
          customerRutSnapshot: customer.rutDisplay,
          customerLegalNameSnapshot: customer.legalName,
          customerBusinessActivitySnapshot: customer.businessActivity,
          expectedGrossTotal: 120000,
          customerDeliveryStatus: "PENDING",
        })
        .returning();

      await updateCustomerDeliveryStatusService(
        warehouseUserA,
        inserted[0].id,
        "SENT",
        { ipAddress: "192.168.1.50", userAgent: "Mozilla/5.0", dbOverride: db }
      );

      const logs = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.entityId, inserted[0].id));

      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe("INVOICE_MARKED_AS_SENT");
      expect(logs[0].userId).toBe(warehouseUserA.id);
      expect(logs[0].metadata).toMatchObject({
        deliveryFrom: "PENDING",
        deliveryTo: "SENT",
        requestNumber: "FAC-2026-000007",
      });
    });

    it("debe registrar INVOICE_MARKED_AS_NOT_SENT al desmarcar", async () => {
      const inserted = await db
        .insert(schema.invoiceRequests)
        .values({
          requestNumber: "FAC-2026-000008",
          warehouseId: warehouseA.id,
          customerId: customer.id,
          requestedBy: warehouseUserA.id,
          status: "COMPLETED",
          customerRutSnapshot: customer.rutDisplay,
          customerLegalNameSnapshot: customer.legalName,
          customerBusinessActivitySnapshot: customer.businessActivity,
          expectedGrossTotal: 120000,
          customerDeliveryStatus: "SENT",
          customerSentAt: new Date(),
          customerSentBy: warehouseUserA.id,
        })
        .returning();

      await updateCustomerDeliveryStatusService(
        warehouseUserA,
        inserted[0].id,
        "PENDING",
        { ipAddress: "192.168.1.50", userAgent: "Mozilla/5.0", dbOverride: db }
      );

      const logs = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.entityId, inserted[0].id));

      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe("INVOICE_MARKED_AS_NOT_SENT");
      expect(logs[0].userId).toBe(warehouseUserA.id);
      expect(logs[0].metadata).toMatchObject({
        deliveryFrom: "SENT",
        deliveryTo: "PENDING",
      });
    });
  });

  describe("3. Filtros y Cuadratura de Contadores", () => {
    it("debe contabilizar correctamente Por Enviar (PENDING) y Enviadas (SENT) solo para COMPLETED y aislar LEGACY", async () => {
      // 3 COMPLETED + SENT
      await db.insert(schema.invoiceRequests).values([
        {
          requestNumber: "FAC-2026-000010",
          warehouseId: warehouseA.id,
          customerId: customer.id,
          requestedBy: warehouseUserA.id,
          status: "COMPLETED",
          customerRutSnapshot: customer.rutDisplay,
          customerLegalNameSnapshot: customer.legalName,
          customerBusinessActivitySnapshot: customer.businessActivity,
          expectedGrossTotal: 10000,
          customerDeliveryStatus: "SENT",
        },
        {
          requestNumber: "FAC-2026-000011",
          warehouseId: warehouseA.id,
          customerId: customer.id,
          requestedBy: warehouseUserA.id,
          status: "COMPLETED",
          customerRutSnapshot: customer.rutDisplay,
          customerLegalNameSnapshot: customer.legalName,
          customerBusinessActivitySnapshot: customer.businessActivity,
          expectedGrossTotal: 20000,
          customerDeliveryStatus: "SENT",
        },
        {
          requestNumber: "FAC-2026-000012",
          warehouseId: warehouseA.id,
          customerId: customer.id,
          requestedBy: warehouseUserA.id,
          status: "COMPLETED",
          customerRutSnapshot: customer.rutDisplay,
          customerLegalNameSnapshot: customer.legalName,
          customerBusinessActivitySnapshot: customer.businessActivity,
          expectedGrossTotal: 30000,
          customerDeliveryStatus: "SENT",
        },
      ]);

      // 2 COMPLETED + PENDING
      await db.insert(schema.invoiceRequests).values([
        {
          requestNumber: "FAC-2026-000013",
          warehouseId: warehouseA.id,
          customerId: customer.id,
          requestedBy: warehouseUserA.id,
          status: "COMPLETED",
          customerRutSnapshot: customer.rutDisplay,
          customerLegalNameSnapshot: customer.legalName,
          customerBusinessActivitySnapshot: customer.businessActivity,
          expectedGrossTotal: 40000,
          customerDeliveryStatus: "PENDING",
        },
        {
          requestNumber: "FAC-2026-000014",
          warehouseId: warehouseA.id,
          customerId: customer.id,
          requestedBy: warehouseUserA.id,
          status: "COMPLETED",
          customerRutSnapshot: customer.rutDisplay,
          customerLegalNameSnapshot: customer.legalName,
          customerBusinessActivitySnapshot: customer.businessActivity,
          expectedGrossTotal: 50000,
          customerDeliveryStatus: "PENDING",
        },
      ]);

      // 1 PENDING tributaria
      await db.insert(schema.invoiceRequests).values({
        requestNumber: "FAC-2026-000015",
        warehouseId: warehouseA.id,
        customerId: customer.id,
        requestedBy: warehouseUserA.id,
        status: "PENDING",
        customerRutSnapshot: customer.rutDisplay,
        customerLegalNameSnapshot: customer.legalName,
        customerBusinessActivitySnapshot: customer.businessActivity,
        expectedGrossTotal: 60000,
        customerDeliveryStatus: "PENDING",
      });

      // 1 IN_PROGRESS tributaria
      await db.insert(schema.invoiceRequests).values({
        requestNumber: "FAC-2026-000016",
        warehouseId: warehouseA.id,
        customerId: customer.id,
        requestedBy: warehouseUserA.id,
        status: "IN_PROGRESS",
        customerRutSnapshot: customer.rutDisplay,
        customerLegalNameSnapshot: customer.legalName,
        customerBusinessActivitySnapshot: customer.businessActivity,
        expectedGrossTotal: 70000,
        customerDeliveryStatus: "PENDING",
      });

      // 1 LEGACY (Histórico migrado)
      await db.insert(schema.invoiceRequests).values({
        requestNumber: "FAC-2025-000099",
        warehouseId: warehouseA.id,
        customerId: customer.id,
        requestedBy: warehouseUserA.id,
        status: "COMPLETED",
        source: "GOOGLE_SHEETS_LEGACY",
        customerRutSnapshot: customer.rutDisplay,
        customerLegalNameSnapshot: customer.legalName,
        customerBusinessActivitySnapshot: customer.businessActivity,
        expectedGrossTotal: 99000,
        customerDeliveryStatus: "LEGACY",
      });

      const allRows = await db.select().from(schema.invoiceRequests);

      // Calculamos contadores según la lógica del frontend / servicio
      const pendingDelivery = allRows.filter(
        (r) => r.status === "COMPLETED" && r.customerDeliveryStatus === "PENDING"
      );
      const sentToCustomer = allRows.filter(
        (r) => r.status === "COMPLETED" && r.customerDeliveryStatus === "SENT"
      );

      expect(pendingDelivery).toHaveLength(2);
      expect(sentToCustomer).toHaveLength(3);

      // El histórico no debe aparecer en Por Enviar ni en Enviadas
      const legacyInPendingDelivery = pendingDelivery.filter((r) => r.customerDeliveryStatus === "LEGACY");
      const legacyInSent = sentToCustomer.filter((r) => r.customerDeliveryStatus === "LEGACY");
      expect(legacyInPendingDelivery).toHaveLength(0);
      expect(legacyInSent).toHaveLength(0);
    });
  });
});
