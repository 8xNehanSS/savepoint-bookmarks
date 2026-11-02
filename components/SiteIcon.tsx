"use client";

import { useState } from "react";

/** The saved page's own icon via our proxy, falling back to a lettered tile in the category color. */
export default function SiteIcon({ url, host, color }: { url: string; host: string; color: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="site-icon" style={{ "--cat": color } as React.CSSProperties}>
      {failed ? (
        <span className="site-letter">{host.charAt(0).toUpperCase() || "?"}</span>
      ) : (
        <img
          src={`/api/favicon?url=${encodeURIComponent(url)}`}
          alt=""
          width={28}
          height={28}
          loading="lazy"
          decoding="async"
          onLoad={(e) => e.currentTarget.naturalWidth === 0 && setFailed(true)}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
