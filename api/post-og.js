// Vercel serverless function: serves /post/:id with post-specific Open Graph
// tags injected into the SPA's index.html, so Facebook/Twitter/etc. crawlers
// (which don't run JS) show a rich preview. Humans still get the full SPA.

const GRAPHQL_HTTP =
  process.env.VITE_GRAPHQL_HTTP ||
  process.env.GRAPHQL_HTTP ||
  'https://seashell-app-stt6c.ondigitalocean.app/graphql';

const SITE_NAME = 'Ke Jitbe';

const POST_QUERY = `
  query OgPost($id: ID!) {
    getPostById(id: $id) {
      id
      type
      caption
      authorDisplayName
      authorUsername
      imageUrls
      options { label imageUrl }
      category { name }
    }
  }
`;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(s, n) {
  const t = String(s ?? '').trim().replace(/\s+/g, ' ');
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

async function fetchPost(id) {
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

function buildMeta(post, pageUrl) {
  const author =
    (post.authorDisplayName && post.authorDisplayName.trim()) ||
    (post.authorUsername ? `@${post.authorUsername}` : SITE_NAME);

  const caption = (post.caption || '').trim();
  const title = caption ? truncate(caption, 70) : `${author} on ${SITE_NAME}`;

  let description = caption ? truncate(caption, 200) : '';
  if (!description) {
    const cat = post.category?.name;
    description = cat
      ? `Vote on this ${cat} comparison on ${SITE_NAME} — compare · vote · vibe.`
      : `Vote on this comparison on ${SITE_NAME} — compare · vote · vibe.`;
  }

  // First available image: an option image (compare) or a plain image.
  const optImg = (post.options || []).map((o) => o?.imageUrl).find(Boolean);
  const image = optImg || (post.imageUrls || []).find(Boolean) || null;

  const tags = [
    `<title>${esc(title)} · ${SITE_NAME}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(pageUrl)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
  ];

  if (image) {
    tags.push(`<meta property="og:image" content="${esc(image)}" />`);
    tags.push(`<meta property="og:image:alt" content="${esc(title)}" />`);
    tags.push(`<meta name="twitter:card" content="summary_large_image" />`);
    tags.push(`<meta name="twitter:image" content="${esc(image)}" />`);
  } else {
    tags.push(`<meta name="twitter:card" content="summary" />`);
  }

  return tags.join('\n    ');
}

// Strip the existing static OG/Twitter/description/title tags so we don't ship
// duplicates that confuse crawlers, then inject the post-specific block.
function injectMeta(html, metaBlock) {
  let out = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name="description"[^>]*>/gi, '')
    .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, '')
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, '');
  if (out.includes('</head>')) {
    out = out.replace('</head>', `    ${metaBlock}\n  </head>`);
  } else {
    out = `${metaBlock}\n${out}`;
  }
  return out;
}

export default async function handler(req, res) {
  const id = (req.query && req.query.id) || '';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${host}`;
  const pageUrl = `${origin}/post/${id}`;

  // Always serve the real built SPA shell so humans get a working app.
  let html;
  try {
    const shell = await fetch(`${origin}/index.html`, {
      headers: { 'user-agent': 'kejitbe-og' },
    });
    html = await shell.text();
  } catch {
    res.status(302).setHeader('Location', `/index.html`);
    res.end();
    return;
  }

  const post = id ? await fetchPost(id) : null;
  if (post) {
    html = injectMeta(html, buildMeta(post, pageUrl));
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Cache at the edge a bit; crawlers re-scrape periodically.
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
  res.status(200).send(html);
}
