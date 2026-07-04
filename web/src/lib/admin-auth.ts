import { cookies } from "next/headers";

/**
 * Minimal env-gated admin gate (v1 has no user accounts). A single shared
 * secret in `ADMIN_TOKEN` is exchanged for an httpOnly cookie at login; the
 * /admin page and /api/admin/* routes check it. If `ADMIN_TOKEN` is unset,
 * admin access is disabled entirely (secure default).
 */
export const ADMIN_COOKIE = "basera_admin";

export function adminConfigured(): boolean {
  return !!process.env.ADMIN_TOKEN;
}

export function checkToken(token: string): boolean {
  const expected = process.env.ADMIN_TOKEN;
  return !!expected && token === expected;
}

export async function isAdmin(): Promise<boolean> {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const cookie = (await cookies()).get(ADMIN_COOKIE)?.value;
  return !!cookie && cookie === expected;
}
