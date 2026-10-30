const PATHS = {
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-4.35-4.35",
  plus: "M12 5v14M5 12h14",
  pin: "M9 4h6l-1 6 4 4H6l4-4-1-6Zm3 10v6",
  edit: "M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4",
  trash: "M5 7h14M10 7V4h4v3m-7 0 1 13h8l1-13",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  x: "M6 6l12 12M18 6 6 18",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
  bookmarklet: "M4 7h16M4 12h10M4 17h7M17 14v6m-3-3h6",
  menu: "M4 7h16M4 12h16M4 17h16",
  check: "M5 12.5 10 17 19 7",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  layers: "M12 4 3 9l9 5 9-5-9-5Zm-9 10 9 5 9-5",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The brand mark: a bookmark ribbon. */
export function Ribbon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size * 0.73} height={size} viewBox="0 0 16 22" aria-hidden className="ribbon-mark">
      <path d="M1 1.5A1.5 1.5 0 0 1 2.5 0h11A1.5 1.5 0 0 1 15 1.5V21l-7-5-7 5V1.5Z" fill="currentColor" />
    </svg>
  );
}
