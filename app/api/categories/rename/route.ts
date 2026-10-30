import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { UNCATEGORIZED } from "@/lib/bookmarks";
import { listBookmarks, saveBookmarks } from "@/lib/db";

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const from = String(body.from ?? "");
  const to = String(body.to ?? "").trim().slice(0, 100) || UNCATEGORIZED;
  const now = Date.now();
  const changed = (await listBookmarks())
    .filter((b) => b.category === from)
    .map((b) => ({ ...b, category: to, updatedAt: now }));
  await saveBookmarks(changed);
  return NextResponse.json({ updated: changed.length });
}
