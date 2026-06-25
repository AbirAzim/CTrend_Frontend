// Vercel serverless function: returns a tiny HTML doc with post-specific Open
// Graph tags for social crawlers (Facebook, WhatsApp, Twitter, etc.) that don't
// run JS. Real browsers never hit this — vercel.json only routes known crawler
// User-Agents here; humans get the normal SPA at /post/:id.

import {
  esc,
  fetchPost,
  buildPostMeta,
  SITE_NAME,
} from './_postOgShared.js';

function metaTags(post, pageUrl, origin) {
  const meta = buildPostMeta(post, pageUrl, origin);

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

  const tags = [
    `<title>${esc(meta.title)} · ${SITE_NAME}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${esc(pageUrl)}" />`,
    `<meta property="og:type" content="${meta.type}" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
  ];

  if (meta.image) {
    tags.push(`<meta property="og:image" content="${esc(meta.image)}" />`);
    tags.push(`<meta property="og:image:width" content="1200" />`);
    tags.push(`<meta property="og:image:height" content="630" />`);
    tags.push(`<meta property="og:image:alt" content="${esc(meta.title)}" />`);
    tags.push(`<meta name="twitter:card" content="summary_large_image" />`);
    tags.push(`<meta name="twitter:image" content="${esc(meta.image)}" />`);
  } else {
    tags.push(`<meta name="twitter:card" content="summary" />`);
  }

  return tags.join('\n  ');
}

export default async function handler(req, res) {
  const id = (req.query && req.query.id) || '';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${host}`;
  const pageUrl = `${origin}/post/${id}`;

  const post = id ? await fetchPost(id) : null;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${metaTags(post, pageUrl, origin)}
</head>
<body>
  <p>Opening on ${SITE_NAME}… <a href="${esc(pageUrl)}">Tap here if it doesn't redirect.</a></p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');
  res.status(200).send(html);
}
