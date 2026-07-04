import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't auto-load .env.local (that's a Next.js convention), so
// load it here to match how the app connects.
config({ path: ".env.local", quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://basera:basera@localhost:5433/basera",
  },
  // Keep generated SQL migrations authoritative; never `push`.
  strict: true,
  verbose: true,
});
