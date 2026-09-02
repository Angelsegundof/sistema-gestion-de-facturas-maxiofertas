import { describe, it, expect, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, and } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import * as dbModule from "@/lib/db";
import {
  updatePendingInvoiceRequestService,
  createInvoiceRequestService,
} from "@/lib/services/invoice-requests";
import { claimInvoiceRequestService } from "@/lib/services/invoice-queue";
import { hasPermission } from "@/domain/permissions";
import { SanitizedUser } from "@/domain/types";
import * as fs from "fs";
import * as path from "path";

describe("Operational Improvements Integration Tests (Mejoras 1, 2, 3 - Refined)", () => {
  let pglite: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let managementUser: SanitizedUser;
  let executorUser: SanitizedUser;
  let warehouseUserA: SanitizedUser;
  let warehouseUserB: SanitizedUser;
  let warehouseA: schema.Warehouse;
  let warehouseB: schema.Warehouse;

  beforeEach(async () => {
    pglite = new PGlite();
    db = drizzle(pglite, { schema });

    // Mock getDb to return our in-memory PostgreSQL instance
    vi.spyOn(dbModule, "getDb").mockReturnValue(db as unknown as ReturnType<typeof dbModule.getDb>);

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
      .values([
        { code: "STGO-01", name: "Bodega Santiago Central", active: true },
        { code: "OSR-01", name: "Bodega Osorno", active: true },
      ])
      .returning();
    warehouseA = insertedWarehouses[0];
    warehouseB = insertedWarehouses[1];

    const insertedUsers: schema.User[] = await db
      .insert(schema.users)
      .values([
        {
          email: "gerencia@maxiofertas.cl",
          name: "Keila Gerencia",
          passwordHash: "hash123",
          role: "MANAGEMENT",
          warehouseId: null,
          active: true,
        },
        {
          email: "ejecutor@maxiofertas.cl",
          name: "Jeni Ejecutor",
          passwordHash: "hash123",
          role: "INVOICE_EXECUTOR",
          warehouseId: null,
          active: true,
        },
        {
          email: "bodega.stgo@maxiofertas.cl",
          name: "Bodega Santiago",
          passwordHash: "hash123",
          role: "WAREHOUSE_USER",
          warehouseId: warehouseA.id,
          active: true,
        },
        {
          email: "bodega.osorno@maxiofertas.cl",
          name: "Bodega Osorno",
          passwordHash: "hash123",
          role: "WAREHOUSE_USER",
          warehouseId: warehouseB.id,
          active: true,
        },
      ])
      .returning();

    const nowIso = new Date().toISOString();
    managementUser = {
      id: insertedUsers[0].id,
      email: insertedUsers[0].email,
      name: insertedUsers[0].name,
      role: insertedUsers[0].role,
      warehouseId: insertedUsers[0].warehouseId,
      active: insertedUsers[0].active,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    executorUser = {
      id: insertedUsers[1].id,
      email: insertedUsers[1].email,
      name: insertedUsers[1].name,
      role: insertedUsers[1].role,
      warehouseId: insertedUsers[1].warehouseId,
      active: insertedUsers[1].active,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    warehouseUserA = {
      id: insertedUsers[2].id,
      email: insertedUsers[2].email,
      name: insertedUsers[2].name,
      role: insertedUsers[2].role,
      warehouseId: insertedUsers[2].warehouseId,
      active: insertedUsers[2].active,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    warehouseUserB = {
      id: insertedUsers[3].id,
      email: insertedUsers[3].email,
      name: insertedUsers[3].name,
      role: insertedUsers[3].role,
      warehouseId: insertedUsers[3].warehouseId,
      active: insertedUsers[3].active,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  });

  describe("Mejora 1 — Permisos y Operación de Facturación por Gerencia / Finanzas (MANAGEMENT)", () => {
    it("should allow MANAGEMENT to possess operational capabilities but NOT pending edit capability", () => {
      expect(hasPermission("MANAGEMENT", "REQUEST_CLAIM")).toBe(true);
      expect(hasPermission("MANAGEMENT", "INVOICE_FINALIZE")).toBe(true);
      expect(hasPermission("MANAGEMENT", "INVOICE_UPLOAD_PDF")).toBe(true);
      expect(hasPermission("MANAGEMENT", "STATS_VIEW")).toBe(true);
      expect(hasPermission("MANAGEMENT", "AUDIT_VIEW")).toBe(true);
      expect(hasPermission("MANAGEMENT", "REQUEST_EDIT_PENDING")).toBe(false);
    });

    it("should allow a MANAGEMENT user to claim a PENDING request and register their actual userId", async () => {
      const createRes = await createInvoiceRequestService(warehouseUserA, {
        customer: {
          rut: "76.432.109-K",
          legalName: "Cliente Test SpA",
          businessActivity: "Comercio",
          phone: "+56912345678",
          email: "test@cliente.cl",
        },
        items: [
          {
            description: "Producto A",
            quantity: 2,
            unitPriceGross: 10000,
          },
        ],
      });

      if (!("request" in createRes)) throw new Error("Request creation failed");

      const claimed = await claimInvoiceRequestService(managementUser, createRes.request.id);
      expect(claimed.status).toBe("IN_PROGRESS");
      expect(claimed.assignedTo).toBe(managementUser.id);

      // Verify in database
      const [inDb] = await db
        .select()
        .from(schema.invoiceRequests)
        .where(eq(schema.invoiceRequests.id, createRes.request.id));
      expect(inDb.status).toBe("IN_PROGRESS");
      expect(inDb.assignedTo).toBe(managementUser.id);
    });
  });

  describe("Mejora 2 — Datos de Contacto de Clientes", () => {
    it("should store and expose customer contact info snapshots for the requester", async () => {
      const createRes = await createInvoiceRequestService(warehouseUserA, {
        customer: {
          rut: "76.432.109-K",
          legalName: "Distribuidora Mayorista SpA",
          businessActivity: "Distribución",
          phone: "+56 9 9876 5432",
          email: "ventas@mayorista.cl",
        },
        items: [
          {
            description: "Caja de Zapatillas",
            quantity: 1,
            unitPriceGross: 50000,
          },
        ],
      });

      if (!("request" in createRes)) throw new Error("Request creation failed");

      expect(createRes.request.customerPhoneSnapshot).toBe("+56 9 9876 5432");
      expect(createRes.request.customerEmailSnapshot).toBe("ventas@mayorista.cl");
      expect(createRes.request.customerLegalNameSnapshot).toBe("Distribuidora Mayorista SpA");
      expect(createRes.request.customerRutSnapshot).toBe("76.432.109-K");
    });
  });

  describe("Mejora 3 — Edición de Solicitudes PENDING por el Solicitante (WAREHOUSE_USER)", () => {
    it("should allow WAREHOUSE_USER to edit their own PENDING request and recalculate totals deterministically", async () => {
      const createRes = await createInvoiceRequestService(warehouseUserA, {
        customer: {
          rut: "76.432.109-K",
          legalName: "Nombre Anterior",
          businessActivity: "Giro Anterior",
          phone: "111111",
          email: "old@test.cl",
        },
        items: [
          {
            description: "Item Inicial",
            quantity: 1,
            unitPriceGross: 10000,
          },
        ],
        notes: "Nota inicial",
      });

      if (!("request" in createRes)) throw new Error("Request creation failed");

      const updated = await updatePendingInvoiceRequestService(warehouseUserA, createRes.request.id, {
        customer: {
          rut: "76.432.109-K",
          legalName: "Nombre Modificado por Bodega",
          businessActivity: "Giro Modificado",
          phone: "+56988887777",
          email: "new@test.cl",
        },
        items: [
          {
            description: "Producto 1 Corregido",
            quantity: 3,
            unitPriceGross: 20000,
          },
          {
            description: "Producto 2 Nuevo",
            quantity: 2,
            unitPriceGross: 15000,
          },
        ],
        notes: "Nota modificada por encargado de bodega",
      });

      // Total esperado: 3 * 20000 + 2 * 15000 = 60000 + 30000 = 90000
      expect(updated.expectedGrossTotal).toBe(90000);
      expect(updated.customerLegalNameSnapshot).toBe("Nombre Modificado por Bodega");
      expect(updated.customerBusinessActivitySnapshot).toBe("Giro Modificado");
      expect(updated.customerPhoneSnapshot).toBe("+56988887777");
      expect(updated.customerEmailSnapshot).toBe("new@test.cl");
      expect(updated.notes).toBe("Nota modificada por encargado de bodega");
      expect(updated.items?.length).toBe(2);

      // Verify audit log
      const auditEvents = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.entityId, createRes.request.id));
      const editEvent = auditEvents.find(
        (a) => a.action === "INVOICE_REQUEST_UPDATED_BY_REQUESTER"
      );
      expect(editEvent).toBeDefined();
      expect(editEvent?.userId).toBe(warehouseUserA.id);
    });

    it("should prevent WAREHOUSE_USER B from editing a request created by WAREHOUSE_USER A (IDOR / Forbidden)", async () => {
      const createRes = await createInvoiceRequestService(warehouseUserA, {
        customer: {
          rut: "76.432.109-K",
          legalName: "Cliente de Santiago",
          businessActivity: "Comercio",
        },
        items: [
          {
            description: "Item",
            quantity: 1,
            unitPriceGross: 10000,
          },
        ],
      });

      if (!("request" in createRes)) throw new Error("Request creation failed");

      // Warehouse B attempts to edit Warehouse A's request
      await expect(
        updatePendingInvoiceRequestService(warehouseUserB, createRes.request.id, {
          customer: {
            rut: "76.432.109-K",
            legalName: "Intento no autorizado",
            businessActivity: "Comercio",
          },
          items: [
            {
              description: "Item modificado",
              quantity: 1,
              unitPriceGross: 10000,
            },
          ],
        })
      ).rejects.toThrow(/FORBIDDEN/);
    });

    it("should prevent INVOICE_EXECUTOR and MANAGEMENT from editing PENDING requests directly", async () => {
      const createRes = await createInvoiceRequestService(warehouseUserA, {
        customer: {
          rut: "76.432.109-K",
          legalName: "Cliente SpA",
          businessActivity: "Comercio",
        },
        items: [
          {
            description: "Item",
            quantity: 1,
            unitPriceGross: 10000,
          },
        ],
      });

      if (!("request" in createRes)) throw new Error("Request creation failed");

      // INVOICE_EXECUTOR attempt
      await expect(
        updatePendingInvoiceRequestService(executorUser, createRes.request.id, {
          customer: {
            rut: "76.432.109-K",
            legalName: "Cambio por ejecutor",
            businessActivity: "Comercio",
          },
          items: [
            {
              description: "Item",
              quantity: 1,
              unitPriceGross: 10000,
            },
          ],
        })
      ).rejects.toThrow(/FORBIDDEN/);

      // MANAGEMENT attempt
      await expect(
        updatePendingInvoiceRequestService(managementUser, createRes.request.id, {
          customer: {
            rut: "76.432.109-K",
            legalName: "Cambio por gerencia",
            businessActivity: "Comercio",
          },
          items: [
            {
              description: "Item",
              quantity: 1,
              unitPriceGross: 10000,
            },
          ],
        })
      ).rejects.toThrow(/FORBIDDEN/);
    });

    it("should reject modification if request status is already IN_PROGRESS (Conflict 409 / Race Condition)", async () => {
      const createRes = await createInvoiceRequestService(warehouseUserA, {
        customer: {
          rut: "76.432.109-K",
          legalName: "Cliente SpA",
          businessActivity: "Comercio",
        },
        items: [
          {
            description: "Item",
            quantity: 1,
            unitPriceGross: 10000,
          },
        ],
      });

      if (!("request" in createRes)) throw new Error("Request creation failed");

      // Claim request to transition to IN_PROGRESS
      await claimInvoiceRequestService(executorUser, createRes.request.id);

      // Requester attempts to edit while IN_PROGRESS
      await expect(
        updatePendingInvoiceRequestService(warehouseUserA, createRes.request.id, {
          customer: {
            rut: "76.432.109-K",
            legalName: "Intento de cambio tardío",
            businessActivity: "Comercio",
          },
          items: [
            {
              description: "Item modificado",
              quantity: 5,
              unitPriceGross: 10000,
            },
          ],
        })
      ).rejects.toThrow(/CONFLICT_STATE/);
    });

    it("should reject invalid customer RUT according to algorithm modulo 11", async () => {
      const createRes = await createInvoiceRequestService(warehouseUserA, {
        customer: {
          rut: "76.432.109-K",
          legalName: "Cliente SpA",
          businessActivity: "Comercio",
        },
        items: [
          {
            description: "Item",
            quantity: 1,
            unitPriceGross: 10000,
          },
        ],
      });

      if (!("request" in createRes)) throw new Error("Request creation failed");

      await expect(
        updatePendingInvoiceRequestService(warehouseUserA, createRes.request.id, {
          customer: {
            rut: "11.111.111-2", // Invalid DV
            legalName: "Cliente RUT Invalido",
            businessActivity: "Comercio",
          },
          items: [
            {
              description: "Item",
              quantity: 1,
              unitPriceGross: 10000,
            },
          ],
        })
      ).rejects.toThrow(/VALIDATION_ERROR/);
    });
  });
});
