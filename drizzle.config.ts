import type { Config } from "drizzle-kit";

// Drizzle Kit config — schema source, migration output, and dev DB target.
// Migrating to Postgres later: change `dialect` to "postgresql" and point
// dbCredentials at DATABASE_URL, then regenerate migrations.
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.APP_DB_PATH || "./data/app.db",
  },
} satisfies Config;
