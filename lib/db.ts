// Server-only storage. Upstash Redis in production; an in-memory fallback for local dev.

import { Redis } from "@upstash/redis";
import type { Bookmark } from "./bookmarks";

const BOOKMARKS = "pbm:bookmarks"; // hash: id -> JSON
const FAILS = (ip: string) => `pbm:login-fail:${ip}`;

type Store = {
  hgetall(key: string): Promise<Record<string, string> | null>;
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, values: Record<string, string>): Promise<unknown>;
  hdel(key: string, field: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

function memoryStore(): Store {
  const g = globalThis as unknown as { __pbmMem?: Map<string, unknown> };
  const m = (g.__pbmMem ??= new Map());
  const hash = (k: string) => {
    if (!m.has(k)) m.set(k, {});
    return m.get(k) as Record<string, string>;
  };
  return {
    async hgetall(k) {
      return { ...hash(k) };
    },
    async hget(k, f) {
      return hash(k)[f] ?? null;
    },
    async hset(k, v) {
      Object.assign(hash(k), v);
    },
    async hdel(k, f) {
      delete hash(k)[f];
    },
    async get(k) {
      return (m.get(k) as string) ?? null;
    },
    async incr(k) {
      const n = Number(m.get(k) ?? 0) + 1;
      m.set(k, String(n));
      return n;
    },
    async expire() {},
    async del(k) {
      m.delete(k);
    },
  };
}

let store: Store | undefined;

function db(): Store {
  if (store) return store;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    store = new Redis({ url, token, automaticDeserialization: false }) as unknown as Store;
  } else if (process.env.NODE_ENV !== "production") {
    console.warn("[pbm] No Redis configured; using in-memory storage (data is lost on restart).");
    store = memoryStore();
  } else {
    throw new Error("Redis is not configured. Connect Upstash Redis to this Vercel project.");
  }
  return store;
}

export async function listBookmarks(): Promise<Bookmark[]> {
  const all = (await db().hgetall(BOOKMARKS)) ?? {};
  return Object.values(all)
    .map((v) => JSON.parse(v) as Bookmark)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getBookmark(id: string): Promise<Bookmark | null> {
  const v = await db().hget(BOOKMARKS, id);
  return v ? (JSON.parse(v) as Bookmark) : null;
}

export async function saveBookmarks(list: Bookmark[]) {
  if (!list.length) return;
  await db().hset(BOOKMARKS, Object.fromEntries(list.map((b) => [b.id, JSON.stringify(b)])));
}

export async function deleteBookmark(id: string) {
  await db().hdel(BOOKMARKS, id);
}

/* ---------- login throttling ---------- */

export const MAX_FAILS = 10;
const FAIL_WINDOW = 15 * 60; // seconds

export async function loginFailures(ip: string) {
  return Number((await db().get(FAILS(ip))) ?? 0);
}

export async function recordLoginFailure(ip: string) {
  const n = await db().incr(FAILS(ip));
  if (n === 1) await db().expire(FAILS(ip), FAIL_WINDOW);
}

export async function clearLoginFailures(ip: string) {
  await db().del(FAILS(ip));
}
