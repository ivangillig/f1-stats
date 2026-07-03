/**
 * User records — the canonical account row.
 *
 * Populated on demand from the auth session (server-side): the first time a
 * signed-in user hits a route that needs the DB, we upsert their row. This
 * guarantees the `users` row exists before any `profiles`/`subscriptions` row
 * references it (FK), without depending on the sign-in event firing.
 *
 * `tier` is NOT overwritten on upsert — it's owned by billing (subscriptions),
 * not by the OAuth session. `role` and Google fields (name/image) are refreshed.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

export interface SessionUserLike {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  role?: string | null;
}

export function ensureUser(sessionUser: SessionUserLike): User {
  const role = sessionUser.role === "admin" ? "admin" : "user";
  const now = new Date();
  const row = db
    .insert(users)
    .values({
      id: sessionUser.id,
      email: sessionUser.email ?? `${sessionUser.id}@unknown.local`,
      name: sessionUser.name ?? null,
      image: sessionUser.image ?? null,
      role,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        // Refresh identity fields from Google; leave `tier` untouched.
        email: sessionUser.email ?? undefined,
        name: sessionUser.name ?? null,
        image: sessionUser.image ?? null,
        role,
        updatedAt: now,
      },
    })
    .returning()
    .get();
  if (!row) throw new Error(`ensureUser failed for ${sessionUser.id}`);
  return row;
}

export function getUser(userId: string): User | undefined {
  return db.select().from(users).where(eq(users.id, userId)).get();
}
