"use client";

import { useCallback, useEffect, useState } from "react";

export type Bookmark = {
  id: string;
  url: string;
  title: string;
  notes: string;
  category: string;
  createdAt: number;
  updatedAt: number;
};

export type BookmarkInput = Pick<Bookmark, "url" | "title" | "notes" | "category">;

const KEY = "pbm:bookmarks:v1";
const EVENT = "pbm:change";

export const UNCATEGORIZED = "Uncategorized";

function read(): Bookmark[] {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function write(list: Bookmark[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function normalizeUrl(url: string) {
  const u = url.trim();
  if (!u) return u;
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
}

function clean(input: BookmarkInput): BookmarkInput {
  const url = normalizeUrl(input.url);
  return {
    url,
    title: input.title.trim() || url,
    notes: input.notes.trim(),
    category: input.category.trim() || UNCATEGORIZED,
  };
}

export function addBookmark(input: BookmarkInput): Bookmark {
  const now = Date.now();
  const bm: Bookmark = { id: uid(), ...clean(input), createdAt: now, updatedAt: now };
  write([bm, ...read()]);
  return bm;
}

export function findByUrl(url: string) {
  const u = normalizeUrl(url);
  return read().find((b) => b.url === u);
}

export function updateBookmark(id: string, input: BookmarkInput) {
  write(read().map((b) => (b.id === id ? { ...b, ...clean(input), updatedAt: Date.now() } : b)));
}

export function deleteBookmark(id: string) {
  write(read().filter((b) => b.id !== id));
}

export function renameCategory(from: string, to: string) {
  const name = to.trim() || UNCATEGORIZED;
  write(read().map((b) => (b.category === from ? { ...b, category: name } : b)));
}

export function exportJson() {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), bookmarks: read() }, null, 2);
}

/** Merges imported bookmarks, skipping URLs that already exist. Returns number added. */
export function importJson(text: string): number {
  const data = JSON.parse(text);
  const incoming: unknown[] = Array.isArray(data) ? data : data?.bookmarks;
  if (!Array.isArray(incoming)) throw new Error("No bookmarks found in file");
  const list = read();
  const seen = new Set(list.map((b) => b.url));
  let added = 0;
  for (const item of incoming) {
    const b = item as Partial<Bookmark>;
    if (!b || typeof b.url !== "string") continue;
    const c = clean({ url: b.url, title: b.title ?? "", notes: b.notes ?? "", category: b.category ?? "" });
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    const now = Date.now();
    list.push({ id: uid(), ...c, createdAt: b.createdAt ?? now, updatedAt: b.updatedAt ?? now });
    added++;
  }
  write(list);
  return added;
}

/** Live view of all bookmarks; syncs across tabs (e.g. the bookmarklet popup). */
export function useBookmarks() {
  const [list, setList] = useState<Bookmark[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => setList(read()), []);

  useEffect(() => {
    refresh();
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) refresh();
    };
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  return { bookmarks: list, ready };
}

/* ---------- search ---------- */

export function tokenize(q: string) {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Every term must appear somewhere; title hits weigh more than notes/url. */
export function search(list: Bookmark[], q: string): Bookmark[] {
  const terms = tokenize(q);
  if (!terms.length) return list;
  const scored: { b: Bookmark; s: number }[] = [];
  for (const b of list) {
    const title = b.title.toLowerCase();
    const url = b.url.toLowerCase();
    const notes = b.notes.toLowerCase();
    const cat = b.category.toLowerCase();
    let s = 0;
    let ok = true;
    for (const t of terms) {
      const hit = (title.includes(t) ? 4 : 0) + (cat.includes(t) ? 3 : 0) + (url.includes(t) ? 2 : 0) + (notes.includes(t) ? 1 : 0);
      if (!hit) {
        ok = false;
        break;
      }
      s += hit;
    }
    if (ok) scored.push({ b, s });
  }
  return scored.sort((a, z) => z.s - a.s || z.b.createdAt - a.b.createdAt).map((x) => x.b);
}
