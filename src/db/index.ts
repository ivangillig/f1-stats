/**
 * App database connection (Drizzle + better-sqlite3).
 *
 * Server-side only. Opens the SQLite file, enforces foreign keys, and applies
 * any pending migrations at startup so the tables always match the schema.
 * A single connection is reused across dev hot-reloads via globalThis.
 */

import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "./schema";

const DATA_DIR = process.env.PROFILES_DIR || path.join(process.cwd(), "data");
const DB_PATH = process.env.APP_DB_PATH || path.join(DATA_DIR, "app.db");
const MIGRATIONS_DIR =
  process.env.DRIZZLE_DIR || path.join(process.cwd(), "drizzle");

const globalForDb = globalThis as unknown as {
  appDb?: BetterSQLite3Database<typeof schema>;
};

function createDb(): BetterSQLite3Database<typeof schema> {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  const database = drizzle(sqlite, { schema });
  // Idempotent: only applies migrations not yet recorded in the DB.
  migrate(database, { migrationsFolder: MIGRATIONS_DIR });
  return database;
}

export const db = globalForDb.appDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.appDb = db;

export { schema };
