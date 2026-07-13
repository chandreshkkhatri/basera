import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import {
  isKnownAlertCategory,
  setAlertCategoryEnabled,
} from "@/db/queries/admin";

export async function PATCH(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const category = typeof body?.category === "string" ? body.category : "";
  const enabled = Boolean(body?.enabled);
  if (!isKnownAlertCategory(category)) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }
  await setAlertCategoryEnabled(category, enabled);
  return NextResponse.json({ ok: true });
}
