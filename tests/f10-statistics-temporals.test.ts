import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, asc, desc, and, gte, lte } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { runLocalMigrations } from "@/lib/db";
import { computeAgeIndicator, getQueueCountersService } from "@/lib/services/invoice-queue";
import { getChileDayBounds, getChileMonthBounds, getChileCurrentYearMonth } from "@/lib/utils/dates";
import { getExecutorStatisticsService } from "@/lib/services/statistics";
import { SanitizedUser } from "@/domain/types";

describe("FASE 10.1F — Temporal Metrics and Executor Management Statistics", () => {
  let pglite: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  const adminUser: SanitizedUser = {
    id: "a0000000-0000-4000-8000-000000000001",
    email: "admin@maxiofertas.cl",
    name: "Administrador General",
    role: "ADMIN",
    warehouseId: null,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const managementUser: SanitizedUser = {
    id: "a0000000-0000-4000-8000-000000000002",
    email: "jefatura@maxiofertas.cl",
    name: "Jefatura de Operaciones",
    role: "MANAGEMENT",
    warehouseId: null,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const executorUser1: SanitizedUser = {
    id: "a0000000-0000-4000-8000-000000000003",
    email: "maria.gonzalez@maxiofertas.cl",
    name: "María González",
    role: "INVOICE_EXECUTOR",
    warehouseId: null,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const executorUser2: SanitizedUser = {
    id: "a0000000-0000-4000-8000-000000000004",
    email: "juan.perez@maxiofertas.cl",
    name: "Juan Pérez",
    role: "INVOICE_EXECUTOR",
    warehouseId: null,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const warehouseUser: SanitizedUser = {
    id: "a0000000-0000-4000-8000-000000000005",
    email: "solicitante@maxiofertas.cl",
    name: "Juan Solicitante",
    role: "WAREHOUSE_USER",
    warehouseId: "b0000000-0000-4000-8000-000000000001",
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const testWarehouseId = "b0000000-0000-4000-8000-000000000001";
  const testCustomerId = "c0000000-0000-4000-8000-000000000001";

  beforeEach(async () => {
    pglite = new PGlite();
    db = drizzle(pglite, { schema });
    await runLocalMigrations(pglite);

    // Insert test users into DB
    await db.insert(schema.users).values([
      {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role,
        passwordHash: "hash",
        active: true,
      },
      {
        id: managementUser.id,
        email: managementUser.email,
        name: managementUser.name,
        role: managementUser.role,
        passwordHash: "hash",
        active: true,
      },
      {
        id: executorUser1.id,
        email: executorUser1.email,
        name: executorUser1.name,
        role: executorUser1.role,
        passwordHash: "hash",
        active: true,
      },
      {
        id: executorUser2.id,
        email: executorUser2.email,
        name: executorUser2.name,
        role: executorUser2.role,
        passwordHash: "hash",
        active: true,
      },
      {
        id: warehouseUser.id,
        email: warehouseUser.email,
        name: warehouseUser.name,
        role: warehouseUser.role,
        passwordHash: "hash",
        active: true,
      },
    ]);

    // Insert test warehouse
    await db.insert(schema.warehouses).values({
      id: testWarehouseId,
      code: "CENTRAL",
      name: "Bodega Santiago Central",
      active: true,
    });

    // Insert test customer
    await db.insert(schema.customers).values({
      id: testCustomerId,
      rutCanonical: "761234560",
      rutDisplay: "76.123.456-0",
      legalName: "Distribuidora Mayorista SpA",
      businessActivity: "Venta al por mayor",
      phone: "+56912345678",
      email: "contacto@mayorista.cl",
      active: true,
    });
  });

  describe("QA-013 — Antiquity formatting (computeAgeIndicator)", () => {
    it("should format 15 minutes correctly", () => {
      const now = new Date();
      const past = new Date(now.getTime() - 15 * 60 * 1000);
      const res = computeAgeIndicator(past);
      expect(res.displayAge).toBe("15 min");
      expect(res.category).toBe("under_30m");
    });

    it("should format 45 minutes correctly", () => {
      const now = new Date();
      const past = new Date(now.getTime() - 45 * 60 * 1000);
      const res = computeAgeIndicator(past);
      expect(res.displayAge).toBe("45 min");
      expect(res.category).toBe("30_60m");
    });

    it("should format 1 hour 24 minutes correctly", () => {
      const now = new Date();
      const past = new Date(now.getTime() - (1 * 60 + 24) * 60 * 1000);
      const res = computeAgeIndicator(past);
      expect(res.displayAge).toBe("1 h 24 min");
      expect(res.category).toBe("1_2h");
    });

    it("should format 3 hours 20 minutes correctly", () => {
      const now = new Date();
      const past = new Date(now.getTime() - (3 * 60 + 20) * 60 * 1000);
      const res = computeAgeIndicator(past);
      expect(res.displayAge).toBe("3 h 20 min");
      expect(res.category).toBe("over_2h");
    });

    it("should format 1 day 4 hours correctly", () => {
      const now = new Date();
      const past = new Date(now.getTime() - (28 * 60) * 60 * 1000);
      const res = computeAgeIndicator(past);
      expect(res.displayAge).toBe("1 día 4 h");
      expect(res.category).toBe("over_2h");
    });

    it("should format 3 days 4 hours correctly (>3 days requirement)", () => {
      const now = new Date();
      const past = new Date(now.getTime() - (76 * 60) * 60 * 1000);
      const res = computeAgeIndicator(past);
      expect(res.displayAge).toBe("3 días 4 h");
      expect(res.category).toBe("over_2h");
    });

    it("should format 12 days correctly", () => {
      const now = new Date();
      const past = new Date(now.getTime() - (12 * 24 * 60) * 60 * 1000);
      const res = computeAgeIndicator(past);
      expect(res.displayAge).toBe("12 días");
      expect(res.category).toBe("over_2h");
    });
  });

  describe("QA-014 — 'Listas hoy' counter and Chile timezone bounds", () => {
    it("should strictly count invoices completed during today in America/Santiago", async () => {
      const { startOfDay } = getChileDayBounds();

      // Factura A: Completada ayer a las 23:59 Chile (1 min antes del inicio de hoy)
      const completedYesterday = new Date(startOfDay.getTime() - 60 * 1000);
      // Factura B: Completada hoy a las 00:01 Chile (1 min después del inicio de hoy)
      const completedTodayEarly = new Date(startOfDay.getTime() + 60 * 1000);
      // Factura C: Completada hoy a las 10:00 Chile (10 horas después del inicio de hoy)
      const completedTodayMid = new Date(startOfDay.getTime() + 10 * 3600 * 1000);

      // Insert Factura A (Yesterday)
      await db.insert(schema.invoiceRequests).values({
        requestNumber: "FAC-TEST-001",
        warehouseId: testWarehouseId,
        customerId: testCustomerId,
        customerRutSnapshot: "761234560",
        customerLegalNameSnapshot: "Test A",
        customerBusinessActivitySnapshot: "Venta al por mayor",
        expectedGrossTotal: 100000,
        status: "COMPLETED",
        requestedBy: warehouseUser.id,
        assignedTo: executorUser1.id,
        completedAt: completedYesterday,
      });

      // Insert Factura B (Today Early)
      await db.insert(schema.invoiceRequests).values({
        requestNumber: "FAC-TEST-002",
        warehouseId: testWarehouseId,
        customerId: testCustomerId,
        customerRutSnapshot: "761234560",
        customerLegalNameSnapshot: "Test B",
        customerBusinessActivitySnapshot: "Venta al por mayor",
        expectedGrossTotal: 100000,
        status: "COMPLETED",
        requestedBy: warehouseUser.id,
        assignedTo: executorUser1.id,
        completedAt: completedTodayEarly,
      });

      // Insert Factura C (Today Mid)
      await db.insert(schema.invoiceRequests).values({
        requestNumber: "FAC-TEST-003",
        warehouseId: testWarehouseId,
        customerId: testCustomerId,
        customerRutSnapshot: "761234560",
        customerLegalNameSnapshot: "Test C",
        customerBusinessActivitySnapshot: "Venta al por mayor",
        expectedGrossTotal: 100000,
        status: "COMPLETED",
        requestedBy: warehouseUser.id,
        assignedTo: executorUser2.id,
        completedAt: completedTodayMid,
      });

      const counters = await getQueueCountersService(undefined, db);
      expect(counters.completedTodayCount).toBe(2);
    });
  });

  describe("QA-012 — Executor Performance Statistics", () => {
    it("should compute accurate monthly, historical average and total metrics per executor", async () => {
      const { year: currentYear, month: currentMonth } = getChileCurrentYearMonth();
      const { startOfMonth: currentMonthStart } = getChileMonthBounds(currentYear, currentMonth);

      // Setup historical closed months for María González (executor 1):
      // Completed 10 in 2 months ago, 20 in 1 month ago, 5 in current month
      const twoMonthsAgoDate = new Date(currentMonthStart.getTime() - 50 * 24 * 3600 * 1000);
      const oneMonthAgoDate = new Date(currentMonthStart.getTime() - 15 * 24 * 3600 * 1000);
      const thisMonthDate = new Date(currentMonthStart.getTime() + 2 * 24 * 3600 * 1000);

      // María: 10 invoices in month -2
      for (let i = 0; i < 10; i++) {
        await db.insert(schema.invoiceRequests).values({
          requestNumber: `FAC-M2-${i}`,
          warehouseId: testWarehouseId,
          customerId: testCustomerId,
          customerRutSnapshot: "761234560",
          customerLegalNameSnapshot: "Customer",
          customerBusinessActivitySnapshot: "Venta al por mayor",
          expectedGrossTotal: 10000,
          status: "COMPLETED",
          requestedBy: warehouseUser.id,
          assignedTo: executorUser1.id,
          completedAt: twoMonthsAgoDate,
        });
      }

      // María: 20 invoices in month -1
      for (let i = 0; i < 20; i++) {
        await db.insert(schema.invoiceRequests).values({
          requestNumber: `FAC-M1-${i}`,
          warehouseId: testWarehouseId,
          customerId: testCustomerId,
          customerRutSnapshot: "761234560",
          customerLegalNameSnapshot: "Customer",
          customerBusinessActivitySnapshot: "Venta al por mayor",
          expectedGrossTotal: 10000,
          status: "COMPLETED",
          requestedBy: warehouseUser.id,
          assignedTo: executorUser1.id,
          completedAt: oneMonthAgoDate,
        });
      }

      // María: 5 invoices this month
      for (let i = 0; i < 5; i++) {
        await db.insert(schema.invoiceRequests).values({
          requestNumber: `FAC-M0-${i}`,
          warehouseId: testWarehouseId,
          customerId: testCustomerId,
          customerRutSnapshot: "761234560",
          customerLegalNameSnapshot: "Customer",
          customerBusinessActivitySnapshot: "Venta al por mayor",
          expectedGrossTotal: 10000,
          status: "COMPLETED",
          requestedBy: warehouseUser.id,
          assignedTo: executorUser1.id,
          completedAt: thisMonthDate,
        });
      }

      // Setup Juan Pérez (executor 2): only active in current month (8 invoices)
      for (let i = 0; i < 8; i++) {
        await db.insert(schema.invoiceRequests).values({
          requestNumber: `FAC-J0-${i}`,
          warehouseId: testWarehouseId,
          customerId: testCustomerId,
          customerRutSnapshot: "761234560",
          customerLegalNameSnapshot: "Customer",
          customerBusinessActivitySnapshot: "Venta al por mayor",
          expectedGrossTotal: 10000,
          status: "COMPLETED",
          requestedBy: warehouseUser.id,
          assignedTo: executorUser2.id,
          completedAt: thisMonthDate,
        });
      }

      const res = await getExecutorStatisticsService(adminUser, {}, db);
      expect(res.executors).toHaveLength(2);

      const mariaStats = res.executors.find((e) => e.executorId === executorUser1.id);
      expect(mariaStats).toBeDefined();
      expect(mariaStats?.invoicesThisMonth).toBe(5);
      expect(mariaStats?.historicalTotal).toBe(35); // 10 + 20 + 5
      // Historical average: (10 + 20) / 2 closed months = 15.0
      expect(mariaStats?.historicalMonthlyAverage).toBe(15);

      const juanStats = res.executors.find((e) => e.executorId === executorUser2.id);
      expect(juanStats).toBeDefined();
      expect(juanStats?.invoicesThisMonth).toBe(8);
      expect(juanStats?.historicalTotal).toBe(8);
      // Juan has no closed historical months yet -> null
      expect(juanStats?.historicalMonthlyAverage).toBeNull();
    });

    it("should attribute replacement invoices in rectifications to the executor who completed them", async () => {
      const { year, month } = getChileCurrentYearMonth();
      const { startOfMonth } = getChileMonthBounds(year, month);
      const thisMonthDate = new Date(startOfMonth.getTime() + 3 * 24 * 3600 * 1000);

      // Original invoice completed by María
      const [req] = await db
        .insert(schema.invoiceRequests)
        .values({
          requestNumber: "FAC-ORIG-001",
          warehouseId: testWarehouseId,
          customerId: testCustomerId,
          customerRutSnapshot: "761234560",
          customerLegalNameSnapshot: "Customer",
          customerBusinessActivitySnapshot: "Venta al por mayor",
          expectedGrossTotal: 50000,
          status: "COMPLETED",
          requestedBy: warehouseUser.id,
          assignedTo: executorUser1.id,
          completedAt: thisMonthDate,
        })
        .returning();

      // Original document
      const [origDoc] = await db
        .insert(schema.documents)
        .values({
          documentType: "INVOICE",
          storageProvider: "R2",
          storageKey: "invoices/test-orig.pdf",
          fileName: "test-orig.pdf",
          mimeType: "application/pdf",
          fileSize: 1024,
          invoiceRequestId: req.id,
          uploadedBy: executorUser1.id,
        })
        .returning();

      // Replacement invoice completed by Juan
      await db.insert(schema.rectifications).values({
        invoiceRequestId: req.id,
        originalInvoiceDocumentId: origDoc.id,
        requestedBy: warehouseUser.id,
        reason: "PRICE",
        status: "COMPLETED",
        assignedTo: executorUser2.id,
        completedAt: thisMonthDate,
      });

      const res = await getExecutorStatisticsService(managementUser, {}, db);
      const maria = res.executors.find((e) => e.executorId === executorUser1.id);
      const juan = res.executors.find((e) => e.executorId === executorUser2.id);

      expect(maria?.invoicesThisMonth).toBe(1);
      expect(juan?.invoicesThisMonth).toBe(1);
      expect(juan?.rectificationsCompleted).toBe(1);
    });

    it("should strictly deny access to INVOICE_EXECUTOR and WAREHOUSE_USER (403)", async () => {
      await expect(getExecutorStatisticsService(executorUser1, {}, db)).rejects.toThrow("FORBIDDEN");
      await expect(getExecutorStatisticsService(warehouseUser, {}, db)).rejects.toThrow("FORBIDDEN");
    });
  });

  describe("F10.1G — Immutability of created_at and FIFO Queue ordering", () => {
    it("should preserve created_at through all state transitions without resetting antiquity", async () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

      // 1. Initial creation (PENDING)
      const [req] = await db
        .insert(schema.invoiceRequests)
        .values({
          requestNumber: "FAC-TRANS-001",
          warehouseId: testWarehouseId,
          customerId: testCustomerId,
          customerRutSnapshot: "761234560",
          customerLegalNameSnapshot: "Test Trans",
          customerBusinessActivitySnapshot: "Venta al por mayor",
          expectedGrossTotal: 150000,
          status: "PENDING",
          requestedBy: warehouseUser.id,
          createdAt: fiveDaysAgo,
        })
        .returning();

      expect(new Date(req.createdAt).toISOString()).toBe(fiveDaysAgo.toISOString());
      let age = computeAgeIndicator(req.createdAt);
      expect(age.displayAge).toBe("5 días");

      // 2. Claim by executor (IN_PROGRESS)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const [claimed] = await db
        .update(schema.invoiceRequests)
        .set({
          status: "IN_PROGRESS",
          assignedTo: executorUser1.id,
          assignedAt: oneHourAgo,
          updatedAt: new Date(),
        })
        .where(eq(schema.invoiceRequests.id, req.id))
        .returning();

      expect(new Date(claimed.createdAt).toISOString()).toBe(fiveDaysAgo.toISOString());
      age = computeAgeIndicator(claimed.createdAt);
      expect(age.displayAge).toBe("5 días"); // Remains 5 days, NOT 1 hour!

      // 3. Request correction (NEEDS_CORRECTION)
      const [correctionRequested] = await db
        .update(schema.invoiceRequests)
        .set({
          status: "NEEDS_CORRECTION",
          assignedTo: null,
          assignedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.invoiceRequests.id, req.id))
        .returning();

      expect(new Date(correctionRequested.createdAt).toISOString()).toBe(fiveDaysAgo.toISOString());
      age = computeAgeIndicator(correctionRequested.createdAt);
      expect(age.displayAge).toBe("5 días");

      // 4. Warehouse user corrects pre-invoice (PENDING again)
      const [rePending] = await db
        .update(schema.invoiceRequests)
        .set({
          status: "PENDING",
          expectedGrossTotal: 160000,
          updatedAt: new Date(),
        })
        .where(eq(schema.invoiceRequests.id, req.id))
        .returning();

      expect(new Date(rePending.createdAt).toISOString()).toBe(fiveDaysAgo.toISOString());
      age = computeAgeIndicator(rePending.createdAt);
      expect(age.displayAge).toBe("5 días");
    });

    it("should strictly order queue by created_at ASC (oldest first in FIFO)", async () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // Insert C (1h ago) first
      await db.insert(schema.invoiceRequests).values({
        requestNumber: "FAC-FIFO-C",
        warehouseId: testWarehouseId,
        customerId: testCustomerId,
        customerRutSnapshot: "761234560",
        customerLegalNameSnapshot: "Test C",
        customerBusinessActivitySnapshot: "Venta al por mayor",
        expectedGrossTotal: 30000,
        status: "PENDING",
        requestedBy: warehouseUser.id,
        createdAt: oneHourAgo,
      });

      // Insert A (5 days ago) second
      await db.insert(schema.invoiceRequests).values({
        requestNumber: "FAC-FIFO-A",
        warehouseId: testWarehouseId,
        customerId: testCustomerId,
        customerRutSnapshot: "761234560",
        customerLegalNameSnapshot: "Test A",
        customerBusinessActivitySnapshot: "Venta al por mayor",
        expectedGrossTotal: 10000,
        status: "PENDING",
        requestedBy: warehouseUser.id,
        createdAt: fiveDaysAgo,
      });

      // Insert B (3 days ago) third
      await db.insert(schema.invoiceRequests).values({
        requestNumber: "FAC-FIFO-B",
        warehouseId: testWarehouseId,
        customerId: testCustomerId,
        customerRutSnapshot: "761234560",
        customerLegalNameSnapshot: "Test B",
        customerBusinessActivitySnapshot: "Venta al por mayor",
        expectedGrossTotal: 20000,
        status: "PENDING",
        requestedBy: warehouseUser.id,
        createdAt: threeDaysAgo,
      });

      // Fetch pending requests ordered by created_at ASC
      const pendingList = await db
        .select()
        .from(schema.invoiceRequests)
        .where(eq(schema.invoiceRequests.status, "PENDING"))
        .orderBy(asc(schema.invoiceRequests.createdAt));

      const requestNumbers = pendingList.map((r) => r.requestNumber);
      expect(requestNumbers).toEqual(["FAC-FIFO-A", "FAC-FIFO-B", "FAC-FIFO-C"]);

      const ages = pendingList.map((r) => computeAgeIndicator(r.createdAt).displayAge);
      expect(ages[0]).toBe("5 días");
      expect(ages[1]).toBe("3 días");
      expect(ages[2]).toBe("1 h");
    });
  });

  describe("F10.1H — Historical Completed Invoices and Customer Persistence", () => {
    it("should differentiate 'Listas hoy' (today only in Chile) from 'Realizadas' (all historical completed)", async () => {
      const { startOfDay } = getChileDayBounds();
      const fourDaysAgo = new Date(startOfDay.getTime() - 4 * 24 * 60 * 60 * 1000);
      const todayNoon = new Date(startOfDay.getTime() + 12 * 60 * 60 * 1000);

      // Invoice 1: Completed 4 days ago
      await db.insert(schema.invoiceRequests).values({
        requestNumber: "FAC-HIST-001",
        warehouseId: testWarehouseId,
        customerId: testCustomerId,
        customerRutSnapshot: "76.123.456-0",
        customerLegalNameSnapshot: "Cliente Antiguo SpA",
        customerBusinessActivitySnapshot: "Venta al por mayor",
        expectedGrossTotal: 50000,
        status: "COMPLETED",
        requestedBy: warehouseUser.id,
        assignedTo: executorUser1.id,
        createdAt: fourDaysAgo,
        completedAt: fourDaysAgo,
      });

      // Invoice 2: Completed Today
      await db.insert(schema.invoiceRequests).values({
        requestNumber: "FAC-HIST-002",
        warehouseId: testWarehouseId,
        customerId: testCustomerId,
        customerRutSnapshot: "76.123.456-0",
        customerLegalNameSnapshot: "Cliente Hoy SpA",
        customerBusinessActivitySnapshot: "Venta al por mayor",
        expectedGrossTotal: 80000,
        status: "COMPLETED",
        requestedBy: warehouseUser.id,
        assignedTo: executorUser2.id,
        createdAt: todayNoon,
        completedAt: todayNoon,
      });

      // Query 1: Listas hoy (todayOnly = true)
      const todayOnlyRows = await db
        .select()
        .from(schema.invoiceRequests)
        .where(
          and(
            eq(schema.invoiceRequests.status, "COMPLETED"),
            gte(schema.invoiceRequests.completedAt, startOfDay)
          )
        );
      expect(todayOnlyRows).toHaveLength(1);
      expect(todayOnlyRows[0].requestNumber).toBe("FAC-HIST-002");

      // Query 2: Realizadas (all completed historical)
      const allCompletedRows = await db
        .select()
        .from(schema.invoiceRequests)
        .where(eq(schema.invoiceRequests.status, "COMPLETED"))
        .orderBy(asc(schema.invoiceRequests.completedAt));
      expect(allCompletedRows).toHaveLength(2);
      expect(allCompletedRows.map((r) => r.requestNumber)).toEqual([
        "FAC-HIST-001",
        "FAC-HIST-002",
      ]);
    });

    it("should create customer on first request and reuse the same customer on subsequent requests", async () => {
      const newRutCanonical = "269856750";
      const newRutDisplay = "26.985.675-0";

      // 1. Initial check: customer does NOT exist
      const before = await db
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.rutCanonical, newRutCanonical));
      expect(before).toHaveLength(0);

      // 2. First request with new RUT
      const [newCust] = await db
        .insert(schema.customers)
        .values({
          rutCanonical: newRutCanonical,
          rutDisplay: newRutDisplay,
          legalName: "Inversiones y Servicios SpA",
          businessActivity: "Servicios Informáticos",
          active: true,
        })
        .returning();
      expect(newCust.id).toBeDefined();

      const [req1] = await db
        .insert(schema.invoiceRequests)
        .values({
          requestNumber: "FAC-CUST-001",
          warehouseId: testWarehouseId,
          customerId: newCust.id,
          customerRutSnapshot: newRutDisplay,
          customerLegalNameSnapshot: "Inversiones y Servicios SpA",
          customerBusinessActivitySnapshot: "Servicios Informáticos",
          expectedGrossTotal: 100000,
          status: "PENDING",
          requestedBy: warehouseUser.id,
        })
        .returning();
      expect(req1.customerId).toBe(newCust.id);

      // 3. Second request with same RUT: Look up existing customer
      const lookupResult = await db
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.rutCanonical, newRutCanonical))
        .limit(1);
      expect(lookupResult).toHaveLength(1);
      const existingCustId = lookupResult[0].id;
      expect(existingCustId).toBe(newCust.id);

      const [req2] = await db
        .insert(schema.invoiceRequests)
        .values({
          requestNumber: "FAC-CUST-002",
          warehouseId: testWarehouseId,
          customerId: existingCustId,
          customerRutSnapshot: newRutDisplay,
          customerLegalNameSnapshot: "Inversiones y Servicios SpA",
          customerBusinessActivitySnapshot: "Servicios Informáticos",
          expectedGrossTotal: 200000,
          status: "PENDING",
          requestedBy: warehouseUser.id,
        })
        .returning();

      expect(req2.customerId).toBe(newCust.id);

      // Total customers with this canonical RUT must remain 1
      const totalCustomersWithRut = await db
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.rutCanonical, newRutCanonical));
      expect(totalCustomersWithRut).toHaveLength(1);
    });
  });
});

