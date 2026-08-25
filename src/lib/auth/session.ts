import { eq, and, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, ensureDbReady } from "../db";
import { sessions, users, NewSession } from "../db/schema";
import { generateSessionToken, hashToken } from "./crypto";
import { SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS } from "./cookies";
import { SanitizedUser } from "@/domain/types";

export interface SessionValidationResult {
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
  user: SanitizedUser;
}

export async function createSession(
  userId: string,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<string> {
  await ensureDbReady();
  const db = getDb();
  if (!db) {
    throw new Error("Database is not configured");
  }

  const rawToken = generateSessionToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);

  const newSession: NewSession = {
    userId,
    token: tokenHash,
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
    expiresAt,
  };

  await db.insert(sessions).values(newSession);
  return rawToken;
}

export async function validateSession(rawToken: string): Promise<SessionValidationResult | null> {
  await ensureDbReady();
  const db = getDb();
  if (!db || !rawToken) {
    return null;
  }

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  // Find active session where expiresAt > now
  const sessionList = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.token, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  if (sessionList.length === 0) {
    return null;
  }

  const currentSession = sessionList[0];

  // Fetch associated user
  const userList = await db
    .select()
    .from(users)
    .where(eq(users.id, currentSession.userId))
    .limit(1);

  if (userList.length === 0) {
    return null;
  }

  const user = userList[0];

  // If user is disabled/inactive, session is immediately invalid
  if (!user.active) {
    await revokeSession(rawToken);
    return null;
  }

  const sanitizedUser: SanitizedUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    warehouseId: user.warehouseId,
    active: user.active,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };

  return {
    session: {
      id: currentSession.id,
      userId: currentSession.userId,
      expiresAt: currentSession.expiresAt,
    },
    user: sanitizedUser,
  };
}

export async function revokeSession(rawToken: string): Promise<void> {
  const db = getDb();
  if (!db || !rawToken) {
    return;
  }

  const tokenHash = hashToken(rawToken);
  await db.delete(sessions).where(eq(sessions.token, tokenHash));
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  const db = getDb();
  if (!db || !userId) {
    return;
  }

  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function getServerSession(): Promise<SessionValidationResult | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return null;
    }
    return await validateSession(token);
  } catch {
    return null;
  }
}
