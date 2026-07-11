import { useEffect, useState } from "react";
import type { LinkPreviewData } from "../lib/parseTextLinks";
import { extractFirstUrl } from "../lib/parseTextLinks";

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

async function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
  try {
    const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    return (await res.json()) as LinkPreviewData;
  } catch {
    return null;
  }
}

/** Chat-message counterpart to CommentLinkPreview.tsx — same API, own styling hooks. */
export function MessageLinkPreview({ text }: { text: string }) {
  const url = extractFirstUrl(text);
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);

  useEffect(() => {
    if (!url) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    void fetchLinkPreview(url).then((data) => {
      if (!cancelled) setPreview(data);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url || !preview || (!preview.title && !preview.image)) return null;

  const label = preview.siteName || hostLabel(url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="cw-bubble-link-preview"
      onClick={(e) => e.stopPropagation()}
    >
      {preview.image ? (
        <span className="cw-bubble-link-preview-img-wrap">
          <img src={preview.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
        </span>
      ) : null}
      <span className="cw-bubble-link-preview-body">
        <span className="cw-bubble-link-preview-domain">{label}</span>
        {preview.title ? (
          <span className="cw-bubble-link-preview-title">{preview.title}</span>
        ) : null}
        {preview.description ? (
          <span className="cw-bubble-link-preview-desc">{preview.description}</span>
        ) : null}
      </span>
    </a>
  );
}
