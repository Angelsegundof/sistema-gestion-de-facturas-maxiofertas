import { neon } from "@neondatabase/serverless";
import * as bcrypt from "bcryptjs";

const dbUrl = "postgresql://neondb_owner:npg_f34HIsxYDvwb@ep-bitter-hat-aepq975y-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require";
const sql = neon(dbUrl);

async function main() {
  console.log("1. Buscando bodegas OSORNO y COPIAPO...");
  const whs = await sql`SELECT id, code, name FROM warehouses WHERE code IN ('OSORNO', 'COPIAPO')`;
  console.log("Bodegas encontradas:", whs);

  const passwordHash = await bcrypt.hash("Maxiofertas2026!", 10);

  for (const wh of whs) {
    const email = wh.code === "OSORNO" ? "bodegaosorno9@gmail.com" : "copiapoatencion@gmail.com";
    const name = wh.name;

    const existing = await sql`SELECT id, email FROM users WHERE email = ${email}`;
    if (existing.length === 0) {
      const inserted = await sql`
        INSERT INTO users (email, name, password_hash, role, warehouse_id, active)
        VALUES (${email}, ${name}, ${passwordHash}, 'WAREHOUSE_USER', ${wh.id}, true)
        RETURNING id, email, name, role;
      `;
      console.log("✓ Usuario creado:", inserted);
    } else {
      const updated = await sql`
        UPDATE users
        SET name = ${name}, password_hash = ${passwordHash}, role = 'WAREHOUSE_USER', warehouse_id = ${wh.id}, active = true, updated_at = now()
        WHERE email = ${email}
        RETURNING id, email, name, role;
      `;
      console.log("✓ Usuario actualizado:", updated);
    }
  }

  const allWarehouseUsers = await sql`
    SELECT u.id, u.email, u.name, u.role, u.active, w.name as warehouse_name
    FROM users u
    LEFT JOIN warehouses w ON u.warehouse_id = w.id
    WHERE w.code IN ('OSORNO', 'COPIAPO')
    ORDER BY u.created_at DESC;
  `;
  console.log("Usuarios de Osorno y Copiapo registrados:", allWarehouseUsers);
}

main().catch(console.error);
