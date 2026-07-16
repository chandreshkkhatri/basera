import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { databaseSslConfig } from "./ssl";

// DATABASE_URL is the canonical name; NEON_DATABASE_URL covers Vercel's Neon
// marketplace integration, which injects its variables with a NEON_ prefix
// (the pooled URL — right for runtime traffic).
const connectionString =
  process.env.DATABASE_URL ??
  process.env.NEON_DATABASE_URL ??
  "postgres://basera:basera@localhost:5433/basera";

// Cache the pool on globalThis so dev HMR doesn't open a new pool per reload.
const globalForDb = globalThis as unknown as {
  __baseraPool?: Pool;
};

const pool =
  globalForDb.__baseraPool ??
  new Pool({ connectionString, max: 10, ssl: databaseSslConfig(connectionString) });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__baseraPool = pool;
}

export const db = drizzle(pool, { schema });
export { schema };
