import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { databaseSslConfig } from "./src/db/ssl";

// drizzle-kit doesn't auto-load .env.local (that's a Next.js convention), so
// load it here to match how the app connects.
config({ path: ".env.local", quiet: true });

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://basera:basera@localhost:5433/basera";

function dbCredentials(url: string) {
  const ssl = databaseSslConfig(url);
  if (!ssl) return { url };

  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : undefined,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    ssl,
  };
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: dbCredentials(databaseUrl),
  // Keep generated SQL migrations authoritative; never `push`.
  strict: true,
  verbose: true,
});
