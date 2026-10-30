"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Bookmark, BookmarkInput } from "./bookmarks";

export * from "./bookmarks";

/* ---------- API ---------- */

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  if (res.status === 401) {
    location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    throw new Error("Signed out");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

/* ---------- shared cache, synced across tabs ---------- */

type State = { bookmarks: Bookmark[]; ready: boolean; error: string };

let state: State = { bookmarks: [], ready: false, error: "" };
const listeners = new Set<() => void>();
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("pbm") : null;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export async function refresh() {
  try {
    set({ bookmarks: await api<Bookmark[]>("/api/bookmarks"), ready: true, error: "" });
  } catch (e) {
    set({ ready: true, error: (e as Error).message });
  }
}

async function mutate<T>(p: Promise<T>): Promise<T> {
  const result = await p;
  await refresh();
  channel?.postMessage("changed");
  return result;
}

channel?.addEventListener("message", () => refresh());

/* ---------- mutations ---------- */

export function addBookmark(input: BookmarkInput) {
  return mutate(api<Bookmark>("/api/bookmarks", { method: "POST", body: JSON.stringify(input) }));
}

export function updateBookmark(id: string, input: Partial<BookmarkInput>) {
  return mutate(api<Bookmark>(`/api/bookmarks/${id}`, { method: "PATCH", body: JSON.stringify(input) }));
}

export function togglePin(b: Bookmark) {
  return updateBookmark(b.id, { pinned: !b.pinned });
}

/** Best-effort page title lookup; resolves to "" when the page can't be read. */
export async function fetchTitle(url: string): Promise<string> {
  try {
    const { title } = await api<{ title: string }>(`/api/meta?url=${encodeURIComponent(url)}`);
    return title;
  } catch {
    return "";
  }
}

export function deleteBookmark(id: string) {
  return mutate(api(`/api/bookmarks/${id}`, { method: "DELETE" }));
}

export function renameCategory(from: string, to: string) {
  return mutate(api("/api/categories/rename", { method: "POST", body: JSON.stringify({ from, to }) }));
}

export async function logout() {
  await fetch("/api/logout", { method: "POST" });
  channel?.postMessage("changed");
  location.href = "/login";
}

/* ---------- hook ---------- */

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const SERVER: State = { bookmarks: [], ready: false, error: "" };

/** Live view of all bookmarks. Refetches on mount, on window focus, and when another tab changes data. */
export function useBookmarks() {
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return s;
}
