type PgSslConfig = { rejectUnauthorized: false };

function envForcesSsl(): boolean | null {
  const value = (process.env.DATABASE_SSL ?? process.env.PGSSLMODE)?.toLowerCase();
  if (!value) return null;
  if (["1", "true", "require", "verify-ca", "verify-full"].includes(value)) {
    return true;
  }
  if (["0", "false", "disable"].includes(value)) {
    return false;
  }
  return null;
}

function isLocalDatabaseUrl(connectionString: string): boolean {
  try {
    const hostname = new URL(connectionString).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return /@(localhost|127\.0\.0\.1)(?::|\/|$)/.test(connectionString);
  }
}

function urlRequiresSsl(connectionString: string): boolean | null {
  try {
    const sslMode = new URL(connectionString).searchParams.get("sslmode")?.toLowerCase();
    if (!sslMode) return null;
    if (["require", "verify-ca", "verify-full"].includes(sslMode)) return true;
    if (sslMode === "disable") return false;
  } catch {
    if (/sslmode=(require|verify-ca|verify-full)/i.test(connectionString)) return true;
    if (/sslmode=disable/i.test(connectionString)) return false;
  }
  return null;
}

/**
 * Hosted Postgres (Neon, Supabase, RDS) usually requires TLS; local dev does
 * not. Prefer explicit env/URL settings, then default production non-local
 * connections to TLS.
 */
export function databaseSslConfig(connectionString: string): PgSslConfig | undefined {
  const forced = envForcesSsl();
  if (forced !== null) return forced ? { rejectUnauthorized: false } : undefined;

  const fromUrl = urlRequiresSsl(connectionString);
  if (fromUrl !== null) return fromUrl ? { rejectUnauthorized: false } : undefined;

  if (process.env.NODE_ENV === "production" && !isLocalDatabaseUrl(connectionString)) {
    return { rejectUnauthorized: false };
  }

  return undefined;
}
