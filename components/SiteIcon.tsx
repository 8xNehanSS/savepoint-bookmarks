"use client";

import { useState } from "react";

/** Site favicon via our own proxy, falling back to a lettered tile in the category color. */
export default function SiteIcon({ host, color }: { host: string; color: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="site-icon" style={{ "--cat": color } as React.CSSProperties}>
      {failed ? (
        <span className="site-letter">{host.charAt(0).toUpperCase() || "?"}</span>
      ) : (
        <img src={`/api/favicon?host=${encodeURIComponent(host)}`} alt="" width={18} height={18} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      )}
    </span>
  );
}
