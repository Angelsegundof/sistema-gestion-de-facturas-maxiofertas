import { neon } from "@neondatabase/serverless";
import * as bcrypt from "bcryptjs";

const dbUrl = "postgresql://neondb_owner:npg_f34HIsxYDvwb@ep-bitter-hat-aepq975y-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require";
const sql = neon(dbUrl);

async function main() {
  console.log("1. Limpiando bloqueos en rate_limits...");
  await sql`DELETE FROM rate_limits;`;

  const passwordHash = await bcrypt.hash("Maxiofertas2026!", 10);

  console.log("2. Verificando y actualizando Keila / Keyla...");
  await sql`
    UPDATE users
    SET 
      password_hash = ${passwordHash},
      active = true,
      updated_at = now()
    WHERE email ILIKE '%kei%' OR email ILIKE '%key%' OR name ILIKE '%keyla%';
  `;

  console.log("3. Verificando y actualizando Jeni...");
  await sql`
    UPDATE users
    SET 
      password_hash = ${passwordHash},
      active = true,
      updated_at = now()
    WHERE email ILIKE '%jeni%' OR name ILIKE '%jeni%';
  `;

  console.log("4. Estado final de usuarios en Neon:");
  const users = await sql`
    SELECT id, email, name, role, active 
    FROM users 
    WHERE email ILIKE '%kei%' OR email ILIKE '%jeni%';
  `;
  console.log(users);
}

main().catch(console.error);
