import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { cleanInput } from "@/lib/bookmarks";
import { deleteBookmark, getBookmark, saveBookmarks } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  const { id } = await params;
  const current = await getBookmark(id);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let input;
  try {
    // Partial updates (e.g. just { pinned }) merge onto the stored bookmark.
    input = cleanInput({ ...current, ...(await req.json()) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const bm = { ...current, ...input, updatedAt: Date.now() };
  await saveBookmarks([bm]);
  return NextResponse.json(bm);
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  const { id } = await params;
  await deleteBookmark(id);
  return NextResponse.json({ ok: true });
}
