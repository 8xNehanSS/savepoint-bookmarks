"use client";

import { FormEvent, useState } from "react";
import type { BookmarkInput } from "@/lib/store";

type Props = {
  initial?: Partial<BookmarkInput>;
  categories: string[];
  submitLabel?: string;
  onSubmit: (input: BookmarkInput) => void;
  onCancel?: () => void;
  autoFocus?: "url" | "notes";
};

export default function BookmarkForm({ initial, categories, submitLabel = "Save", onSubmit, onCancel, autoFocus = "url" }: Props) {
  const [url, setUrl] = useState(initial?.url ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    onSubmit({ url, title, notes, category });
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        <span>URL</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" required autoFocus={autoFocus === "url"} />
      </label>
      <label>
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the URL" />
      </label>
      <label>
        <span>Category</span>
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Reading, Tools" list="pbm-categories" />
        <datalist id="pbm-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label>
        <span>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Why you saved it…" autoFocus={autoFocus === "notes"} />
      </label>
      <div className="row end">
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
