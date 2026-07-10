import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createCity, setCityEnabled } from "@/db/queries/admin";

async function guard(): Promise<NextResponse | null> {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "City name required" }, { status: 400 });
  }
  await createCity(name);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  const enabled = Boolean(body?.enabled);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  await setCityEnabled(id, enabled);
  return NextResponse.json({ ok: true });
}
