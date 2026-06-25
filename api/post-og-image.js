// Node.js serverless function — composites compare/poll option images for og:image.
// Uses sharp (not @vercel/og) so it runs on Vercel's standard serverless runtime.

import sharp from 'sharp';
import {
  fetchPost,
  getPreviewTiles,
  gridLayout,
  SITE_NAME,
} from './postOgShared.js';

const W = 1200;
const H = 630;

function escSvg(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function labelSvg(text, width, fontSize) {
  const label = text.length > 28 ? `${text.slice(0, 27)}…` : text;
  return Buffer.from(
    `<svg width="${width}" height="52" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.58)"/>
      <text x="14" y="34" fill="#ffffff" font-size="${fontSize}" font-weight="700" font-family="Arial,sans-serif">${escSvg(label)}</text>
    </svg>`,
  );
}

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function buildComposite(tiles) {
  const { cols, rows } = gridLayout(tiles.length);
  const cellW = Math.floor(W / cols);
  const cellH = Math.floor(H / rows);
  const fontSize = rows > 1 ? 22 : 28;
  const composites = [];

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const row = Math.floor(i / cols);
    const col = i % cols;
    const left = col * cellW;
    const top = row * cellH;

    try {
      const raw = await fetchImageBuffer(tile.url);
      const resized = await sharp(raw).resize(cellW, cellH, { fit: 'cover' }).toBuffer();
      composites.push({ input: resized, left, top });
    } catch {
      const placeholder = await sharp({
        create: { width: cellW, height: cellH, channels: 3, background: '#1e293b' },
      })
        .png()
        .toBuffer();
      composites.push({ input: placeholder, left, top });
    }

    if (tile.label) {
      composites.push({
        input: labelSvg(tile.label, cellW, fontSize),
        left,
        top: top + cellH - 52,
      });
    }
  }

  return sharp({
    create: { width: W, height: H, channels: 3, background: '#0b1220' },
  })
    .composite(composites)
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function buildFallback() {
  const svg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#0b1220"/>
      <text x="50%" y="50%" fill="#e2e8f0" font-size="48" font-weight="700" font-family="Arial,sans-serif" text-anchor="middle" dominant-baseline="middle">${escSvg(SITE_NAME)}</text>
    </svg>`,
  );
  return sharp(svg).jpeg({ quality: 85 }).toBuffer();
}

export default async function handler(req, res) {
  const id = (req.query && req.query.id) || '';
  const post = id ? await fetchPost(id) : null;
  const tiles = getPreviewTiles(post);

  try {
    const image =
      tiles.length > 0 ? await buildComposite(tiles) : await buildFallback();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');
    res.status(200).send(image);
  } catch {
    const image = await buildFallback();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 's-maxage=60');
    res.status(200).send(image);
  }
}
