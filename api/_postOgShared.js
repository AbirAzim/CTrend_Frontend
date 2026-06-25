const GRAPHQL_HTTP =
  process.env.VITE_GRAPHQL_HTTP ||
  process.env.GRAPHQL_HTTP ||
  'https://seashell-app-stt6c.ondigitalocean.app/graphql';

export const SITE_NAME = 'Ke Jitbe';

export const POST_QUERY = `
  query OgPost($id: ID!) {
    getPostById(id: $id) {
      id
      type
      format
      caption
      authorDisplayName
      authorUsername
      imageUrls
      options { label imageUrl }
      category { name }
    }
  }
`;

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function truncate(s, n) {
  const t = String(s ?? '').trim().replace(/\s+/g, ' ');
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

export async function fetchPost(id) {
  try {
    const res = await fetch(GRAPHQL_HTTP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: POST_QUERY, variables: { id } }),
    });
    const json = await res.json();
    return json?.data?.getPostById ?? null;
  } catch {
    return null;
  }
}

/** Side-by-side / grid tiles for compare & poll link previews (max 6). */
export function getPreviewTiles(post) {
  if (!post) return [];

  const options = post.options || [];
  const imageUrls = (post.imageUrls || []).filter((u) => typeof u === 'string' && u.trim());

  const tiles = [];
  if (options.length > 0) {
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const url = (opt?.imageUrl?.trim() || imageUrls[i]?.trim() || '').trim();
      if (!url) continue;
      tiles.push({ url, label: opt?.label?.trim() || '' });
    }
  }

  if (tiles.length === 0) {
    for (const url of imageUrls) {
      tiles.push({ url: url.trim(), label: '' });
    }
  }

  return tiles.slice(0, 6);
}

export function gridLayout(count) {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  return { cols: 3, rows: 2 };
}

export function buildPostMeta(post, pageUrl, origin) {
  if (!post) {
    return {
      title: SITE_NAME,
      description: `Compare · vote · vibe — ${SITE_NAME}`,
      image: null,
      type: 'website',
    };
  }

  const author =
    (post.authorDisplayName && post.authorDisplayName.trim()) ||
    (post.authorUsername ? `@${post.authorUsername}` : SITE_NAME);
  const caption = (post.caption || '').trim();
  const title = caption ? truncate(caption, 70) : `${author} on ${SITE_NAME}`;
  let description = caption ? truncate(caption, 200) : '';
  if (!description) {
    const fmt = post.format === 'poll' ? 'poll' : 'comparison';
    const cat = post.category?.name;
    description = cat
      ? `Vote on this ${cat} ${fmt} on ${SITE_NAME} — compare · vote · vibe.`
      : `Vote on this ${fmt} on ${SITE_NAME} — compare · vote · vibe.`;
  }

  const tiles = getPreviewTiles(post);
  let image = null;
  if (tiles.length >= 2 && post.id) {
    image = `${origin}/api/post-og-image?id=${encodeURIComponent(post.id)}`;
  } else if (tiles.length === 1) {
    image = tiles[0].url;
  }

  return { title, description, image, type: 'article' };
}
