// Shared by client and server: types, input cleaning and search.

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

export const UNCATEGORIZED = "Uncategorized";

const LIMITS = { url: 2048, title: 500, notes: 10000, category: 100 };

export function normalizeUrl(url: string) {
  const u = url.trim();
  if (!u) return u;
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
}

/** Trims and validates input; throws with a user-facing message if invalid. */
export function cleanInput(input: Partial<Record<keyof BookmarkInput, unknown>>): BookmarkInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const url = normalizeUrl(str(input.url));
  if (!url) throw new Error("URL is required");
  if (/^(javascript|data|vbscript):/i.test(url)) throw new Error("That URL scheme isn't allowed");
  const out = {
    url,
    title: str(input.title) || url,
    notes: str(input.notes),
    category: str(input.category) || UNCATEGORIZED,
  };
  for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    if (out[k].length > LIMITS[k]) throw new Error(`${k} is too long (max ${LIMITS[k]} characters)`);
  }
  return out;
}

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
