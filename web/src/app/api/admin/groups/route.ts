import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import {
  cityExists,
  createGroup,
  deleteGroup,
  setGroupEnabled,
} from "@/db/queries/admin";

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
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const cityId = Number(body?.cityId);
  if (!url || !Number.isInteger(cityId)) {
    return NextResponse.json(
      { error: "Group URL and city are required" },
      { status: 400 },
    );
  }
  if (!(await cityExists(cityId))) {
    return NextResponse.json({ error: "Unknown city" }, { status: 400 });
  }
  await createGroup(
    url,
    cityId,
    typeof body?.name === "string" ? body.name : undefined,
    typeof body?.fbGroupId === "string" ? body.fbGroupId : undefined,
  );
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  await setGroupEnabled(id, Boolean(body?.enabled));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  await deleteGroup(id);
  return NextResponse.json({ ok: true });
}
