import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { eq } from "drizzle-orm";
import { getDb, runLocalMigrations } from "../src/lib/db";
import { warehouses, users, Role } from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/auth/crypto";
import { logAuditEvent } from "../src/lib/auth/audit";

interface RealUserDefinition {
  name: string;
  email: string;
  role: Role;
  warehouseCode?: string;
}

const WAREHOUSE_DEFINITIONS = [
  { code: "CENTRAL", name: "Santiago Central" },
  { code: "RANCAGUA", name: "Bodega Rancagua" },
  { code: "CASTRO", name: "Bodega Castro Chiloé" },
  { code: "CONCEPCION", name: "Bodega Concepción" },
  { code: "TEMUCO", name: "Bodega Temuco" },
  { code: "TALCA", name: "Bodega Talca" },
  { code: "VINA", name: "Bodega Viña del Mar" },
  { code: "ANTOFAGASTA", name: "Bodega Antofagasta" },
  { code: "CHILLAN", name: "Bodega Chillán" },
  { code: "PUERTO_MONTT", name: "Bodega Puerto Montt" },
  { code: "LOS_ANGELES", name: "Bodega Los Ángeles" },
  { code: "CURICO", name: "Bodega Curicó" },
  { code: "VALDIVIA", name: "Bodega Valdivia" },
  { code: "LA_SERENA", name: "Bodega La Serena" },
];

const REAL_USERS: RealUserDefinition[] = [
  // 1. Admin
  {
    name: "Angel Ferrer",
    email: "sistemasecuweb@gmail.com",
    role: "ADMIN",
  },
  // 2. Management
  {
    name: "Miyelis Contreras",
    email: "miyelics@gmail.com",
    role: "MANAGEMENT",
  },
  {
    name: "Keyla Contreras",
    email: "keila.maxiofertas@gmail.com",
    role: "MANAGEMENT",
  },
  // 3. Invoice Executors
  {
    name: "Aracelis Cardenas",
    email: "verocars1178@gmail.com",
    role: "INVOICE_EXECUTOR",
  },
  {
    name: "Yuliany Alecio",
    email: "maxiofertasmeli@gmail.com",
    role: "INVOICE_EXECUTOR",
  },
  {
    name: "Jeni Contreras",
    email: "jenimaxiofetas@gmail.com",
    role: "INVOICE_EXECUTOR",
  },
  // 4. Warehouse Users (Solicitantes)
  {
    name: "Bodega Santiago",
    email: "santiago.maxiofertas@gmail.com",
    role: "WAREHOUSE_USER",
    warehouseCode: "CENTRAL",
  },
  {
    name: "Bodega Rancagua",
    email: "bodegarancagua13@gmail.com",
    role: "WAREHOUSE_USER",
    warehouseCode: "RANCAGUA",
  },
  {
    name: "Bodega Castro Chiloe",
    email: "bodegacastrochiloe@gmail.com",
    role: "WAREHOUSE_USER",
    warehouseCode: "CASTRO",
  },
  {
    name: "Bodega Concepción",
    email: "megaofertas379@gmail.com",
    role: "WAREHOUSE_USER",
    warehouseCode: "CONCEPCION",
  },
  {
    name: "Bodega Temuco",
    email: "temuco.maxiofertas@gmail.com",
    role: "WAREHOUSE_USER",
    warehouseCode: "TEMUCO",
  },
  {
    name: "Bodega Talca",
    email: "bodegatalca63@gmail.com",
    role: "WAREHOUSE_USER",
    warehouseCode: "TALCA",
  },
  {
    name: "Bodega Viña",
    email: "bodegavina56@gmail.com",
    role: "WAREHOUSE_USER",
    warehouseCode: "VINA",
  },
  {
    name: "Bodega Antofagasta",
    email: "antofagastaonline7@gmail.com",
    role: "WAREHOUSE_USER",
    warehouseCode: "ANTOFAGASTA",
  },
  {
    name: "Bodega Chillán",
    email: "bodegachillan84@gmail.com",
    role: "WAREHOUSE_USER",
    warehouseCode: "CHILLAN",
  },
  {
    name: "Bodega Pto Montt",
    email: "1523ofertas@gmail.com",
    role: "WAREHOUSE_USER",
    warehouseCode: "PUERTO_MONTT",
  },
  {
    name: "Bodega Los Angeles",
    email: "bodegalosangels8@gmail.com",
    role: "WAREHOUSE_USER",
    warehouseCode: "LOS_ANGELES",
  },
  {
    name: "Bodega Curicó",
    email: "vcurico0@gmail.com",
    role: "WAREHOUSE_USER",
    warehouseCode: "CURICO",
  },
  {
    name: "Bodega Valdivia",
    email: "bodegavaldiva829@gmail.com",
    role: "WAREHOUSE_USER",
    warehouseCode: "VALDIVIA",
  },
  {
    name: "Bodega la Serena",
    email: "bodegalaserena392@gmail.com",
    role: "WAREHOUSE_USER",
    warehouseCode: "LA_SERENA",
  },
];

export async function importRealUsersService(dbOverride?: any) {
  const db = dbOverride || getDb();
  if (!db) {
    throw new Error("Base de datos no disponible.");
  }

  if ((global as any).__localPgliteInstance) {
    await runLocalMigrations((global as any).__localPgliteInstance);
  }

  console.log("===============================================================");
  console.log("    PROVISIONAMIENTO DE USUARIOS REALES — MAXIOFERTAS          ");
  console.log("===============================================================");

  // 1. Provision / update warehouses
  console.log("1. Verificando y provisionando 14 bodegas físicas...");
  const warehouseMap = new Map<string, string>(); // code -> id

  for (const whDef of WAREHOUSE_DEFINITIONS) {
    const existing = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.code, whDef.code))
      .limit(1);

    if (existing.length > 0) {
      warehouseMap.set(whDef.code, existing[0].id);
      await db
        .update(warehouses)
        .set({ name: whDef.name, active: true, updatedAt: new Date() })
        .where(eq(warehouses.id, existing[0].id));
    } else {
      const [inserted] = await db
        .insert(warehouses)
        .values({
          code: whDef.code,
          name: whDef.name,
          active: true,
        })
        .returning();
      warehouseMap.set(whDef.code, inserted.id);
    }
  }

  console.log(`✓ ${warehouseMap.size} bodegas registradas exitosamente.`);

  // 2. Provision real users
  console.log("2. Provisionando 20 usuarios reales del personal...");
  const defaultPasswordHash = await hashPassword("Maxiofertas2026!");

  let insertedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;

  for (const u of REAL_USERS) {
    const normalizedEmail = u.email.trim().toLowerCase();
    const warehouseId = u.warehouseCode ? warehouseMap.get(u.warehouseCode) || null : null;

    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingUser.length === 0) {
      await db.insert(users).values({
        email: normalizedEmail,
        name: u.name,
        passwordHash: defaultPasswordHash,
        role: u.role,
        warehouseId: warehouseId,
        active: true,
      });
      insertedCount++;
      console.log(`  + [NUEVO] ${u.name} (${normalizedEmail}) -> ${u.role}`);
    } else {
      const current = existingUser[0];
      const needsUpdate =
        current.name !== u.name ||
        current.role !== u.role ||
        current.warehouseId !== warehouseId ||
        !current.active;

      if (needsUpdate) {
        await db
          .update(users)
          .set({
            name: u.name,
            role: u.role,
            warehouseId: warehouseId,
            active: true,
            updatedAt: new Date(),
          })
          .where(eq(users.id, current.id));
        updatedCount++;
        console.log(`  * [ACTUALIZADO] ${u.name} (${normalizedEmail}) -> ${u.role}`);
      } else {
        unchangedCount++;
        console.log(`  = [SIN CAMBIOS] ${u.name} (${normalizedEmail})`);
      }
    }
  }

  await logAuditEvent({
    action: "USERS_IMPORT_COMPLETED",
    entityType: "users",
    metadata: {
      total: REAL_USERS.length,
      inserted: insertedCount,
      updated: updatedCount,
      unchanged: unchangedCount,
    },
  });

  console.log("===============================================================");
  console.log("    ✓ PROVISIONAMIENTO COMPLETADO EXITOSAMENTE                 ");
  console.log(`    Insertados: ${insertedCount} | Actualizados: ${updatedCount} | Sin cambios: ${unchangedCount}`);
  console.log("===============================================================");

  return {
    total: REAL_USERS.length,
    inserted: insertedCount,
    updated: updatedCount,
    unchanged: unchangedCount,
    warehouseCount: warehouseMap.size,
  };
}

if (require.main === module) {
  importRealUsersService()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[ERROR EN PROVISIONAMIENTO]", err);
      process.exit(1);
    });
}
