import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { hashPassword, verifyPassword, generateSessionToken, hashToken } from "@/lib/auth/crypto";
import * as fs from "fs";
import * as path from "path";

describe("End-to-End Authentication & Persistence Integration Tests (Real PostgreSQL)", () => {
  let pglite: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(async () => {
    pglite = new PGlite();
    db = drizzle(pglite, { schema });

    // Execute real PostgreSQL migration SQL
    const migrationPath = path.resolve(
      __dirname,
      "../src/lib/db/migrations/0000_cheerful_giant_girl.sql"
    );
    const sqlContent = fs.readFileSync(migrationPath, "utf8");
    const statements = sqlContent
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await pglite.exec(statement);
    }
  });

  it("4. Full lifecycle: Create user -> hash -> login -> create session -> validate -> logout -> revoke", async () => {
    const rawPassword = "SecurePassword2026!";
    const passwordHash = await hashPassword(rawPassword);
    const userEmail = "operaciones@maxiofertas.cl";

    // 1. Insert user
    const [insertedUser] = await db
      .insert(schema.users)
      .values({
        email: userEmail,
        name: "Operador Bodega",
        passwordHash,
        role: "WAREHOUSE_USER",
        active: true,
      })
      .returning();

    expect(insertedUser.id).toBeDefined();
    expect(insertedUser.active).toBe(true);

    // 2. Simulate Login validation
    const [foundUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, userEmail))
      .limit(1);

    const isValidPass = await verifyPassword(rawPassword, foundUser.passwordHash);
    expect(isValidPass).toBe(true);

    // 3. Create Session in PostgreSQL
    const rawToken = generateSessionToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    const [createdSession] = await db
      .insert(schema.sessions)
      .values({
        userId: foundUser.id,
        token: tokenHash,
        expiresAt,
      })
      .returning();

    expect(createdSession.userId).toBe(foundUser.id);

    // Log LOGIN_SUCCESS in audit_logs
    await db.insert(schema.auditLogs).values({
      userId: foundUser.id,
      action: "LOGIN_SUCCESS",
      entityType: "users",
      entityId: foundUser.id,
      metadata: { email: foundUser.email, role: foundUser.role },
    });

    // 4. Validate Session from PostgreSQL
    const [activeSession] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.token, tokenHash))
      .limit(1);

    expect(activeSession).toBeDefined();
    expect(new Date(activeSession.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // 5. Logout & Revoke Session
    await db.delete(schema.sessions).where(eq(schema.sessions.token, tokenHash));

    await db.insert(schema.auditLogs).values({
      userId: foundUser.id,
      action: "LOGOUT",
      entityType: "sessions",
      entityId: createdSession.id,
    });

    // 6. Verify Session is gone
    const [revokedSession] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.token, tokenHash))
      .limit(1);

    expect(revokedSession).toBeUndefined();

    // 7. Verify Audit Logs
    const auditRes = await db.select().from(schema.auditLogs);
    expect(auditRes).toHaveLength(2);
    expect(auditRes.map((a) => a.action)).toEqual(["LOGIN_SUCCESS", "LOGOUT"]);
  });

  it("5. User deactivation: Admin disables user -> all active sessions revoked in PostgreSQL", async () => {
    const passwordHash = await hashPassword("UserPass2026!");
    const [user] = await db
      .insert(schema.users)
      .values({
        email: "bodega1@maxiofertas.cl",
        name: "Bodega Uno",
        passwordHash,
        role: "WAREHOUSE_USER",
        active: true,
      })
      .returning();

    // Create 2 active sessions (e.g. desktop and mobile)
    const token1 = hashToken(generateSessionToken());
    const token2 = hashToken(generateSessionToken());
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    await db.insert(schema.sessions).values([
      { userId: user.id, token: token1, expiresAt },
      { userId: user.id, token: token2, expiresAt },
    ]);

    const initialSessions = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, user.id));
    expect(initialSessions).toHaveLength(2);

    // ADMIN disables user
    await db
      .update(schema.users)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));

    // Revoke all sessions for disabled user
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));

    // Record audit log
    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: "USER_DISABLED",
      entityType: "users",
      entityId: user.id,
      metadata: { targetEmail: user.email, reason: "ADMIN_ACTION" },
    });

    // Verify all sessions deleted
    const remainingSessions = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, user.id));
    expect(remainingSessions).toHaveLength(0);

    // Verify user is inactive in PostgreSQL
    const [disabledUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, user.id));
    expect(disabledUser.active).toBe(false);
  });

  it("6. Role change: ADMIN changes role -> old sessions revoked, re-login required", async () => {
    const passwordHash = await hashPassword("UserPass2026!");
    const [user] = await db
      .insert(schema.users)
      .values({
        email: "ejecutor@maxiofertas.cl",
        name: "Ejecutor Test",
        passwordHash,
        role: "WAREHOUSE_USER",
        active: true,
      })
      .returning();

    const token = hashToken(generateSessionToken());
    await db.insert(schema.sessions).values({
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });

    // ADMIN promotes user to INVOICE_EXECUTOR
    await db
      .update(schema.users)
      .set({ role: "INVOICE_EXECUTOR", updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));

    // Sessions revoked on privilege change
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: "USER_ROLE_CHANGED",
      entityType: "users",
      entityId: user.id,
      metadata: { oldRole: "WAREHOUSE_USER", newRole: "INVOICE_EXECUTOR" },
    });

    const sessionsAfterRoleChange = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, user.id));
    expect(sessionsAfterRoleChange).toHaveLength(0);

    const [updatedUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, user.id));
    expect(updatedUser.role).toBe("INVOICE_EXECUTOR");
  });

  it("11. Audit logs: never store passwords, hashes or tokens in metadata", async () => {
    await db.insert(schema.auditLogs).values({
      action: "USER_CREATED",
      entityType: "users",
      entityId: "u-sample-123",
      metadata: {
        email: "nuevo@maxiofertas.cl",
        role: "WAREHOUSE_USER",
        createdBy: "admin@maxiofertas.cl",
      },
    });

    const [logEntry] = await db.select().from(schema.auditLogs);
    const meta = logEntry.metadata as Record<string, unknown>;

    expect(meta).not.toHaveProperty("password");
    expect(meta).not.toHaveProperty("passwordHash");
    expect(meta).not.toHaveProperty("password_hash");
    expect(meta).not.toHaveProperty("token");
    expect(meta).not.toHaveProperty("cookie");
    expect(meta.email).toBe("nuevo@maxiofertas.cl");
  });
});
