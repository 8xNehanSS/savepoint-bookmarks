"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BookmarkForm from "@/components/BookmarkForm";
import BookmarkRow from "@/components/BookmarkRow";
import Icon, { Ribbon } from "@/components/Icon";
import Modal from "@/components/Modal";
import { Toast, useToast } from "@/components/Toast";
import {
  SORT_LABELS,
  UNCATEGORIZED,
  addBookmark,
  categoryColor,
  deleteBookmark,
  groupBookmarks,
  looksLikeUrl,
  logout,
  normalizeUrl,
  renameCategory,
  search,
  sortBookmarks,
  togglePin,
  tokenize,
  updateBookmark,
  useBookmarks,
  type Bookmark,
  type BookmarkInput,
  type SortKey,
} from "@/lib/store";

type View = { kind: "all" } | { kind: "pinned" } | { kind: "category"; name: string };
type Dialog =
  | { kind: "add"; initial?: Partial<BookmarkInput>; focus?: "url" | "title" }
  | { kind: "edit"; bookmark: Bookmark }
  | { kind: "rename"; name: string }
  | { kind: "bookmarklet" }
  | { kind: "shortcuts" };

const SORT_KEY = "pbm:sort";
const UNDO_MS = 5000;

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export default function Home() {
  const { bookmarks, ready, error } = useBookmarks();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>({ kind: "all" });
  const [sort, setSort] = useState<SortKey>("newest");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const pendingDeletes = useRef(new Map<string, number>());
  const { toast, show, dismiss } = useToast();

  useEffect(() => {
    try {
      const s = localStorage.getItem(SORT_KEY) as SortKey | null;
      if (s && s in SORT_LABELS) setSort(s);
    } catch {}
  }, []);

  function changeSort(s: SortKey) {
    setSort(s);
    try {
      localStorage.setItem(SORT_KEY, s);
    } catch {}
  }

  const visible = useMemo(() => bookmarks.filter((b) => !hidden.has(b.id)), [bookmarks, hidden]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of visible) counts.set(b.category, (counts.get(b.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => (a[0] === UNCATEGORIZED ? 1 : b[0] === UNCATEGORIZED ? -1 : a[0].localeCompare(b[0])));
  }, [visible]);
  const categoryNames = useMemo(() => categories.map(([c]) => c), [categories]);
  const pinnedCount = useMemo(() => visible.filter((b) => b.pinned).length, [visible]);

  // Fall back to "All" if the category being viewed no longer exists.
  useEffect(() => {
    if (ready && view.kind === "category" && !categoryNames.includes(view.name)) setView({ kind: "all" });
  }, [ready, view, categoryNames]);

  const terms = useMemo(() => tokenize(query), [query]);
  const searching = terms.length > 0;

  const groups = useMemo(() => {
    let scoped = visible;
    if (view.kind === "pinned") scoped = scoped.filter((b) => b.pinned);
    if (view.kind === "category") scoped = scoped.filter((b) => b.category === view.name);
    if (searching) return [{ label: null, items: search(scoped, query) }];
    return groupBookmarks(sortBookmarks(scoped, sort), sort, { pinnedFirst: view.kind !== "pinned" });
  }, [visible, view, query, searching, sort]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const selectedBm = flat.find((b) => b.id === selected);

  /* ---------- actions ---------- */

  const findExisting = useCallback((url: string) => bookmarks.find((b) => b.url === url), [bookmarks]);

  async function copy(b: Bookmark) {
    try {
      await navigator.clipboard.writeText(b.url);
      show("Link copied");
    } catch {
      show("Couldn't copy. Your browser blocked clipboard access.");
    }
  }

  async function pin(b: Bookmark) {
    try {
      await togglePin(b);
      show(b.pinned ? "Unpinned" : "Pinned to the top");
    } catch (e) {
      show((e as Error).message);
    }
  }

  function unhide(id: string) {
    setHidden((h) => {
      const n = new Set(h);
      n.delete(id);
      return n;
    });
  }

  // Hide immediately; actually delete after the undo window closes.
  function remove(b: Bookmark) {
    const idx = flat.findIndex((x) => x.id === b.id);
    const next = flat[idx + 1] ?? flat[idx - 1];
    setHidden((h) => new Set(h).add(b.id));
    if (selected === b.id) setSelected(next?.id ?? null);
    const t = window.setTimeout(async () => {
      pendingDeletes.current.delete(b.id);
      try {
        await deleteBookmark(b.id);
      } catch (e) {
        unhide(b.id);
        show(`Couldn't delete “${b.title}”: ${(e as Error).message}`);
      }
    }, UNDO_MS);
    pendingDeletes.current.set(b.id, t);
    show(
      `Deleted “${b.title.length > 40 ? b.title.slice(0, 40) + "…" : b.title}”`,
      {
        label: "Undo",
        run: () => {
          window.clearTimeout(t);
          pendingDeletes.current.delete(b.id);
          unhide(b.id);
        },
      },
      UNDO_MS,
    );
  }

  // Don't lose deletes that are still waiting out their undo window.
  useEffect(() => {
    const flush = () => {
      for (const [id, t] of pendingDeletes.current) {
        window.clearTimeout(t);
        fetch(`/api/bookmarks/${id}`, { method: "DELETE", keepalive: true });
      }
      pendingDeletes.current.clear();
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  function pickView(v: View) {
    setView(v);
    setSelected(null);
    setDrawer(false);
  }

  /* ---------- keyboard & paste ---------- */

  const move = useCallback(
    (delta: number) => {
      if (!flat.length) return;
      const i = flat.findIndex((b) => b.id === selected);
      const next = i < 0 ? (delta > 0 ? 0 : flat.length - 1) : Math.min(flat.length - 1, Math.max(0, i + delta));
      setSelected(flat[next].id);
    },
    [flat, selected],
  );

  useEffect(() => {
    if (!selected) return;
    document.querySelector(`[data-id="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) {
        if (e.target === searchRef.current) {
          if (e.key === "Escape") {
            setQuery("");
            searchRef.current?.blur();
          } else if (e.key === "ArrowDown" || e.key === "Enter") {
            e.preventDefault();
            searchRef.current?.blur();
            if (flat[0]) setSelected(flat[0].id);
          }
        }
        return;
      }
      const b = selectedBm;
      switch (e.key) {
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          searchRef.current?.select();
          break;
        case "n":
          e.preventDefault();
          setDialog({ kind: "add" });
          break;
        case "?":
          setDialog({ kind: "shortcuts" });
          break;
        case "j":
        case "ArrowDown":
          e.preventDefault();
          move(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          move(-1);
          break;
        case "Escape":
          setSelected(null);
          break;
        case "Enter":
        case "o":
          if (b) window.open(b.url, "_blank", "noopener,noreferrer");
          break;
        case "e":
          if (b) setDialog({ kind: "edit", bookmark: b });
          break;
        case "p":
          if (b) pin(b);
          break;
        case "c":
          if (b) copy(b);
          break;
        case "Delete":
        case "Backspace":
          if (b) remove(b);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Paste a link anywhere (outside a text field) to start saving it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (dialog || isTyping(e.target)) return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (!looksLikeUrl(text)) return;
      e.preventDefault();
      setDialog({ kind: "add", initial: { url: normalizeUrl(text), category: view.kind === "category" ? view.name : "" }, focus: "title" });
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [dialog, view]);

  /* ---------- render ---------- */

  const total = flat.length;
  const scopeLabel = view.kind === "pinned" ? "Pinned" : view.kind === "category" ? view.name : "All links";
  const summary = !ready
    ? "Loading your bookmarks…"
    : searching
      ? `${total} ${total === 1 ? "match" : "matches"} for “${query.trim()}”${view.kind !== "all" ? ` in ${scopeLabel}` : ""}`
      : `${total} ${total === 1 ? "link" : "links"}`;

  return (
    <div className={`app ${drawer ? "drawer-open" : ""}`}>
      <aside className="rail" aria-label="Library">
        <div className="brand">
          <Ribbon />
          <span>Bookmarks</span>
        </div>

        <nav className="nav">
          <button className={`nav-item ${view.kind === "all" ? "is-active" : ""}`} onClick={() => pickView({ kind: "all" })}>
            <Icon name="layers" />
            <span className="nav-name">All links</span>
            <span className="nav-count">{visible.length}</span>
          </button>
          <button className={`nav-item ${view.kind === "pinned" ? "is-active" : ""}`} onClick={() => pickView({ kind: "pinned" })}>
            <Icon name="pin" />
            <span className="nav-name">Pinned</span>
            <span className="nav-count">{pinnedCount}</span>
          </button>
        </nav>

        {categories.length > 0 && (
          <nav className="nav nav-cats" aria-label="Categories">
            <h3 className="nav-heading">Categories</h3>
            {categories.map(([name, n]) => (
              <div key={name} className="nav-row">
                <button
                  className={`nav-item ${view.kind === "category" && view.name === name ? "is-active" : ""}`}
                  style={{ "--cat": categoryColor(name) } as React.CSSProperties}
                  onClick={() => pickView({ kind: "category", name })}
                  title={name}
                >
                  <span className="dot" aria-hidden />
                  <span className="nav-name">{name}</span>
                  <span className="nav-count">{n}</span>
                </button>
                <button className="icon-btn nav-rename" onClick={() => setDialog({ kind: "rename", name })} aria-label={`Rename ${name}`} title="Rename">
                  <Icon name="edit" size={14} />
                </button>
              </div>
            ))}
          </nav>
        )}

        <div className="rail-foot">
          <button className="nav-item" onClick={() => setDialog({ kind: "bookmarklet" })}>
            <Icon name="bookmarklet" />
            <span className="nav-name">Save from any page</span>
          </button>
          <button className="nav-item" onClick={() => setDialog({ kind: "shortcuts" })}>
            <Icon name="keyboard" />
            <span className="nav-name">Keyboard shortcuts</span>
          </button>
          <button className="nav-item" onClick={logout}>
            <Icon name="logout" />
            <span className="nav-name">Sign out</span>
          </button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setDrawer(false)} aria-hidden />

      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setDrawer(true)} aria-label="Open library">
            <Icon name="menu" size={18} />
          </button>
          <label className="search">
            <Icon name="search" size={18} />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              placeholder="Search your bookmarks"
              aria-label="Search bookmarks"
            />
            {!query && <kbd className="search-kbd">/</kbd>}
          </label>
          <button className="btn btn-primary save-btn" onClick={() => setDialog({ kind: "add", initial: { category: view.kind === "category" ? view.name : "" } })}>
            <Icon name="plus" />
            <span>Save a link</span>
          </button>
        </header>

        <div className="heading-row">
          <div>
            <h1 className="view-title" style={view.kind === "category" ? ({ "--cat": categoryColor(view.name) } as React.CSSProperties) : undefined}>
              {view.kind === "category" && <span className="dot dot-lg" aria-hidden />}
              {scopeLabel}
            </h1>
            <p className="summary">{summary}</p>
          </div>
          {!searching && ready && total > 1 && (
            <label className="sort">
              <span className="sr-only">Sort by</span>
              <select value={sort} onChange={(e) => changeSort(e.target.value as SortKey)}>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {error && (
          <div className="notice notice-error">
            Couldn&apos;t load your bookmarks: {error}. Check your connection, then reload the page.
          </div>
        )}

        {!ready && (
          <ul className="skeleton" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} />
            ))}
          </ul>
        )}

        {ready && !error && total === 0 && (
          <EmptyState
            kind={visible.length === 0 ? "first" : searching ? "search" : view.kind === "pinned" ? "pinned" : "category"}
            onAdd={() => setDialog({ kind: "add" })}
            onBookmarklet={() => setDialog({ kind: "bookmarklet" })}
            onClear={() => setQuery("")}
          />
        )}

        {groups.map((g, gi) => (
          <section key={`${g.label}-${gi}`} className="group">
            {g.label && <h2 className="group-label">{g.label}</h2>}
            <ul className="list">
              {g.items.map((b) => (
                <BookmarkRow
                  key={b.id}
                  b={b}
                  terms={terms}
                  selected={b.id === selected}
                  showCategory={view.kind !== "category"}
                  onSelect={() => setSelected(b.id)}
                  onCategory={() => pickView({ kind: "category", name: b.category })}
                  onPin={() => pin(b)}
                  onCopy={() => copy(b)}
                  onEdit={() => setDialog({ kind: "edit", bookmark: b })}
                  onDelete={() => remove(b)}
                />
              ))}
            </ul>
          </section>
        ))}
      </main>

      <button className="fab" onClick={() => setDialog({ kind: "add" })} aria-label="Save a link">
        <Icon name="plus" size={22} />
      </button>

      {dialog?.kind === "add" && (
        <Modal title="Save a link" onClose={() => setDialog(null)}>
          <BookmarkForm
            initial={dialog.initial}
            categories={categoryNames}
            submitLabel="Save link"
            autoFocus={dialog.focus ?? "url"}
            findExisting={findExisting}
            onCancel={() => setDialog(null)}
            onSubmit={async (input) => {
              const saved = await addBookmark(input);
              setDialog(null);
              setSelected(saved.id);
              show("Saved");
            }}
          />
        </Modal>
      )}

      {dialog?.kind === "edit" && (
        <Modal title="Edit bookmark" onClose={() => setDialog(null)}>
          <BookmarkForm
            initial={dialog.bookmark}
            categories={categoryNames}
            submitLabel="Save changes"
            autoFocus="title"
            onCancel={() => setDialog(null)}
            onSubmit={async (input) => {
              await updateBookmark(dialog.bookmark.id, input);
              setDialog(null);
              show("Changes saved");
            }}
          />
        </Modal>
      )}

      {dialog?.kind === "rename" && (
        <RenameDialog
          name={dialog.name}
          count={categories.find(([c]) => c === dialog.name)?.[1] ?? 0}
          onClose={() => setDialog(null)}
          onRename={async (to) => {
            await renameCategory(dialog.name, to);
            if (view.kind === "category" && view.name === dialog.name) setView({ kind: "category", name: to || UNCATEGORIZED });
            setDialog(null);
            show(`Renamed to “${to || UNCATEGORIZED}”`);
          }}
        />
      )}

      {dialog?.kind === "bookmarklet" && <BookmarkletDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}

      <Toast toast={toast} dismiss={dismiss} />
    </div>
  );
}

/* ---------- empty states ---------- */

function EmptyState({ kind, onAdd, onBookmarklet, onClear }: { kind: "first" | "search" | "pinned" | "category"; onAdd: () => void; onBookmarklet: () => void; onClear: () => void }) {
  if (kind === "first") {
    return (
      <div className="empty empty-first">
        <Ribbon size={40} />
        <h2>Start your shelf</h2>
        <p>Save a link here, paste one anywhere on this page, or add the bookmarklet to save pages while you browse.</p>
        <div className="empty-actions">
          <button className="btn btn-primary" onClick={onAdd}>
            <Icon name="plus" />
            Save a link
          </button>
          <button className="btn" onClick={onBookmarklet}>
            Set up the bookmarklet
          </button>
        </div>
      </div>
    );
  }
  if (kind === "search") {
    return (
      <div className="empty">
        <h2>Nothing matches that</h2>
        <p>Every word has to appear in the title, link, notes or category. Try fewer words.</p>
        <button className="btn" onClick={onClear}>
          Clear search
        </button>
      </div>
    );
  }
  return (
    <div className="empty">
      <h2>{kind === "pinned" ? "No pinned links" : "This category is empty"}</h2>
      <p>{kind === "pinned" ? "Pin the links you open most and they'll stay at the top of every list." : "Links you save to it will show up here."}</p>
    </div>
  );
}

/* ---------- dialogs ---------- */

function RenameDialog({ name, count, onClose, onRename }: { name: string; count: number; onClose: () => void; onRename: (to: string) => Promise<void> }) {
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="Rename category" onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (value.trim() === name) return onClose();
          setBusy(true);
          try {
            await onRename(value.trim());
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <label className="field">
          <span className="field-label">New name</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} autoFocus onFocus={(e) => e.target.select()} />
          <span className="field-hint">
            Moves {count} {count === 1 ? "link" : "links"}. Use a name that already exists to merge the two categories.
          </span>
        </label>
        {error && <p className="notice notice-error">{error}</p>}
        <div className="form-foot">
          <span />
          <div className="form-actions">
            <button type="button" className="btn btn-quiet" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Renaming…" : "Rename"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function BookmarkletDialog({ onClose }: { onClose: () => void }) {
  const linkRef = useRef<HTMLAnchorElement>(null);

  // React refuses javascript: hrefs, so set it on the DOM node directly.
  useEffect(() => {
    const target = `${location.origin}/add`;
    const code =
      `javascript:(()=>{const u='${target}?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+'&notes='+encodeURIComponent(String(getSelection()||''));` +
      `const w=window.open(u,'pbm','width=520,height=680');if(!w)location.href=u;})()`;
    linkRef.current?.setAttribute("href", code);
  }, []);

  return (
    <Modal title="Save from any page" onClose={onClose}>
      <div className="prose">
        <p>Drag this button to your bookmarks bar:</p>
        <div className="bookmarklet-well">
          <a ref={linkRef} className="bookmarklet" onClick={(e) => e.preventDefault()} draggable>
            <Ribbon size={14} />
            Save to Bookmarks
          </a>
        </div>
        <p>
          On any page, click it to open a small save window with the page&apos;s title and link already filled in. Any text you&apos;ve
          selected on the page goes into the notes.
        </p>
        <p className="muted">
          Can&apos;t see the bookmarks bar? Press <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>B</kbd> (<kbd>⌘</kbd> <kbd>Shift</kbd> <kbd>B</kbd> on Mac).
          A few sites, such as GitHub, block bookmarklets. On those, copy the link and paste it here instead.
        </p>
      </div>
    </Modal>
  );
}

const SHORTCUTS: [string[], string][] = [
  [["/"], "Search"],
  [["n"], "Save a link"],
  [["j"], "Next link"],
  [["k"], "Previous link"],
  [["Enter"], "Open the selected link"],
  [["e"], "Edit"],
  [["p"], "Pin or unpin"],
  [["c"], "Copy link"],
  [["Del"], "Delete (you can undo)"],
  [["Esc"], "Clear search or selection"],
  [["Ctrl", "V"], "Paste a link anywhere to save it"],
  [["?"], "Show these shortcuts"],
];

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <dl className="shortcuts">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={label}>
            <dt>
              {keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
