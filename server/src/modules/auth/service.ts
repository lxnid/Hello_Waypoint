import { randomUUID } from 'node:crypto';
import { compare } from 'bcryptjs';
import { and, eq, gt, isNull, sql as sqlExpr } from 'drizzle-orm';
import type { User } from '@waypoint/contracts';
import type { Database } from '../../db/client.js';
import { sessions, users } from '../../db/schema.js';

export type SessionIdentity = { user: User; sessionId: string; expiresAt: Date };

export async function authenticate(
  db: Database,
  email: string,
  password: string,
  ttlSeconds: number,
): Promise<SessionIdentity | null> {
  const normalized = email.trim().toLowerCase();
  const [record] = await db
    .select()
    .from(users)
    .where(eq(sqlExpr`lower(${users.email})`, normalized))
    .limit(1);
  // A fixed dummy hash keeps unknown-account and wrong-password paths comparable.
  const dummyHash = '$2b$12$KIXQ4rk4iM0xCnl.37SRXueua.cBRI.iFVPJb0wDnIY6uE0XVWXcy';
  const matches = await compare(password, record?.passwordHash ?? dummyHash);
  if (!record || !record.isActive || !matches) return null;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const sessionId = randomUUID();
  await db.insert(sessions).values({ id: sessionId, userId: record.id, expiresAt });
  return { user: publicUser(record), sessionId, expiresAt };
}

export async function getSession(
  db: Database,
  sessionId: string,
  userId: string,
): Promise<SessionIdentity | null> {
  const [result] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        eq(users.isActive, true),
      ),
    )
    .limit(1);
  return result
    ? { sessionId, expiresAt: result.session.expiresAt, user: publicUser(result.user) }
    : null;
}

export async function revokeSession(db: Database, sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

function publicUser(record: typeof users.$inferSelect): User {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    role: record.role,
    depot: record.depot,
    outletId: record.outletId,
  };
}
