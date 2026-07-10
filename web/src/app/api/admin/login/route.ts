import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, adminConfigured, checkToken } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json(
      { error: "Admin is not configured. Set ADMIN_TOKEN in the environment." },
      { status: 503 },
    );
  }
  const body = await request.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : "";
  if (!checkToken(token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
