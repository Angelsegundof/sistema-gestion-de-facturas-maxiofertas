import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { eq } from "drizzle-orm";
import { getDb, runLocalMigrations } from "./index";
import {
  warehouses,
  users,
  customers,
  invoiceRequests,
  invoiceRequestItems,
  requestCorrections,
  documents,
  rectifications,
  RequestCorrectionReason,
} from "./schema";
import { hashPassword } from "../auth/crypto";
import { calculateNetPrice, DEFAULT_VAT_RATE_PERCENT } from "../../domain/pricing";

export const QA_PASSWORD_PLAIN = "QA_password123!";

export async function seedQa(dbOverride?: any) {
  const db = dbOverride || getDb();
  if (!db) {
    console.error("[ERROR] DATABASE_URL no está configurada.");
    return;
  }

  if ((global as any).__localPgliteInstance) {
    await runLocalMigrations((global as any).__localPgliteInstance);
  }

  console.log("===============================================================");
  console.log("      SISTEMA DE GESTIÓN DE FACTURAS — SEED QA LOCAL           ");
  console.log("===============================================================");

  const passwordHash = await hashPassword(QA_PASSWORD_PLAIN);

  // 1. SEED WAREHOUSES
  console.log("1. Creando o verificando Bodegas QA...");
  const whSantiago = (
    await db
      .insert(warehouses)
      .values({
        code: "CENTRAL",
        name: "Santiago Central",
        active: true,
      })
      .onConflictDoUpdate({
        target: warehouses.code,
        set: { name: "Santiago Central", active: true },
      })
      .returning()
  )[0];

  const whNorte = (
    await db
      .insert(warehouses)
      .values({
        code: "NORTE",
        name: "Bodega Norte",
        active: true,
      })
      .onConflictDoUpdate({
        target: warehouses.code,
        set: { name: "Bodega Norte", active: true },
      })
      .returning()
  )[0];

  // 2. SEED QA USERS
  console.log("2. Creando o actualizando Usuarios QA con roles...");
  const qaUsersData = [
    {
      email: "solicitante@maxiofertas.cl",
      name: "Juan Solicitante (Central)",
      role: "WAREHOUSE_USER" as const,
      warehouseId: whSantiago.id,
    },
    {
      email: "solicitante.norte@maxiofertas.cl",
      name: "Pedro Solicitante (Norte)",
      role: "WAREHOUSE_USER" as const,
      warehouseId: whNorte.id,
    },
    {
      email: "ejecutor@maxiofertas.cl",
      name: "María Ejecutora de Facturas",
      role: "INVOICE_EXECUTOR" as const,
      warehouseId: null,
    },
    {
      email: "jefatura@maxiofertas.cl",
      name: "Carlos Jefatura Operaciones",
      role: "MANAGEMENT" as const,
      warehouseId: null,
    },
    {
      email: "admin@maxiofertas.cl",
      name: "Administrador General",
      role: "ADMIN" as const,
      warehouseId: null,
    },
  ];

  const createdUsers: Record<string, string> = {};
  for (const u of qaUsersData) {
    const existing = await db.select().from(users).where(eq(users.email, u.email)).limit(1);
    if (existing.length > 0) {
      await db
        .update(users)
        .set({
          name: u.name,
          role: u.role,
          warehouseId: u.warehouseId,
          passwordHash,
          active: true,
        })
        .where(eq(users.id, existing[0].id));
      createdUsers[u.email] = existing[0].id;
    } else {
      const [inserted] = await db
        .insert(users)
        .values({
          email: u.email,
          name: u.name,
          role: u.role,
          warehouseId: u.warehouseId,
          passwordHash,
          active: true,
        })
        .returning();
      createdUsers[u.email] = inserted.id;
    }
  }

  // 3. SEED SYNTHETIC CUSTOMERS
  console.log("3. Creando o actualizando Clientes sintéticos...");
  const customersData = [
    {
      rutCanonical: "761234560",
      rutDisplay: "76.123.456-0",
      legalName: "Comercial Santa Fe SPA",
      businessActivity: "Distribuidora de Alimentos y Abarrotes",
      phone: "+56911223344",
      email: "contacto@santafe.cl",
    },
    {
      rutCanonical: "779876543",
      rutDisplay: "77.987.654-3",
      legalName: "Minera del Norte Ltda.",
      businessActivity: "Servicios y Suministros Mineros",
      phone: "+56988776655",
      email: "facturas@mineradelnorte.cl",
    },
    {
      rutCanonical: "76432109K",
      rutDisplay: "76.432.109-K",
      legalName: "Distribuidora Los Andes SA",
      businessActivity: "Comercio Mayorista de Insumos",
      phone: "+56977665544",
      email: "administracion@losandes.cl",
    },
  ];

  const createdCustomers: Record<string, string> = {};
  for (const c of customersData) {
    const [cust] = await db
      .insert(customers)
      .values(c)
      .onConflictDoUpdate({
        target: customers.rutCanonical,
        set: {
          legalName: c.legalName,
          businessActivity: c.businessActivity,
          phone: c.phone,
          email: c.email,
          active: true,
        },
      })
      .returning();
    createdCustomers[c.rutCanonical] = cust.id;
  }

  // 4. SEED SAMPLE INVOICE REQUESTS IN ALL OPERATIONAL STATES
  console.log("4. Creando Solicitudes de Facturación en diversos estados...");

  // Helper to create request with items
  const createSampleRequest = async (params: {
    requestNumber: string;
    warehouseId: string;
    customerRut: string;
    requestedByEmail: string;
    assignedToEmail?: string;
    status: "PENDING" | "IN_PROGRESS" | "NEEDS_CORRECTION" | "COMPLETED";
    expectedGrossTotal: number;
    notes?: string;
    items: Array<{ description: string; quantity: number; grossTotal: number }>;
    createdMinutesAgo?: number;
    completedMinutesAgo?: number;
    correctionReason?: RequestCorrectionReason;
    correctionComment?: string;
    createDocument?: boolean;
    rectificationRequested?: boolean;
  }) => {
    const cust = customersData.find((c) => c.rutCanonical === params.customerRut)!;
    const custId = createdCustomers[params.customerRut];
    const requesterId = createdUsers[params.requestedByEmail];
    const assigneeId = params.assignedToEmail ? createdUsers[params.assignedToEmail] : null;

    const createdAt = new Date(Date.now() - (params.createdMinutesAgo || 60) * 60 * 1000);
    const completedAt =
      params.status === "COMPLETED"
        ? new Date(Date.now() - (params.completedMinutesAgo || 10) * 60 * 1000)
        : null;

    // Check if request already exists
    const existing = await db
      .select()
      .from(invoiceRequests)
      .where(eq(invoiceRequests.requestNumber, params.requestNumber))
      .limit(1);

    let reqId: string;
    if (existing.length > 0) {
      reqId = existing[0].id;
      await db
        .update(invoiceRequests)
        .set({
          status: params.status,
          assignedTo: assigneeId,
          expectedGrossTotal: params.expectedGrossTotal,
          siiGrossTotal: params.status === "COMPLETED" ? params.expectedGrossTotal : null,
          reconciliationStatus: params.status === "COMPLETED" ? "MATCH" : null,
          completedAt,
        })
        .where(eq(invoiceRequests.id, reqId));
    } else {
      const [inserted] = await db
        .insert(invoiceRequests)
        .values({
          requestNumber: params.requestNumber,
          warehouseId: params.warehouseId,
          customerId: custId,
          requestedBy: requesterId,
          assignedTo: assigneeId,
          status: params.status,
          customerRutSnapshot: cust.rutDisplay,
          customerLegalNameSnapshot: cust.legalName,
          customerBusinessActivitySnapshot: cust.businessActivity,
          customerPhoneSnapshot: cust.phone,
          customerEmailSnapshot: cust.email,
          expectedGrossTotal: params.expectedGrossTotal,
          siiGrossTotal: params.status === "COMPLETED" ? params.expectedGrossTotal : null,
          grossDifference: params.status === "COMPLETED" ? 0 : null,
          reconciliationStatus: params.status === "COMPLETED" ? "MATCH" : null,
          notes: params.notes,
          createdAt,
          assignedAt: assigneeId ? createdAt : null,
          completedAt,
        })
        .returning();
      reqId = inserted.id;

      // Insert Items
      let line = 1;
      for (const itm of params.items) {
        const net = calculateNetPrice(itm.grossTotal, DEFAULT_VAT_RATE_PERCENT);
        await db.insert(invoiceRequestItems).values({
          invoiceRequestId: reqId,
          lineNumber: line++,
          description: itm.description,
          quantity: itm.quantity,
          unitPriceGross: Math.round(itm.grossTotal / itm.quantity),
          unitPriceNet: Math.round(net / itm.quantity),
          lineTotalGross: itm.grossTotal,
          lineTotalNet: net,
          vatRate: "19.00",
          createdAt,
        });
      }
    }

    // Add observation if NEEDS_CORRECTION
    if (params.status === "NEEDS_CORRECTION" && params.correctionReason) {
      await db.insert(requestCorrections).values({
        invoiceRequestId: reqId,
        reason: params.correctionReason,
        comment: params.correctionComment || "Por favor verificar los datos de facturación.",
        requestedBy: createdUsers["ejecutor@maxiofertas.cl"],
        createdAt: new Date(),
      });
    }

    // Add Document if COMPLETED
    if (params.createDocument) {
      const docExists = await db
        .select()
        .from(documents)
        .where(eq(documents.invoiceRequestId, reqId))
        .limit(1);

      let docId: string;
      if (docExists.length === 0) {
        const [doc] = await db
          .insert(documents)
          .values({
            documentType: "INVOICE",
            storageProvider: "R2",
            storageKey: `facturas/qa/${params.requestNumber}.pdf`,
            fileName: `${params.requestNumber}.pdf`,
            mimeType: "application/pdf",
            fileSize: 15420,
            invoiceRequestId: reqId,
            isVoided: false,
            uploadedBy: createdUsers["ejecutor@maxiofertas.cl"],
            createdAt: completedAt || new Date(),
          })
          .returning();
        docId = doc.id;
      } else {
        docId = docExists[0].id;
      }

      // Add Rectification if requested
      if (params.rectificationRequested) {
        const rectExists = await db
          .select()
          .from(rectifications)
          .where(eq(rectifications.invoiceRequestId, reqId))
          .limit(1);

        if (rectExists.length === 0) {
          await db.insert(rectifications).values({
            invoiceRequestId: reqId,
            originalInvoiceDocumentId: docId,
            requestedBy: requesterId,
            reason: "PRICE",
            comment: "El cliente solicitó descuento adicional del 10% acordado comercialmente.",
            status: "REQUESTED",
            requestedAt: new Date(Date.now() - 30 * 60 * 1000),
          });
        }
      }
    }
  };

  // Case 1: PENDING (Oldest in queue - Santiago, created >3 days ago)
  await createSampleRequest({
    requestNumber: "FAC-2026-000101",
    warehouseId: whSantiago.id,
    customerRut: "761234560",
    requestedByEmail: "solicitante@maxiofertas.cl",
    status: "PENDING",
    expectedGrossTotal: 125000,
    createdMinutesAgo: 4560, // 3 days 4 hours ago
    notes: "Despacho con flete prioritario",
    items: [
      { description: "Pack 10 Cajas Aceite Vegetal 1L", quantity: 10, grossTotal: 75000 },
      { description: "Sacos de Arroz Grano Largo 5kg", quantity: 5, grossTotal: 50000 },
    ],
  });

  // Case 2: PENDING (Recent - Bodega Norte)
  await createSampleRequest({
    requestNumber: "FAC-2026-000102",
    warehouseId: whNorte.id,
    customerRut: "779876543",
    requestedByEmail: "solicitante.norte@maxiofertas.cl",
    status: "PENDING",
    expectedGrossTotal: 250000,
    createdMinutesAgo: 45,
    items: [
      { description: "Insumos de Limpieza Industrial 20L", quantity: 5, grossTotal: 150000 },
      { description: "Pack Mascarillas y Guantes Nitrilo", quantity: 10, grossTotal: 100000 },
    ],
  });

  // Case 3: IN_PROGRESS (Claimed by María Ejecutora)
  await createSampleRequest({
    requestNumber: "FAC-2026-000103",
    warehouseId: whSantiago.id,
    customerRut: "76432109K",
    requestedByEmail: "solicitante@maxiofertas.cl",
    assignedToEmail: "ejecutor@maxiofertas.cl",
    status: "IN_PROGRESS",
    expectedGrossTotal: 95000,
    createdMinutesAgo: 120,
    items: [{ description: "Bebidas y Jugos en Lata x24", quantity: 4, grossTotal: 95000 }],
  });

  // Case 4: NEEDS_CORRECTION (Requires warehouse fix)
  await createSampleRequest({
    requestNumber: "FAC-2026-000104",
    warehouseId: whSantiago.id,
    customerRut: "761234560",
    requestedByEmail: "solicitante@maxiofertas.cl",
    status: "NEEDS_CORRECTION",
    expectedGrossTotal: 45000,
    createdMinutesAgo: 240,
    correctionReason: "INCOMPLETE_PRODUCTS",
    correctionComment: "Falta detallar los códigos y especificaciones técnicas de los productos.",
    items: [{ description: "Artículos de Oficina y Papelería", quantity: 1, grossTotal: 45000 }],
  });

  // Case 5: COMPLETED (Emitted invoice with document viewable - Completed yesterday)
  await createSampleRequest({
    requestNumber: "FAC-2026-000105",
    warehouseId: whSantiago.id,
    customerRut: "761234560",
    requestedByEmail: "solicitante@maxiofertas.cl",
    assignedToEmail: "ejecutor@maxiofertas.cl",
    status: "COMPLETED",
    expectedGrossTotal: 119000,
    createdMinutesAgo: 1600,
    completedMinutesAgo: 1560, // Completed yesterday
    createDocument: true,
    items: [{ description: "Set Herramientas Básicas", quantity: 2, grossTotal: 119000 }],
  });

  // Case 6: COMPLETED with Rectification Requested (Completed yesterday, rectification requested 30m ago)
  await createSampleRequest({
    requestNumber: "FAC-2026-000106",
    warehouseId: whSantiago.id,
    customerRut: "76432109K",
    requestedByEmail: "solicitante@maxiofertas.cl",
    assignedToEmail: "ejecutor@maxiofertas.cl",
    status: "COMPLETED",
    expectedGrossTotal: 85000,
    createdMinutesAgo: 1720,
    completedMinutesAgo: 1680, // Completed yesterday
    createDocument: true,
    rectificationRequested: true,
    items: [{ description: "Pack Alimentos No Perecibles", quantity: 5, grossTotal: 85000 }],
  });

  console.log("===============================================================");
  console.log("          ? SEED QA COMPLETADO EXITOSAMENTE                   ");
  console.log("===============================================================");
  console.log("Usuarios QA listos:");
  console.log("  - Solicitante Central: solicitante@maxiofertas.cl");
  console.log("  - Solicitante Norte:   solicitante.norte@maxiofertas.cl");
  console.log("  - Ejecutor Facturas:   ejecutor@maxiofertas.cl");
  console.log("  - Jefatura:            jefatura@maxiofertas.cl");
  console.log("  - Admin:               admin@maxiofertas.cl");
  console.log(`Contraseña para todos:   ${QA_PASSWORD_PLAIN}`);
  console.log("===============================================================");
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").includes("seed-qa")) {
  seedQa().catch((err) => {
    console.error("[FATAL ERROR SEED QA]", err);
    process.exit(1);
  });
}
