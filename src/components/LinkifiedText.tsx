import { Fragment } from "react";
import { parseTextLinks } from "../lib/parseTextLinks";

/**
 * Renders message text with clickable URLs as <a> links (open in a new tab).
 * Mobile counterpart: mobile/components/LinkText.tsx.
 */
export function LinkifiedText({ text }: { text: string }) {
  const segments = parseTextLinks(text);
  if (segments.length === 0) return <>{text}</>;

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "link" ? (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            className="cw-bubble-link"
            // Don't let a link tap trigger the bubble's own click handlers.
            onClick={(e) => e.stopPropagation()}
          >
            {seg.value}
          </a>
        ) : (
          <Fragment key={i}>{seg.value}</Fragment>
        ),
      )}
    </>
  );
}
