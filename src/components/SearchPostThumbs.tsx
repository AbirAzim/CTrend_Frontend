/** Multi-image strip for global search post rows (all compare options). */
export function SearchPostThumbs({ imageUrls }: { imageUrls?: string[] | null }) {
  const urls = (imageUrls ?? []).filter(Boolean);
  if (urls.length === 0) {
    return <span className="cx-gsearch-media cx-gsearch-media--empty">📷</span>;
  }
  return (
    <span className="cx-gsearch-media" aria-hidden>
      {urls.slice(0, 4).map((url, idx) => (
        <span
          key={idx}
          className="cx-gsearch-media-cell"
          style={{ backgroundImage: `url(${url})` }}
        />
      ))}
      {urls.length > 4 ? (
        <span className="cx-gsearch-media-more">+{urls.length - 4}</span>
      ) : null}
    </span>
  );
}
