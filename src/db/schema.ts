/**
 * App database schema (Drizzle ORM).
 *
 * This is THE application database — users, their profiles, and (forward-looking)
 * their subscriptions. Defined once here; runs on SQLite today (better-sqlite3)
 * and migrates to Postgres later by swapping the driver + regenerating migrations.
 *
 * NOT to be confused with the proxy's telemetry archive (proxy/data/f1-sessions.db),
 * which is a separate F1 replay cache in a different process.
 *
 * Auth adapter tables (accounts / sessions / verificationTokens) are intentionally
 * absent: auth runs JWT-only (session lives in the cookie), so those would be dead
 * tables. Add the Drizzle NextAuth adapter schema if/when moving to DB sessions.
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Kept in sync with TIERS in src/lib/tiers.ts.
const TIER_VALUES = ["free", "pro", "pro_plus"] as const;

const nowMs = sql`(unixepoch() * 1000)`;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // auth subject id (token.sub)
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  // Effective current tier — denormalized for fast per-request reads.
  // Billing source of truth is the `subscriptions` table (drives this value).
  tier: text("tier", { enum: TIER_VALUES }).notNull().default("free"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
});

export const profiles = sqliteTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  username: text("username"),
  country: text("country"),
  favoriteTeam: text("favorite_team"),
  favoriteDriver: text("favorite_driver"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
});

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  plan: text("plan", { enum: TIER_VALUES }).notNull().default("free"),
  status: text("status", {
    enum: ["active", "canceled", "past_due", "trialing"],
  })
    .notNull()
    .default("active"),
  provider: text("provider"), // 'stripe' | 'mercadopago' | ...
  externalId: text("external_id"), // subscription id at the payment provider
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
});

export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
