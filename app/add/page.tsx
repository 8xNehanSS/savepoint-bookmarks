"use client";

import { useEffect, useMemo, useState } from "react";
import BookmarkForm from "@/components/BookmarkForm";
import { addBookmark, normalizeUrl, useBookmarks, type Bookmark, type BookmarkInput } from "@/lib/store";

// Target of the bookmarklet: /add?url=…&title=…&notes=…
export default function AddPage() {
  const { bookmarks, ready, error } = useBookmarks();
  const [initial, setInitial] = useState<BookmarkInput | null>(null);
  const [existing, setExisting] = useState<Bookmark | undefined>();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Prefill once the list has loaded, so an already-saved URL opens in update mode.
  useEffect(() => {
    if (!ready || initial) return;
    const p = new URLSearchParams(location.search);
    const url = p.get("url") ?? "";
    const found = url ? bookmarks.find((b) => b.url === normalizeUrl(url)) : undefined;
    setExisting(found);
    setInitial(found ?? { url, title: p.get("title") ?? "", notes: p.get("notes") ?? "", category: "" });
  }, [ready, bookmarks, initial]);

  const categories = useMemo(() => [...new Set(bookmarks.map((b) => b.category))].sort(), [bookmarks]);

  async function save(input: BookmarkInput) {
    setSaveError("");
    try {
      await addBookmark(input); // the server updates instead if the URL already exists
      setSaved(true);
      if (window.opener) setTimeout(() => window.close(), 700);
    } catch (e) {
      setSaveError((e as Error).message);
    }
  }

  return (
    <div className="popup">
      <div className="brand">
        <span className="logo" aria-hidden>
          ◆
        </span>
        {existing ? "Update bookmark" : "Save bookmark"}
      </div>
      {error && <p className="notice error">{error}</p>}
      {saved ? (
        <div className="saved">
          <p>✓ Saved</p>
          <a href="/" className="btn">
            Open bookmarks
          </a>
        </div>
      ) : !initial ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {existing && <p className="notice">You saved this page on {new Date(existing.createdAt).toLocaleDateString()}. Saving updates it.</p>}
          {saveError && <p className="notice error">{saveError}</p>}
          <BookmarkForm
            categories={categories}
            initial={initial}
            submitLabel={existing ? "Update" : "Save"}
            onSubmit={save}
            onCancel={window.opener ? () => window.close() : undefined}
            autoFocus={initial.url ? "notes" : "url"}
          />
        </>
      )}
    </div>
  );
}
