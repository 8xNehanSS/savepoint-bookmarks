// Shared by client and server: types, input cleaning, search, sorting and grouping.

export type Bookmark = {
  id: string;
  url: string;
  title: string;
  notes: string;
  category: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type BookmarkInput = Pick<Bookmark, "url" | "title" | "notes" | "category"> & { pinned?: boolean };

export const UNCATEGORIZED = "Uncategorized";

const LIMITS = { url: 2048, title: 500, notes: 10000, category: 100 };

export function normalizeUrl(url: string) {
  const u = url.trim();
  if (!u) return u;
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
}

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Looks like something worth saving, e.g. a pasted "https://…" or "example.com/page". */
export function looksLikeUrl(text: string) {
  const t = text.trim();
  return /^https?:\/\/\S+$/i.test(t) || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(t);
}

/** Trims and validates input; throws with a user-facing message if invalid. */
export function cleanInput(input: Partial<Record<keyof BookmarkInput, unknown>>): Required<BookmarkInput> {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const url = normalizeUrl(str(input.url));
  if (!url) throw new Error("Add a URL to save this bookmark.");
  if (/^(javascript|data|vbscript):/i.test(url)) throw new Error("That kind of link can't be saved.");
  const out = {
    url,
    title: str(input.title) || url,
    notes: str(input.notes),
    category: str(input.category) || UNCATEGORIZED,
    pinned: input.pinned === true,
  };
  for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    if (out[k].length > LIMITS[k]) throw new Error(`The ${k} is too long (max ${LIMITS[k]} characters).`);
  }
  return out;
}

/* ---------- categories ---------- */

// Muted hues that read on the dark indigo background; picked per category by name.
const CATEGORY_COLORS = ["#7fb4e8", "#e69a9a", "#8fd1a8", "#c3a2e8", "#e8b27f", "#6fcfcf", "#d6cf7a", "#a3aeea", "#e89ac9", "#9fc77a"];

export function categoryColor(name: string) {
  if (name === UNCATEGORIZED) return "#6b7290";
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length];
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

/* ---------- sorting & grouping ---------- */

export type SortKey = "newest" | "oldest" | "updated" | "title";

export const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  updated: "Recently edited",
  title: "Title A–Z",
};

export function sortBookmarks(list: Bookmark[], key: SortKey) {
  const l = [...list];
  switch (key) {
    case "oldest":
      return l.sort((a, b) => a.createdAt - b.createdAt);
    case "updated":
      return l.sort((a, b) => b.updatedAt - a.updatedAt);
    case "title":
      return l.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    default:
      return l.sort((a, b) => b.createdAt - a.createdAt);
  }
}

export type Group = { label: string | null; items: Bookmark[] };

function periodLabel(ts: number, now: Date) {
  const days = (now.getTime() - ts) / 86_400_000;
  if (days < 7) return "This week";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { month: "long" } : { month: "long", year: "numeric" });
}

/** Pinned links first, then the rest bucketed by period (date sorts) or left as one run (title sort). */
export function groupBookmarks(list: Bookmark[], sort: SortKey, { pinnedFirst }: { pinnedFirst: boolean }): Group[] {
  const groups: Group[] = [];
  let rest = list;
  if (pinnedFirst) {
    const pinned = list.filter((b) => b.pinned);
    if (pinned.length) {
      groups.push({ label: "Pinned", items: pinned });
      rest = list.filter((b) => !b.pinned);
    }
  }
  if (!rest.length) return groups;
  if (sort === "title") {
    groups.push({ label: groups.length ? "Everything else" : null, items: rest });
    return groups;
  }
  const now = new Date();
  for (const b of rest) {
    const label = periodLabel(sort === "updated" ? b.updatedAt : b.createdAt, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(b);
    else groups.push({ label, items: [b] });
  }
  return groups;
}

export function relativeTime(ts: number) {
  const diff = Date.now() - ts;
  const min = 60_000;
  const day = 86_400_000;
  if (diff < min) return "just now";
  if (diff < 60 * min) return `${Math.floor(diff / min)} min ago`;
  if (diff < day) return `${Math.floor(diff / (60 * min))} h ago`;
  if (diff < 2 * day) return "yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, d.getFullYear() === new Date().getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}
