import { describe, it, expect, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import * as dbModule from "@/lib/db";
import * as sessionModule from "@/lib/auth/session";
import { PATCH, GET as GET_BY_ID } from "@/app/api/v1/customers/[id]/route";
import { GET as GET_BY_RUT } from "@/app/api/v1/customers/by-rut/[rut]/route";
import { GET as GET_SEARCH } from "@/app/api/v1/customers/route";
import { SanitizedUser } from "@/domain/types";
import { NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";

describe("MEJORA OPERATIVA — Administración y Corrección Controlada de Clientes", () => {
  let pglite: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let executorUser: SanitizedUser;
  let managementUser: SanitizedUser;
  let adminUser: SanitizedUser;
  let warehouseUser: SanitizedUser;
  let warehouse: schema.Warehouse;
  let customerPistacho: schema.Customer;
  let customerBenova: schema.Customer;

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

    const [wh] = await db
      .insert(schema.warehouses)
      .values({ code: "CENTRAL", name: "Bodega Central", active: true })
      .returning();
    warehouse = wh;

    const insertedUsers = await db
      .insert(schema.users)
      .values([
        {
          email: "ejecutor@maxiofertas.cl",
          name: "Ejecutor Facturas",
          passwordHash: "hash",
          role: "INVOICE_EXECUTOR",
          active: true,
        },
        {
          email: "gerencia@maxiofertas.cl",
          name: "Jefatura Finanzas",
          passwordHash: "hash",
          role: "MANAGEMENT",
          active: true,
        },
        {
          email: "admin@maxiofertas.cl",
          name: "Admin General",
          passwordHash: "hash",
          role: "ADMIN",
          active: true,
        },
        {
          email: "bodega@maxiofertas.cl",
          name: "Operador Bodega",
          passwordHash: "hash",
          role: "WAREHOUSE_USER",
          warehouseId: warehouse.id,
          active: true,
        },
      ])
      .returning();

    executorUser = {
      id: insertedUsers[0].id,
      email: insertedUsers[0].email,
      name: insertedUsers[0].name,
      role: insertedUsers[0].role,
      warehouseId: insertedUsers[0].warehouseId,
      active: insertedUsers[0].active,
      createdAt: insertedUsers[0].createdAt.toISOString(),
      updatedAt: insertedUsers[0].updatedAt.toISOString(),
    };

    managementUser = {
      id: insertedUsers[1].id,
      email: insertedUsers[1].email,
      name: insertedUsers[1].name,
      role: insertedUsers[1].role,
      warehouseId: insertedUsers[1].warehouseId,
      active: insertedUsers[1].active,
      createdAt: insertedUsers[1].createdAt.toISOString(),
      updatedAt: insertedUsers[1].updatedAt.toISOString(),
    };

    adminUser = {
      id: insertedUsers[2].id,
      email: insertedUsers[2].email,
      name: insertedUsers[2].name,
      role: insertedUsers[2].role,
      warehouseId: insertedUsers[2].warehouseId,
      active: insertedUsers[2].active,
      createdAt: insertedUsers[2].createdAt.toISOString(),
      updatedAt: insertedUsers[2].updatedAt.toISOString(),
    };

    warehouseUser = {
      id: insertedUsers[3].id,
      email: insertedUsers[3].email,
      name: insertedUsers[3].name,
      role: insertedUsers[3].role,
      warehouseId: insertedUsers[3].warehouseId,
      active: insertedUsers[3].active,
      createdAt: insertedUsers[3].createdAt.toISOString(),
      updatedAt: insertedUsers[3].updatedAt.toISOString(),
    };

    // Insert the two target customers
    // 1. Correct record: 78.294.682-K -> Inversiones Benova Spa
    const [cBenova] = await db
      .insert(schema.customers)
      .values({
        rutCanonical: "78294682K",
        rutDisplay: "78.294.682-K",
        legalName: "Inversiones Benova Spa",
        businessActivity: "VENTAS POR MENOR POR INTERNET",
        phone: "+569 95000946",
        email: "benova@cliente.cl",
        active: true,
      })
      .returning();
    customerBenova = cBenova;

    // 2. Erroneous record: 76.056.097-9 -> Inversiones Benova Spa (to be corrected to GRUPO PISTACHO SPA)
    const [cPistacho] = await db
      .insert(schema.customers)
      .values({
        rutCanonical: "760560979",
        rutDisplay: "76.056.097-9",
        legalName: "Inversiones Benova Spa",
        businessActivity: "Ventas por menor por Internet",
        phone: "+569 95000946",
        email: null,
        active: true,
      })
      .returning();
    customerPistacho = cPistacho;
  });

  const mockSession = (user: SanitizedUser | null) => {
    if (!user) {
      vi.spyOn(sessionModule, "getServerSession").mockResolvedValue(null);
    } else {
      vi.spyOn(sessionModule, "getServerSession").mockResolvedValue({
        user,
        session: {
          id: "session-id",
          userId: user.id,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
    }
  };

  const createPatchRequest = (body: any, id: string) => {
    return new NextRequest(`http://localhost:3000/api/v1/customers/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        origin: "http://localhost:3000",
        host: "localhost:3000",
        "sec-fetch-site": "same-origin",
        "user-agent": "Vitest Customer Test",
      },
      body: JSON.stringify(body),
    });
  };

  // CASO 1: INVOICE_EXECUTOR actualiza razón social -> PASS
  it("Caso 1 — INVOICE_EXECUTOR actualiza razón social (PASS)", async () => {
    mockSession(executorUser);
    const req = createPatchRequest(
      { legalName: "GRUPO PISTACHO SPA" },
      customerPistacho.id
    );

    const res = await PATCH(req, {
      params: Promise.resolve({ id: customerPistacho.id }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.customer.legalName).toBe("GRUPO PISTACHO SPA");
    expect(body.data.customer.rut).toBe("76.056.097-9");

    // Verificar en DB
    const [inDb] = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.id, customerPistacho.id));
    expect(inDb.legalName).toBe("GRUPO PISTACHO SPA");

    // Verificar que Benova NO fue alterado
    const [benovaInDb] = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.id, customerBenova.id));
    expect(benovaInDb.legalName).toBe("Inversiones Benova Spa");
  });

  // CASO 2: MANAGEMENT actualiza teléfono y correo -> PASS
  it("Caso 2 — MANAGEMENT actualiza teléfono/correo (PASS)", async () => {
    mockSession(managementUser);
    const req = createPatchRequest(
      {
        phone: "+569 88887777",
        email: "contacto@grupopistacho.cl",
      },
      customerPistacho.id
    );

    const res = await PATCH(req, {
      params: Promise.resolve({ id: customerPistacho.id }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.customer.phone).toBe("+569 88887777");
    expect(body.data.customer.email).toBe("contacto@grupopistacho.cl");
  });

  // CASO 3: ADMIN actualiza datos maestros -> PASS
  it("Caso 3 — ADMIN actualiza datos maestros (PASS)", async () => {
    mockSession(adminUser);
    const req = createPatchRequest(
      {
        legalName: "GRUPO PISTACHO SPA",
        businessActivity: "Comercialización y Distribución Mayorista",
        phone: "+569 11223344",
        email: "admin@grupopistacho.cl",
      },
      customerPistacho.id
    );

    const res = await PATCH(req, {
      params: Promise.resolve({ id: customerPistacho.id }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.customer.legalName).toBe("GRUPO PISTACHO SPA");
    expect(body.data.customer.businessActivity).toBe(
      "Comercialización y Distribución Mayorista"
    );
  });

  // CASO 4: WAREHOUSE_USER intenta modificar cliente -> 403
  it("Caso 4 — WAREHOUSE_USER intenta modificar cliente (403 FORBIDDEN)", async () => {
    mockSession(warehouseUser);
    const req = createPatchRequest(
      { legalName: "HACK NOMBRE" },
      customerPistacho.id
    );

    const res = await PATCH(req, {
      params: Promise.resolve({ id: customerPistacho.id }),
    });
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  // CASO 5: Usuario no autenticado -> 401
  it("Caso 5 — Usuario no autenticado (401 UNAUTHORIZED)", async () => {
    mockSession(null);
    const req = createPatchRequest(
      { legalName: "INTENTO NO AUTORIZADO" },
      customerPistacho.id
    );

    const res = await PATCH(req, {
      params: Promise.resolve({ id: customerPistacho.id }),
    });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  // CASO 6: Modificar RUT -> DENIED / Inmutable
  it("Caso 6 — Intentar modificar RUT devuelve 400 (RUT inmutable)", async () => {
    mockSession(adminUser);
    const req = createPatchRequest(
      {
        legalName: "GRUPO PISTACHO SPA",
        rut: "11.111.111-1",
      },
      customerPistacho.id
    );

    const res = await PATCH(req, {
      params: Promise.resolve({ id: customerPistacho.id }),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("RUT_IMMUTABLE");

    // Verificar que el RUT no cambió
    const [inDb] = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.id, customerPistacho.id));
    expect(inDb.rutCanonical).toBe("760560979");
    expect(inDb.rutDisplay).toBe("76.056.097-9");
  });

  // CASO 7: Cliente inexistente -> 404
  it("Caso 7 — Cliente inexistente devuelve 404", async () => {
    mockSession(adminUser);
    const fakeId = "00000000-0000-0000-0000-000000000099";
    const req = createPatchRequest({ legalName: "TEST 404" }, fakeId);

    const res = await PATCH(req, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("CUSTOMER_NOT_FOUND");
  });

  // CASO 8: Auditoría obligatoria con before / after
  it("Caso 8 — Auditoría obligatoria registra CUSTOMER_UPDATED con before/after", async () => {
    mockSession(executorUser);
    const req = createPatchRequest(
      { legalName: "GRUPO PISTACHO SPA" },
      customerPistacho.id
    );

    await PATCH(req, {
      params: Promise.resolve({ id: customerPistacho.id }),
    });

    const logs = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, customerPistacho.id));

    expect(logs.length).toBeGreaterThanOrEqual(1);
    const audit = logs[logs.length - 1];
    expect(audit.action).toBe("CUSTOMER_UPDATED");
    expect(audit.entityType).toBe("customers");
    expect(audit.userId).toBe(executorUser.id);

    const metadata = audit.metadata as any;
    expect(metadata.customerRut).toBe("760560979");
    expect(metadata.changes).toBeDefined();
    expect(metadata.changes.legal_name).toEqual({
      before: "Inversiones Benova Spa",
      after: "GRUPO PISTACHO SPA",
    });
  });

  // CASO 9: Histórico protegido — Factura previa mantiene snapshot original
  it("Caso 9 — Factura histórica mantiene su snapshot original intacto al actualizar cliente maestro", async () => {
    // 1. Crear una solicitud previa con snapshot "Inversiones Benova Spa"
    const [requestPrior] = await db
      .insert(schema.invoiceRequests)
      .values({
        requestNumber: "FAC-2026-000309",
        warehouseId: warehouse.id,
        customerId: customerPistacho.id,
        requestedBy: warehouseUser.id,
        status: "COMPLETED",
        customerRutSnapshot: "76.056.097-9",
        customerLegalNameSnapshot: "Inversiones Benova Spa",
        customerBusinessActivitySnapshot: "Ventas por menor por Internet",
        expectedGrossTotal: 100000,
        siiGrossTotal: 100000,
      })
      .returning();

    // 2. Actualizar el cliente maestro a "GRUPO PISTACHO SPA"
    mockSession(adminUser);
    const req = createPatchRequest(
      { legalName: "GRUPO PISTACHO SPA" },
      customerPistacho.id
    );
    await PATCH(req, {
      params: Promise.resolve({ id: customerPistacho.id }),
    });

    // 3. Verificar que la factura histórica mantiene intacto su snapshot original
    const [requestAfter] = await db
      .select()
      .from(schema.invoiceRequests)
      .where(eq(schema.invoiceRequests.id, requestPrior.id));

    expect(requestAfter.customerLegalNameSnapshot).toBe("Inversiones Benova Spa");
    expect(requestAfter.customerRutSnapshot).toBe("76.056.097-9");
  });

  // CASO 10: Autocompletado devuelve la razón social corregida
  it("Caso 10 — Autocompletado / by-rut devuelve la razón social corregida (GRUPO PISTACHO SPA)", async () => {
    // 1. Actualizar maestro
    mockSession(executorUser);
    const patchReq = createPatchRequest(
      { legalName: "GRUPO PISTACHO SPA" },
      customerPistacho.id
    );
    await PATCH(patchReq, {
      params: Promise.resolve({ id: customerPistacho.id }),
    });

    // 2. Consultar vía /by-rut/ con formato display
    mockSession(warehouseUser);
    const getByRutReq = new NextRequest(
      "http://localhost:3000/api/v1/customers/by-rut/76.056.097-9"
    );
    const getByRutRes = await GET_BY_RUT(getByRutReq, {
      params: Promise.resolve({ rut: "76.056.097-9" }),
    });

    expect(getByRutRes.status).toBe(200);
    const getByRutData = await getByRutRes.json();
    expect(getByRutData.success).toBe(true);
    expect(getByRutData.data.customer.legalName).toBe("GRUPO PISTACHO SPA");
    expect(getByRutData.data.customer.rutCanonical).toBe("760560979");

    // 3. Consultar vía /by-rut/ con formato sin puntos
    const getByRawRutRes = await GET_BY_RUT(getByRutReq, {
      params: Promise.resolve({ rut: "760560979" }),
    });
    expect(getByRawRutRes.status).toBe(200);
    const getByRawRutData = await getByRawRutRes.json();
    expect(getByRawRutData.data.customer.legalName).toBe("GRUPO PISTACHO SPA");

    // 4. Consultar vía búsqueda general de clientes
    const searchReq = new NextRequest(
      "http://localhost:3000/api/v1/customers?q=PISTACHO"
    );
    const searchRes = await GET_SEARCH(searchReq);
    expect(searchRes.status).toBe(200);
    const searchData = await searchRes.json();
    expect(searchData.success).toBe(true);
    const found = searchData.data.customers.find(
      (c: any) => c.rutCanonical === "760560979"
    );
    expect(found).toBeDefined();
    expect(found.legalName).toBe("GRUPO PISTACHO SPA");
  });
});
