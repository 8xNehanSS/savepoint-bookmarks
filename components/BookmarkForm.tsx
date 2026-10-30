"use client";

import { FormEvent, useRef, useState } from "react";
import Icon from "./Icon";
import { UNCATEGORIZED, categoryColor, fetchTitle, looksLikeUrl, normalizeUrl, type Bookmark, type BookmarkInput } from "@/lib/store";

type Props = {
  initial?: Partial<BookmarkInput>;
  categories: string[];
  submitLabel: string;
  onSubmit: (input: BookmarkInput) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: "url" | "title" | "notes";
  /** Lets the form warn when the URL is already saved (add mode only). */
  findExisting?: (url: string) => Bookmark | undefined;
};

export default function BookmarkForm({ initial, categories, submitLabel, onSubmit, onCancel, autoFocus = "url", findExisting }: Props) {
  const [url, setUrl] = useState(initial?.url ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [lookingUp, setLookingUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleTouched = useRef(Boolean(initial?.title));
  const lastLookup = useRef("");

  const existing = findExisting && url.trim() ? findExisting(normalizeUrl(url)) : undefined;

  async function lookupTitle() {
    const u = normalizeUrl(url);
    if (titleTouched.current || !looksLikeUrl(u) || lastLookup.current === u) return;
    lastLookup.current = u;
    setLookingUp(true);
    const t = await fetchTitle(u);
    setLookingUp(false);
    if (t && !titleTouched.current) setTitle(t);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({ url, title, notes, category, pinned });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const q = category.trim().toLowerCase();
  const suggestions = categories.filter((c) => c !== UNCATEGORIZED && c.toLowerCase() !== q && (!q || c.toLowerCase().includes(q))).slice(0, 8);

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span className="field-label">Link</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={lookupTitle}
          placeholder="https://example.com/article"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          required
          autoFocus={autoFocus === "url"}
        />
        {existing && <span className="field-hint">Already saved as “{existing.title}”. Saving will update it.</span>}
      </label>

      <label className="field">
        <span className="field-label">
          Title
          {lookingUp && <span className="field-status">Looking up the page title…</span>}
        </span>
        <input
          className="input-serif"
          value={title}
          onChange={(e) => {
            titleTouched.current = e.target.value !== "";
            setTitle(e.target.value);
          }}
          placeholder="Uses the page title if you leave it blank"
          autoFocus={autoFocus === "title"}
        />
      </label>

      <div className="field">
        <label className="field-label" htmlFor="bm-category">
          Category
        </label>
        <div className="category-input" style={{ "--cat": categoryColor(category.trim() || "Uncategorized") } as React.CSSProperties}>
          <span className="dot" aria-hidden />
          <input id="bm-category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Uncategorized" autoComplete="off" />
        </div>
        {suggestions.length > 0 && (
          <div className="chip-row">
            {suggestions.map((c) => (
              <button type="button" key={c} className="chip" style={{ "--cat": categoryColor(c) } as React.CSSProperties} onClick={() => setCategory(c)}>
                <span className="dot" aria-hidden />
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="field">
        <span className="field-label">Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Why it's worth keeping, a quote, what to read first…" autoFocus={autoFocus === "notes"} />
      </label>

      {error && <p className="notice notice-error">{error}</p>}

      <div className="form-foot">
        <label className="toggle">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          <span className="toggle-box" aria-hidden>
            <Icon name="pin" size={14} />
          </span>
          Pin to top
        </label>
        <div className="form-actions">
          {onCancel && (
            <button type="button" className="btn btn-quiet" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
