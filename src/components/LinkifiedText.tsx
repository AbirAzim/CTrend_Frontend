import { Fragment, type ReactNode } from "react";
import { parseTextLinks } from "../lib/parseTextLinks";
import { MentionSpan } from "../lib/mentionify";

const MENTION_RE = /@([a-zA-Z0-9_]{2,30})/g;

function renderLinks(text: string, keyPrefix: string): ReactNode[] {
  const segments = parseTextLinks(text);
  if (segments.length === 0) {
    return text ? [<Fragment key={keyPrefix}>{text}</Fragment>] : [];
  }
  return segments.map((seg, i) =>
    seg.type === "link" ? (
      <a
        key={`${keyPrefix}-${i}`}
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
      <Fragment key={`${keyPrefix}-${i}`}>{seg.value}</Fragment>
    ),
  );
}

/**
 * Renders message text with clickable URLs as <a> links and `@mentions` as
 * clickable profile links. Mobile counterpart: mobile/components/LinkText.tsx.
 */
export function LinkifiedText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) {
      nodes.push(...renderLinks(text.slice(last, idx), `lt-seg-${key}`));
    }
    nodes.push(<MentionSpan key={`lt-mn-${key++}`} username={m[1]} />);
    last = idx + m[0].length;
  }
  if (last < text.length) {
    nodes.push(...renderLinks(text.slice(last), `lt-seg-${key}`));
  }
  return <>{nodes}</>;
}
