import { neon } from "@neondatabase/serverless";

const dbUrl = "postgresql://neondb_owner:npg_f34HIsxYDvwb@ep-bitter-hat-aepq975y-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require";
const sql = neon(dbUrl);

async function main() {
  console.log("=== 1. RATE LIMITS IN NEON ===");
  const rateLimitRows = await sql`SELECT * FROM rate_limits;`;
  console.log(JSON.stringify(rateLimitRows, null, 2));

  console.log("\n=== 2. AUDIT LOGS (LOGIN ATTEMPTS) ===");
  const auditLogs = await sql`
    SELECT id, user_id, action, entity_type, entity_id, metadata, ip_address, created_at
    FROM audit_logs
    WHERE action LIKE '%LOGIN%'
    ORDER BY created_at DESC
    LIMIT 30;
  `;
  console.log(JSON.stringify(auditLogs, null, 2));

  console.log("\n=== 3. USERS (JENI & ANGEL) ===");
  const users = await sql`
    SELECT id, email, name, role, active, created_at
    FROM users
    WHERE email ILIKE '%jeni%' OR email ILIKE '%sistemasecuweb%';
  `;
  console.log(JSON.stringify(users, null, 2));
}

main().catch(console.error);
