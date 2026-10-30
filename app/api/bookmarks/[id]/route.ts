import { NextResponse, type NextRequest } from "next/server";
import { cleanInput } from "@/lib/bookmarks";
import { deleteBookmark, getBookmark, saveBookmarks } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const current = await getBookmark(id);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let input;
  try {
    input = cleanInput(await req.json());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const bm = { ...current, ...input, updatedAt: Date.now() };
  await saveBookmarks([bm]);
  return NextResponse.json(bm);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  await deleteBookmark(id);
  return NextResponse.json({ ok: true });
}
