import { neon } from "@neondatabase/serverless";

const dbUrl = "postgresql://neondb_owner:npg_f34HIsxYDvwb@ep-bitter-hat-aepq975y-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require";
const sql = neon(dbUrl);

async function main() {
  console.log("1. Limpiando bloqueos en la tabla rate_limits...");
  await sql`DELETE FROM rate_limits;`;
  console.log("✓ rate_limits tabla limpiada.");

  console.log("2. Verificando y corrigiendo correo de Jeni Contreras...");
  const updatedUser = await sql`
    UPDATE users
    SET email = 'jenimaxiofertas@gmail.com', updated_at = now()
    WHERE email = 'jenimaxiofetas@gmail.com'
    RETURNING id, email, name, role;
  `;
  console.log("Resultado de corrección de correo:", updatedUser);

  console.log("3. Verificando usuarios actualizados:");
  const users = await sql`
    SELECT id, email, name, role, active 
    FROM users 
    WHERE email IN ('jenimaxiofertas@gmail.com', 'sistemasecuweb@gmail.com');
  `;
  console.log(users);
}

main().catch(console.error);
