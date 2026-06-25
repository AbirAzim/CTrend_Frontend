import { ImageResponse } from '@vercel/og';
import {
  fetchPost,
  getPreviewTiles,
  gridLayout,
  SITE_NAME,
} from './_postOgShared.js';

export const config = { runtime: 'edge' };

const W = 1200;
const H = 630;

export default async function handler(req) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  const post = id ? await fetchPost(id) : null;
  const tiles = getPreviewTiles(post);

  if (tiles.length === 0) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0b1220',
            color: '#e2e8f0',
            fontSize: 48,
            fontWeight: 700,
          }}>
          {SITE_NAME}
        </div>
      ),
      { width: W, height: H },
    );
  }

  const { cols, rows } = gridLayout(tiles.length);
  const cellW = Math.floor(W / cols);
  const cellH = Math.floor(H / rows);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexWrap: 'wrap',
          background: '#0b1220',
        }}>
        {tiles.map((tile, i) => (
          <div
            key={`${tile.url}-${i}`}
            style={{
              width: cellW,
              height: cellH,
              display: 'flex',
              position: 'relative',
              overflow: 'hidden',
            }}>
            <img
              src={tile.url}
              width={cellW}
              height={cellH}
              style={{ objectFit: 'cover' }}
            />
            {tile.label ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: '10px 14px',
                  background: 'rgba(0,0,0,0.58)',
                  color: '#ffffff',
                  fontSize: rows > 1 ? 22 : 28,
                  fontWeight: 700,
                  lineHeight: 1.2,
                }}>
                {tile.label.length > 28 ? `${tile.label.slice(0, 27)}…` : tile.label}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    ),
    { width: W, height: H },
  );
}
