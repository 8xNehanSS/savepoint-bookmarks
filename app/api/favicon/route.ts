import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { normalizeUrl } from "@/lib/bookmarks";
import { safeFetch } from "@/lib/safeFetch";

// Fetched server-side so the browser never tells a third-party icon service which sites you save.
const MAX = 300_000;
const HEADERS = {
  "Cache-Control": "private, max-age=604800",
  "X-Content-Type-Options": "nosniff",
  // SVG icons are served from our origin; never let one run script.
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

type Found = { body: Uint8Array; type: string };

async function tryIcon(url: string): Promise<Found | null> {
  try {
    const { res, body } = await safeFetch(url, { maxBytes: MAX, accept: "image/*", timeoutMs: 4000 });
    let type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/")) {
      if ((type === "application/octet-stream" || type === "text/plain" || !type) && /\.ico(\?|$)/i.test(url)) type = "image/x-icon";
      else return null;
    }
    return body.length ? { body, type } : null;
  } catch {
    return null;
  }
}

/** Ranks a <link> icon: big touch icons and SVGs first, tiny 16px icons last. */
function score(tag: string) {
  const rel = tag.match(/rel=["']([^"']+)["']/i)?.[1].toLowerCase() ?? "";
  if (rel.includes("mask-icon")) return -1; // monochrome Safari pin, renders as a black blob
  const sizes = tag.match(/sizes=["'](\d+)x\d+["']/i)?.[1];
  let s = sizes ? Math.min(Number(sizes), 256) : 32;
  if (/\.svg(\?|$)|image\/svg/i.test(tag)) s = 200;
  if (rel.includes("apple-touch-icon")) s += 100;
  return s;
}

/** Icons a page declares in its <head>, best first. */
async function iconsFromHtml(pageUrl: string) {
  try {
    const { body, url } = await safeFetch(pageUrl, { maxBytes: 300_000, accept: "text/html" });
    const html = new TextDecoder().decode(body);
    const base = html.match(/<base[^>]+href=["']([^"']+)["']/i)?.[1];
    const root = base ? new URL(base, url) : url;
    const icons: { href: string; score: number }[] = [];
    for (const tag of html.match(/<link[^>]+>/gi) ?? []) {
      if (!/rel=["'][^"']*icon[^"']*["']/i.test(tag)) continue;
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
      const s = score(tag);
      if (!href || s < 0) continue;
      try {
        icons.push({ href: new URL(href.replace(/&amp;/g, "&"), root).toString(), score: s });
      } catch {}
    }
    return { finalUrl: url, icons: icons.sort((a, b) => b.score - a.score).map((i) => i.href) };
  } catch {
    return { finalUrl: null, icons: [] };
  }
}

/** Walks every place a site might keep its icon, from the saved page itself up to the parent domain. */
async function findIcon(pageUrl: URL): Promise<Found | null> {
  const tried = new Set<string>();
  const attempt = async (u: string) => {
    if (tried.has(u)) return null;
    tried.add(u);
    return tryIcon(u);
  };
  const fromPage = async (u: string) => {
    const { finalUrl, icons } = await iconsFromHtml(u);
    for (const href of icons.slice(0, 4)) {
      const icon = await attempt(href);
      if (icon) return icon;
    }
    return finalUrl ? attempt(new URL("/favicon.ico", finalUrl).toString()) : null;
  };

  const origin = pageUrl.origin;
  const isRoot = pageUrl.pathname === "/" && !pageUrl.search;
  if (!isRoot) {
    const icon = await fromPage(pageUrl.toString());
    if (icon) return icon;
  }
  const icon = (await fromPage(`${origin}/`)) ?? (await attempt(`${origin}/favicon.ico`));
  if (icon) return icon;

  // docs.example.com often has no icon of its own; example.com almost always does.
  const parts = pageUrl.hostname.split(".");
  if (parts.length > 2) {
    const parent = parts.slice(-2).join(".");
    const icon = (await fromPage(`https://${parent}/`)) ?? (await attempt(`https://${parent}/favicon.ico`));
    if (icon) return icon;
  }
  if (!pageUrl.hostname.startsWith("www.")) return fromPage(`https://www.${pageUrl.hostname}/`);
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  const params = req.nextUrl.searchParams;
  let pageUrl: URL;
  try {
    const host = params.get("host");
    pageUrl = new URL(host ? `https://${host}/` : normalizeUrl(params.get("url") ?? ""));
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") return new NextResponse(null, { status: 400 });

  const icon = await findIcon(pageUrl);
  if (!icon) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=86400" } });
  return new NextResponse(Buffer.from(icon.body), { headers: { ...HEADERS, "Content-Type": icon.type } });
}
