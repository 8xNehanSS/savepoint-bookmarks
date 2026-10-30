import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { cleanInput, type Bookmark } from "@/lib/bookmarks";
import { listBookmarks, saveBookmarks } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  return NextResponse.json(await listBookmarks());
}

/** Creates a bookmark, or updates the existing one if the URL is already saved. */
export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  let input;
  try {
    input = cleanInput(await req.json());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const now = Date.now();
  const existing = (await listBookmarks()).find((b) => b.url === input.url);
  const bm: Bookmark = existing
    ? { ...existing, ...input, updatedAt: now }
    : { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now };
  await saveBookmarks([bm]);
  return NextResponse.json(bm, { status: existing ? 200 : 201 });
}
