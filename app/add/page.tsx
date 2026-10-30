"use client";

import { useEffect, useMemo, useState } from "react";
import BookmarkForm from "@/components/BookmarkForm";
import { addBookmark, findByUrl, updateBookmark, useBookmarks, type Bookmark, type BookmarkInput } from "@/lib/store";

// Target of the bookmarklet: /add?url=…&title=…&notes=…
export default function AddPage() {
  const { bookmarks, ready } = useBookmarks();
  const [initial, setInitial] = useState<BookmarkInput | null>(null);
  const [existing, setExisting] = useState<Bookmark | undefined>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const url = p.get("url") ?? "";
    const found = url ? findByUrl(url) : undefined;
    setExisting(found);
    setInitial(
      found ?? {
        url,
        title: p.get("title") ?? "",
        notes: p.get("notes") ?? "",
        category: "",
      },
    );
  }, []);

  const categories = useMemo(() => [...new Set(bookmarks.map((b) => b.category))].sort(), [bookmarks]);

  function save(input: BookmarkInput) {
    if (existing) updateBookmark(existing.id, input);
    else addBookmark(input);
    setSaved(true);
    if (window.opener) setTimeout(() => window.close(), 700);
  }

  return (
    <div className="popup">
      <div className="brand">
        <span className="logo" aria-hidden>
          ◆
        </span>
        {existing ? "Update bookmark" : "Save bookmark"}
      </div>
      {saved ? (
        <div className="saved">
          <p>✓ Saved</p>
          <a href="/" className="btn">
            Open bookmarks
          </a>
        </div>
      ) : (
        ready &&
        initial && (
          <>
            {existing && <p className="notice">You saved this page on {new Date(existing.createdAt).toLocaleDateString()}. Saving updates it.</p>}
            <BookmarkForm
              categories={categories}
              initial={initial}
              submitLabel={existing ? "Update" : "Save"}
              onSubmit={save}
              onCancel={window.opener ? () => window.close() : undefined}
              autoFocus={initial.url ? "notes" : "url"}
            />
          </>
        )
      )}
    </div>
  );
}
