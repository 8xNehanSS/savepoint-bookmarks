"use client";

import { useEffect, useMemo, useState } from "react";
import BookmarkForm from "@/components/BookmarkForm";
import Icon, { Ribbon } from "@/components/Icon";
import { addBookmark, normalizeUrl, useBookmarks, type Bookmark, type BookmarkInput } from "@/lib/store";

// Target of the bookmarklet: /add?url=…&title=…&notes=…
export default function AddPage() {
  const { bookmarks, ready, error } = useBookmarks();
  const [initial, setInitial] = useState<BookmarkInput | null>(null);
  const [existing, setExisting] = useState<Bookmark | undefined>();
  const [saved, setSaved] = useState(false);
  const [isPopup, setIsPopup] = useState(false);

  // Prefill once the list has loaded, so an already-saved URL opens in update mode.
  useEffect(() => {
    if (!ready || initial) return;
    setIsPopup(Boolean(window.opener));
    const p = new URLSearchParams(location.search);
    const url = p.get("url") ?? "";
    const found = url ? bookmarks.find((b) => b.url === normalizeUrl(url)) : undefined;
    setExisting(found);
    setInitial(found ?? { url, title: p.get("title") ?? "", notes: p.get("notes") ?? "", category: "" });
  }, [ready, bookmarks, initial]);

  const categories = useMemo(() => [...new Set(bookmarks.map((b) => b.category))].sort(), [bookmarks]);

  async function save(input: BookmarkInput) {
    await addBookmark(input); // the server updates instead if the URL already exists
    setSaved(true);
    if (isPopup) setTimeout(() => window.close(), 900);
  }

  return (
    <div className="popup">
      <header className="popup-head">
        <Ribbon />
        <h1>{existing ? "Update bookmark" : "Save to Bookmarks"}</h1>
      </header>

      {error && <p className="notice notice-error">{error}</p>}

      {saved ? (
        <div className="saved">
          <span className="saved-check">
            <Icon name="check" size={28} />
          </span>
          <p>{existing ? "Bookmark updated" : "Saved to your shelf"}</p>
          {!isPopup && (
            <a href="/" className="btn">
              Open bookmarks
            </a>
          )}
        </div>
      ) : !initial ? (
        <div className="skeleton skeleton-form" aria-label="Loading" />
      ) : (
        <>
          {existing && (
            <p className="notice">
              You saved this page on {new Date(existing.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.
              Saving will update it.
            </p>
          )}
          <BookmarkForm
            categories={categories}
            initial={initial}
            submitLabel={existing ? "Update bookmark" : "Save link"}
            onSubmit={save}
            onCancel={isPopup ? () => window.close() : undefined}
            autoFocus={initial.url ? "notes" : "url"}
          />
        </>
      )}
    </div>
  );
}
