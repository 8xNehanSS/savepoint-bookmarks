"use client";

import { Fragment, memo } from "react";
import Icon from "./Icon";
import SiteIcon from "./SiteIcon";
import { categoryColor, hostname, relativeTime, type Bookmark } from "@/lib/store";

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${terms.map(escape).join("|")})`, "gi"));
  return <>{parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>))}</>;
}

type Props = {
  b: Bookmark;
  terms: string[];
  selected: boolean;
  showCategory: boolean;
  onSelect: () => void;
  onCategory: () => void;
  onPin: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function BookmarkRow({ b, terms, selected, showCategory, onSelect, onCategory, onPin, onCopy, onEdit, onDelete }: Props) {
  const host = hostname(b.url);
  const color = categoryColor(b.category);
  return (
    <li
      className={`bm ${selected ? "is-selected" : ""}`}
      style={{ "--cat": color } as React.CSSProperties}
      data-id={b.id}
      onMouseDown={onSelect}
    >
      <a className="bm-link" href={b.url} target="_blank" rel="noopener noreferrer" tabIndex={selected ? 0 : -1}>
        <SiteIcon url={b.url} host={host} color={color} />
        <span className="bm-main">
          <span className="bm-title">
            <Highlight text={b.title} terms={terms} />
          </span>
          <span className="bm-host">
            {b.pinned && (
              <span className="bm-pinned" title="Pinned">
                <Icon name="pin" size={12} />
              </span>
            )}
            <Highlight text={host} terms={terms} />
          </span>
          {b.notes && (
            <span className="bm-notes">
              <Highlight text={b.notes} terms={terms} />
            </span>
          )}
        </span>
      </a>

      <div className="bm-meta">
        {showCategory && (
          <button className="chip" onClick={onCategory} tabIndex={-1} title={`Show ${b.category}`}>
            <span className="dot" aria-hidden />
            <Highlight text={b.category} terms={terms} />
          </button>
        )}
        <time dateTime={new Date(b.createdAt).toISOString()} title={new Date(b.createdAt).toLocaleString()}>
          {relativeTime(b.createdAt)}
        </time>
      </div>

      <div className="bm-actions">
        <button className={`icon-btn ${b.pinned ? "is-on" : ""}`} onClick={onPin} title={b.pinned ? "Unpin (p)" : "Pin (p)"} aria-label={b.pinned ? "Unpin" : "Pin"}>
          <Icon name="pin" />
        </button>
        <button className="icon-btn" onClick={onCopy} title="Copy link (c)" aria-label="Copy link">
          <Icon name="copy" />
        </button>
        <button className="icon-btn" onClick={onEdit} title="Edit (e)" aria-label="Edit">
          <Icon name="edit" />
        </button>
        <button className="icon-btn icon-btn-danger" onClick={onDelete} title="Delete (Del)" aria-label="Delete">
          <Icon name="trash" />
        </button>
      </div>
    </li>
  );
}

export default memo(BookmarkRow);
