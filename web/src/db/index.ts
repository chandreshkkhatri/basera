import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { databaseSslConfig } from "./ssl";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://basera:basera@localhost:5433/basera";

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
