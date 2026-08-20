import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { eq, inArray, like, or } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import {
  invoiceRequests,
  invoiceRequestItems,
  requestCorrections,
  documents,
  rectifications,
  creditNotes,
} from "../src/lib/db/schema";
import { seedQa } from "../src/lib/db/seed-qa";

async function resetQa() {
  if (process.env.NODE_ENV === "production") {
    console.error("[CRITICAL SECURITY] No se puede resetear datos QA en entorno de producción.");
    process.exit(1);
  }

  const db = getDb();
  if (!db) {
    console.error("[ERROR] DATABASE_URL no está configurada.");
    process.exit(1);
  }

  console.log("===============================================================");
  console.log("      RESETEO SEGURO DE DATOS QA — ENTORNO DE PRUEBAS LOCAL    ");
  console.log("===============================================================");

  // Find QA requests (FAC-2026-00010X)
  const qaRequests = await db
    .select({ id: invoiceRequests.id })
    .from(invoiceRequests)
    .where(like(invoiceRequests.requestNumber, "FAC-2026-0001%"));

  const ids = qaRequests.map((r) => r.id);

  if (ids.length > 0) {
    console.log(`Eliminando ${ids.length} solicitudes sintéticas de QA previas...`);
    await db.delete(requestCorrections).where(inArray(requestCorrections.invoiceRequestId, ids));
    await db.delete(creditNotes).where(inArray(creditNotes.invoiceRequestId, ids));
    await db.delete(rectifications).where(inArray(rectifications.invoiceRequestId, ids));
    await db.delete(documents).where(inArray(documents.invoiceRequestId, ids));
    await db.delete(invoiceRequestItems).where(inArray(invoiceRequestItems.invoiceRequestId, ids));
    await db.delete(invoiceRequests).where(inArray(invoiceRequests.id, ids));
  }

  console.log("Solicitudes previas de QA eliminadas.");
  console.log("Re-ejecutando seed QA...");
  await seedQa();
}

resetQa().catch((err) => {
  console.error("[ERROR EN RESET QA]", err);
  process.exit(1);
});
