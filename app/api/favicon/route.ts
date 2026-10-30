import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { safeFetch } from "@/lib/safeFetch";

// Fetched server-side so the browser never tells a third-party icon service which sites you save.
const MAX = 100_000;
const HEADERS = {
  "Cache-Control": "private, max-age=604800",
  "X-Content-Type-Options": "nosniff",
  // SVG icons are served from our origin; never let one run script.
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

async function tryIcon(url: string) {
  try {
    const { res, body } = await safeFetch(url, { maxBytes: MAX, accept: "image/*", timeoutMs: 4000 });
    let type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/")) {
      if (type === "application/octet-stream" && url.endsWith(".ico")) type = "image/x-icon";
      else return null;
    }
    return body.length ? { body, type } : null;
  } catch {
    return null;
  }
}

async function iconFromHtml(host: string) {
  try {
    const { body, url } = await safeFetch(`https://${host}/`, { maxBytes: 200_000, accept: "text/html" });
    const html = new TextDecoder().decode(body);
    for (const tag of html.match(/<link[^>]+>/gi) ?? []) {
      if (!/rel=["'][^"']*icon[^"']*["']/i.test(tag)) continue;
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
      if (href) {
        const icon = await tryIcon(new URL(href.replace(/&amp;/g, "&"), url).toString());
        if (icon) return icon;
      }
    }
  } catch {}
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;
  const host = (req.nextUrl.searchParams.get("host") ?? "").toLowerCase();
  if (!/^[a-z0-9.-]+(:\d+)?$/.test(host)) return new NextResponse(null, { status: 400 });

  const icon = (await tryIcon(`https://${host}/favicon.ico`)) ?? (await iconFromHtml(host));
  if (!icon) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=86400" } });
  return new NextResponse(Buffer.from(icon.body), { headers: { ...HEADERS, "Content-Type": icon.type } });
}
