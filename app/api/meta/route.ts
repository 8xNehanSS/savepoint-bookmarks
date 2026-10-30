import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { normalizeUrl } from "@/lib/bookmarks";
import { safeFetch } from "@/lib/safeFetch";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function metaContent(html: string, prop: string) {
  const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, "i"))?.[0];
  return tag?.match(/content=["']([^"']*)["']/i)?.[1];
}

/** Looks up a page's title so the add form can fill it in. */
export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  const raw = req.nextUrl.searchParams.get("url") ?? "";
  try {
    const { body } = await safeFetch(normalizeUrl(raw), { maxBytes: 300_000, accept: "text/html,*/*;q=0.5" });
    const html = new TextDecoder().decode(body);
    const found = metaContent(html, "og:title") ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const title = decode(found).replace(/\s+/g, " ").trim().slice(0, 300);
    return NextResponse.json({ title });
  } catch {
    return NextResponse.json({ title: "" });
  }
}
