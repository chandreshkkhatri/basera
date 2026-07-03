import { defineConfig } from "drizzle-kit";

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
