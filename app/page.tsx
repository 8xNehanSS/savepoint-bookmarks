"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import BookmarkForm from "@/components/BookmarkForm";
import Highlight from "@/components/Highlight";
import {
  addBookmark,
  deleteBookmark,
  exportJson,
  importJson,
  renameCategory,
  search,
  tokenize,
  updateBookmark,
  useBookmarks,
  type Bookmark,
} from "@/lib/store";

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function Home() {
  const { bookmarks, ready } = useBookmarks();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [showTools, setShowTools] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of bookmarks) counts.set(b.category, (counts.get(b.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [bookmarks]);
  const categoryNames = useMemo(() => categories.map(([c]) => c), [categories]);

  // Drop a stale filter if its category disappears.
  useEffect(() => {
    if (category && !categoryNames.includes(category)) setCategory(null);
  }, [category, categoryNames]);

  const terms = useMemo(() => tokenize(query), [query]);
  const results = useMemo(() => {
    const scoped = category ? bookmarks.filter((b) => b.category === category) : bookmarks;
    return search(scoped, query);
  }, [bookmarks, category, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA";
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && t === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onRename(from: string) {
    const to = prompt(`Rename category "${from}" to:`, from);
    if (to == null || to.trim() === from) return;
    renameCategory(from, to);
    if (category === from) setCategory(to.trim());
  }

  function onDelete(b: Bookmark) {
    if (confirm(`Delete "${b.title}"?`)) deleteBookmark(b.id);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ◆
          </span>
          Bookmarks
        </div>
        <nav className="cats">
          <button className={`cat ${category === null ? "active" : ""}`} onClick={() => setCategory(null)}>
            <span>All</span>
            <span className="count">{bookmarks.length}</span>
          </button>
          {categories.map(([name, n]) => (
            <div key={name} className="cat-row">
              <button className={`cat ${category === name ? "active" : ""}`} onClick={() => setCategory(name)} title={name}>
                <span className="cat-name">{name}</span>
                <span className="count">{n}</span>
              </button>
              <button className="icon-btn rename" onClick={() => onRename(name)} title="Rename category" aria-label={`Rename ${name}`}>
                ✎
              </button>
            </div>
          ))}
        </nav>
        <button className="btn ghost tools-toggle" onClick={() => setShowTools((s) => !s)}>
          {showTools ? "Hide tools" : "Bookmarklet & backup"}
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="search">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, URLs, notes, categories…  ( / )"
              aria-label="Search bookmarks"
            />
          </div>
          <button className="btn primary" onClick={() => setAdding((a) => !a)}>
            {adding ? "Close" : "+ Add"}
          </button>
        </header>

        {showTools && <Tools />}

        {adding && (
          <section className="panel">
            <BookmarkForm
              categories={categoryNames}
              initial={{ category: category ?? "" }}
              submitLabel="Add bookmark"
              onSubmit={(input) => {
                addBookmark(input);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          </section>
        )}

        <div className="meta">
          {ready && (
            <>
              {results.length} {results.length === 1 ? "bookmark" : "bookmarks"}
              {category && <> in <strong>{category}</strong></>}
              {query && <> matching “{query}”</>}
            </>
          )}
        </div>

        {ready && bookmarks.length === 0 && !adding && (
          <div className="empty">
            <p>No bookmarks yet.</p>
            <p className="muted">
              Click <strong>+ Add</strong>, or set up the bookmarklet under <em>Bookmarklet &amp; backup</em> to save pages with one click.
            </p>
          </div>
        )}

        <ul className="list">
          {results.map((b) =>
            editing === b.id ? (
              <li key={b.id} className="card panel">
                <BookmarkForm
                  categories={categoryNames}
                  initial={b}
                  onSubmit={(input) => {
                    updateBookmark(b.id, input);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={b.id} className="card">
                <div className="card-head">
                  <span className="favicon" aria-hidden>
                    {hostname(b.url).charAt(0).toUpperCase() || "?"}
                  </span>
                  <a className="title" href={b.url} target="_blank" rel="noopener noreferrer">
                    <Highlight text={b.title} terms={terms} />
                  </a>
                  <div className="actions">
                    <button className="icon-btn" onClick={() => navigator.clipboard?.writeText(b.url)} title="Copy URL">
                      ⧉
                    </button>
                    <button className="icon-btn" onClick={() => setEditing(b.id)} title="Edit">
                      ✎
                    </button>
                    <button className="icon-btn danger" onClick={() => onDelete(b)} title="Delete">
                      ✕
                    </button>
                  </div>
                </div>
                <div className="url">
                  <Highlight text={b.url} terms={terms} />
                </div>
                {b.notes && (
                  <p className="notes">
                    <Highlight text={b.notes} terms={terms} />
                  </p>
                )}
                <div className="card-foot">
                  <button className="tag" onClick={() => setCategory(b.category)}>
                    <Highlight text={b.category} terms={terms} />
                  </button>
                  <span className="muted">{fmtDate(b.createdAt)}</span>
                </div>
              </li>
            ),
          )}
        </ul>
      </main>
    </div>
  );
}

function Tools() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");

  // React refuses javascript: hrefs, so set it on the DOM node directly.
  useEffect(() => {
    const target = `${location.origin}/add`;
    const code =
      `javascript:(()=>{const u='${target}?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+'&notes='+encodeURIComponent(String(getSelection()||''));` +
      `const w=window.open(u,'pbm','width=520,height=620');if(!w)location.href=u;})()`;
    linkRef.current?.setAttribute("href", code);
  }, []);

  function download() {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bookmarks-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onImport(file: File) {
    try {
      const n = importJson(await file.text());
      setMsg(`Imported ${n} new bookmark${n === 1 ? "" : "s"}.`);
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section className="panel tools">
      <div>
        <h3>Bookmarklet</h3>
        <p className="muted">
          Drag this to your bookmarks bar. Click it on any page to save it here. Any text you have selected on the page goes into the notes.
        </p>
        <a ref={linkRef} className="bookmarklet" onClick={(e) => e.preventDefault()} draggable>
          ◆ Save bookmark
        </a>
      </div>
      <div>
        <h3>Backup</h3>
        <p className="muted">
          Bookmarks are stored only in this browser&apos;s local storage. Export them regularly, and import the file to move them to another browser.
        </p>
        <div className="row">
          <button className="btn" onClick={download}>
            Export JSON
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
        </div>
        {msg && <p className="muted small">{msg}</p>}
      </div>
    </section>
  );
}
