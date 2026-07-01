/**
 * Splits a string into plain-text and URL segments so chat/message text can be
 * rendered with clickable links. Platform-agnostic — the web renders segments as
 * <a>, mobile as a pressable <Text>. Keep this in sync with the web copy at
 * `src/lib/parseTextLinks.ts`.
 *
 * Detects `http(s)://…` and bare `www.…` URLs and strips trailing punctuation
 * (`. , ! ? ; : ) ] } " '`) that usually belongs to the sentence, not the link.
 */
export type TextSegment =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

const URL_RE = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
const TRAILING_PUNCT_RE = /[.,!?;:)\]}'"]+$/;

export function parseTextLinks(text: string | null | undefined): TextSegment[] {
  if (!text) return [];

  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;

    // Peel trailing sentence punctuation off the matched URL.
    let url = raw;
    let trailing = "";
    const m = url.match(TRAILING_PUNCT_RE);
    if (m) {
      trailing = m[0];
      url = url.slice(0, url.length - trailing.length);
    }
    if (!url) continue;

    if (start > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, start) });
    }
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    segments.push({ type: "link", value: url, href });
    if (trailing) segments.push({ type: "text", value: trailing });

    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}

/** First http(s) or www URL in text — used for comment link previews. */
export function extractFirstUrl(text: string | null | undefined): string | null {
  for (const seg of parseTextLinks(text)) {
    if (seg.type === "link") return seg.href;
  }
  return null;
}

export type LinkPreviewData = {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  siteName?: string | null;
};
