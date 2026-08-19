import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { getDb } from "./index";
import { users } from "./schema";
import { hashPassword } from "../auth/crypto";

async function main() {
  const db = getDb();
  if (!db) {
    console.error("? DATABASE_URL is not configured.");
    process.exit(1);
  }

  const email = process.env.ADMIN_INITIAL_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  const name = process.env.ADMIN_INITIAL_NAME || "Administrador Maxiofertas";

  if (!email || !password) {
    console.error(
      "? Por favor define ADMIN_INITIAL_EMAIL y ADMIN_INITIAL_PASSWORD en tu entorno o .env.local para aprovisionar el primer ADMIN."
    );
    process.exit(1);
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    console.log(`?? El usuario administrador (${email}) ya existe en la base de datos.`);
    process.exit(0);
  }

  const passwordHash = await hashPassword(password);

  await db.insert(users).values({
    email,
    name,
    passwordHash,
    role: "ADMIN",
    active: true,
  });

  console.log(`? Usuario administrador (${email}) inicializado exitosamente con rol ADMIN.`);
}

main().catch((err) => {
  console.error("? Error al crear usuario administrador inicial:", err);
  process.exit(1);
});
