import type { ReactNode } from "react";

// Common TLDs we treat as clickable when a link is written bare (no scheme and
// no `www.`), e.g. `youtu.be/abc` or `kejitbe.app`. Kept curated to avoid
// false positives on things like "Node.js" or "e.g.".
const TLD =
  "com|org|net|io|be|app|gg|co|tv|me|ly|dev|ai|xyz|info|edu|gov|news|store|shop";

// Matches: full `http(s)://…` URLs, `www.…` links, and bare `domain.tld[/path]`.
const URL_RE = new RegExp(
  `(https?:\\/\\/[^\\s<]+|www\\.[^\\s<]+|[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${TLD})(?:\\/[^\\s<]*)?)`,
  "gi",
);

/**
 * Splits `text` into plain strings and `<a>` nodes for any URLs found, so links
 * like `youtu.be/x` render as clickable anchors. Trailing sentence punctuation
 * is excluded from the link. Anchor clicks stop propagation so they don't
 * trigger the surrounding card's handlers.
 */
export function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(URL_RE)) {
    const idx = m.index ?? 0;
    let raw = m[0];
    // Don't swallow trailing sentence punctuation / closing brackets.
    const trail = /[.,;:!?)\]}'"]+$/.exec(raw);
    const trailing = trail ? trail[0] : "";
    if (trailing) {
      raw = raw.slice(0, raw.length - trailing.length);
    }
    if (!raw) {
      continue;
    }
    if (idx > last) {
      nodes.push(text.slice(last, idx));
    }
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    nodes.push(
      <a
        key={`lk-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="cx-post-link"
        onClick={(e) => e.stopPropagation()}
      >
        {raw}
      </a>,
    );
    if (trailing) {
      nodes.push(trailing);
    }
    last = idx + m[0].length;
  }
  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes;
}
