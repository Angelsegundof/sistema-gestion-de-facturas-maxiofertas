import { neon } from "@neondatabase/serverless";
import * as bcrypt from "bcryptjs";

const dbUrl = "postgresql://neondb_owner:npg_f34HIsxYDvwb@ep-bitter-hat-aepq975y-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require";
const sql = neon(dbUrl);

async function main() {
  console.log("Generando hash para 'Maxiofertas2026!'...");
  const passwordHash = await bcrypt.hash("Maxiofertas2026!", 10);

  console.log("Actualizando usuario Jeni Contreras en Neon...");
  const updated = await sql`
    UPDATE users 
    SET 
      email = 'jenimaxiofertas@gmail.com',
      password_hash = ${passwordHash},
      active = true,
      updated_at = now()
    WHERE email ILIKE '%jeni%' OR name ILIKE '%jeni%'
    RETURNING id, email, name, role, active;
  `;
  console.log("Usuario actualizado:", updated);

  console.log("Limpiando bloqueos en rate_limits...");
  await sql`DELETE FROM rate_limits;`;

  console.log("Verificando usuario final en base de datos:");
  const finalCheck = await sql`
    SELECT id, email, name, role, active 
    FROM users 
    WHERE email = 'jenimaxiofertas@gmail.com';
  `;
  console.log(finalCheck);
}

main().catch(console.error);
