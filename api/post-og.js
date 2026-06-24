// Vercel serverless function: returns a tiny HTML doc with post-specific Open
// Graph tags for social crawlers (Facebook, WhatsApp, Twitter, etc.) that don't
// run JS. Real browsers never hit this — vercel.json only routes known crawler
// User-Agents here; humans get the normal SPA at /post/:id.

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

function metaTags(post, pageUrl) {
  if (!post) {
    return [
      `<title>${SITE_NAME}</title>`,
      `<meta name="description" content="Compare · vote · vibe — ${SITE_NAME}" />`,
      `<meta property="og:site_name" content="${SITE_NAME}" />`,
      `<meta property="og:title" content="${SITE_NAME}" />`,
      `<meta property="og:description" content="Compare · vote · vibe" />`,
      `<meta property="og:url" content="${esc(pageUrl)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta name="twitter:card" content="summary" />`,
    ].join('\n  ');
  }

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
  return tags.join('\n  ');
}

export default async function handler(req, res) {
  const id = (req.query && req.query.id) || '';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const pageUrl = `${proto}://${host}/post/${id}`;

  const post = id ? await fetchPost(id) : null;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${metaTags(post, pageUrl)}
</head>
<body>
  <p>Opening on ${SITE_NAME}… <a href="${esc(pageUrl)}">Tap here if it doesn't redirect.</a></p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');
  res.status(200).send(html);
}
