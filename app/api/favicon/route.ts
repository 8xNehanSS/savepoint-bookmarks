import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { normalizeUrl } from "@/lib/bookmarks";
import { safeFetch } from "@/lib/safeFetch";

// Fetched server-side so your browser never contacts an icon service. The site itself is tried first;
// public icon services are only asked (for the domain, never the full link) when the site gives nothing.
const MAX = 300_000;
const OWN_BUDGET_MS = 8000;
const HEADERS = {
  "Cache-Control": "private, max-age=604800",
  "X-Content-Type-Options": "nosniff",
  // SVG icons are served from our origin; never let one run script.
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

type Found = { body: Uint8Array; type: string };

/** Tells the image type from its bytes, since servers often label icons wrongly (or send an HTML block page). */
function sniff(b: Uint8Array): string | null {
  const ascii = (from: number, len: number) => String.fromCharCode(...b.subarray(from, from + len));
  if (b[0] === 0x89 && ascii(1, 3) === "PNG") return "image/png";
  if (b[0] === 0 && b[1] === 0 && (b[2] === 1 || b[2] === 2) && b[3] === 0) return "image/x-icon";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (ascii(4, 4) === "ftyp" && /avif|avis/.test(ascii(8, 4))) return "image/avif";
  if (b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
  const head = new TextDecoder().decode(b.subarray(0, 1000)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || ((head.startsWith("<?xml") || head.startsWith("<!--")) && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

async function tryIcon(url: string): Promise<Found | null> {
  try {
    const { body } = await safeFetch(url, { maxBytes: MAX, accept: "image/*", timeoutMs: 4000 });
    const type = body.length ? sniff(body) : null;
    return type ? { body, type } : null;
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

/** Icons listed in a web app manifest, biggest (up to 256px) first. */
async function iconsFromManifest(url: string) {
  try {
    const { body } = await safeFetch(url, { maxBytes: 100_000, accept: "application/manifest+json,application/json" });
    const icons = (JSON.parse(new TextDecoder().decode(body)).icons ?? []) as { src?: string; sizes?: string }[];
    return icons
      .filter((i) => typeof i.src === "string")
      .map((i) => ({ href: new URL(i.src!, url).toString(), score: Math.min(Number(i.sizes?.match(/(\d+)x/)?.[1] ?? 64), 256) }));
  } catch {
    return [];
  }
}

/** Icons a page declares in its <head> or manifest, best first. */
async function iconsFromHtml(pageUrl: string) {
  try {
    const { body, url } = await safeFetch(pageUrl, { maxBytes: 300_000, accept: "text/html" });
    const html = new TextDecoder().decode(body);
    const base = html.match(/<base[^>]+href=["']([^"']+)["']/i)?.[1];
    const root = base ? new URL(base, url) : url;
    const icons: { href: string; score: number }[] = [];
    let manifest: string | null = null;
    for (const tag of html.match(/<link[^>]+>/gi) ?? []) {
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, "&");
      if (!href) continue;
      try {
        if (/rel=["']manifest["']/i.test(tag)) manifest = new URL(href, root).toString();
        else if (/rel=["'][^"']*icon[^"']*["']/i.test(tag) && score(tag) >= 0) icons.push({ href: new URL(href, root).toString(), score: score(tag) });
      } catch {}
    }
    if (manifest) icons.push(...(await iconsFromManifest(manifest)));
    return { finalUrl: url, icons: icons.sort((a, b) => b.score - a.score).map((i) => i.href) };
  } catch {
    return { finalUrl: null, icons: [] };
  }
}

/** Walks every place a site might keep its icon, from the saved page itself up to the parent domain. */
async function ownIcon(pageUrl: URL): Promise<Found | null> {
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

/** Last resort: public icon caches, which crawl sites we can't reach (bot walls, logins, slow servers). */
async function serviceIcon(host: string): Promise<Found | null> {
  const h = encodeURIComponent(host);
  return (
    (await tryIcon(`https://icons.duckduckgo.com/ip3/${h}.ico`)) ??
    (await tryIcon(`https://www.google.com/s2/favicons?domain=${h}&sz=64`))
  );
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

  const budget = new Promise<null>((r) => setTimeout(() => r(null), OWN_BUDGET_MS));
  const icon = (await Promise.race([ownIcon(pageUrl), budget])) ?? (await serviceIcon(pageUrl.hostname));
  // Short negative cache, so a site that was down gets another chance soon.
  if (!icon) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=3600" } });
  return new NextResponse(Buffer.from(icon.body), { headers: { ...HEADERS, "Content-Type": icon.type } });
}
