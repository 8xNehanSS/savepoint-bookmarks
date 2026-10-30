// Session tokens: "<expiry>.<HMAC(expiry)>". Uses Web Crypto so it runs in middleware too.
// The HMAC key includes APP_PASSWORD, so changing the password signs out every session.

export const COOKIE = "pbm_session";
export const MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

const enc = new TextEncoder();

export function authConfigured() {
  return Boolean(process.env.APP_USERNAME && process.env.APP_PASSWORD && process.env.AUTH_SECRET);
}

function key() {
  const material = `${process.env.AUTH_SECRET}\0${process.env.APP_PASSWORD}`;
  return crypto.subtle.importKey("raw", enc.encode(material), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function toB64url(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function createSession() {
  const exp = String(Date.now() + MAX_AGE * 1000);
  const sig = await crypto.subtle.sign("HMAC", await key(), enc.encode(exp));
  return `${exp}.${toB64url(sig)}`;
}

export async function verifySession(token: string | undefined) {
  if (!token || !authConfigured()) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  try {
    return await crypto.subtle.verify("HMAC", await key(), fromB64url(sig), enc.encode(exp));
  } catch {
    return false;
  }
}
