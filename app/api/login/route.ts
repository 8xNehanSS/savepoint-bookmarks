import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, MAX_AGE, authConfigured, createSession } from "@/lib/auth";
import { MAX_FAILS, clearLoginFailures, loginFailures, recordLoginFailure } from "@/lib/db";

function safeEqual(a: string, b: string) {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

export async function POST(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json({ error: "Server not configured: set APP_USERNAME, APP_PASSWORD and AUTH_SECRET." }, { status: 500 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if ((await loginFailures(ip)) >= MAX_FAILS) {
    return NextResponse.json({ error: "Too many failed attempts. Try again in 15 minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const userOk = safeEqual(String(body.username ?? ""), process.env.APP_USERNAME!);
  const passOk = safeEqual(String(body.password ?? ""), process.env.APP_PASSWORD!);
  if (!(userOk && passOk)) {
    await recordLoginFailure(ip);
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }

  await clearLoginFailures(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await createSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return res;
}
