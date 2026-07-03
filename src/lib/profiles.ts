/**
 * User profile store (Drizzle-backed).
 *
 * The editable, user-facing fields — 1:1 with a `users` row. Server-side only
 * (imported by the profile API route and profile server component). Callers must
 * ensure the user row exists first (see ensureUser) so the FK holds.
 *
 * Interface is unchanged from earlier (getProfile / updateProfile) so the API
 * route and UI don't care that the backing store moved JSON → SQLite → Drizzle.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";

export interface UserProfile {
  username?: string;
  country?: string;
  favoriteTeam?: string;
  favoriteDriver?: string;
  updatedAt?: string;
}

export function getProfile(userId: string): UserProfile {
  const row = db.select().from(profiles).where(eq(profiles.userId, userId)).get();
  if (!row) return {};
  return {
    username: row.username ?? undefined,
    country: row.country ?? undefined,
    favoriteTeam: row.favoriteTeam ?? undefined,
    favoriteDriver: row.favoriteDriver ?? undefined,
    updatedAt: row.updatedAt?.toISOString(),
  };
}

export function updateProfile(
  userId: string,
  updates: Partial<UserProfile>
): UserProfile {
  // Merge with existing so a partial update doesn't wipe untouched fields.
  const existing = getProfile(userId);
  const merged = { ...existing, ...updates };
  const now = new Date();

  db.insert(profiles)
    .values({
      userId,
      username: merged.username ?? null,
      country: merged.country ?? null,
      favoriteTeam: merged.favoriteTeam ?? null,
      favoriteDriver: merged.favoriteDriver ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        username: merged.username ?? null,
        country: merged.country ?? null,
        favoriteTeam: merged.favoriteTeam ?? null,
        favoriteDriver: merged.favoriteDriver ?? null,
        updatedAt: now,
      },
    })
    .run();

  return { ...merged, updatedAt: now.toISOString() };
}
