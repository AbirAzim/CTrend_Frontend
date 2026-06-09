import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";

const OUTPUT_W = 1080;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;

type BgMode = "blur" | "black" | "white";

type Props = {
  /** Object URL (or same-origin url) of the image to crop. */
  src: string;
  /** Target frame ratio = height / width (default 1 = square). */
  aspect?: number;
  onCancel: () => void;
  onDone: (file: File) => void;
};

/**
 * Canvas-based crop + zoom + fill editor (web parity with the mobile cropper).
 * Drag to position, wheel/buttons to zoom; zooming out reveals a creative fill
 * (blurred image, or solid black/white). Exports exactly what's framed.
 */
export function CompareImageCropper({ src, aspect = 1, onCancel, onDone }: Props) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [bg, setBg] = useState<BgMode>("blur");
  const [saving, setSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const fW = Math.min(360, (typeof window !== "undefined" ? window.innerWidth : 400) - 72);
  const fH = fW * aspect;

  const baseScale = nat ? Math.max(fW / nat.w, fH / nat.h) : 1;
  const S = baseScale * scale;

  useEffect(() => {
    setScale(1);
    setTx(0);
    setTy(0);
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      imgRef.current = im;
      setNat({ w: im.naturalWidth || 1, h: im.naturalHeight || 1 });
    };
    im.src = src;
  }, [src]);

  function clampT(txv: number, tyv: number, Sval: number) {
    if (!nat) return { tx: txv, ty: tyv };
    const maxX = Math.abs(nat.w * Sval - fW) / 2;
    const maxY = Math.abs(nat.h * Sval - fH) / 2;
    return { tx: Math.min(maxX, Math.max(-maxX, txv)), ty: Math.min(maxY, Math.max(-maxY, tyv)) };
  }

  function zoomBy(factor: number) {
    setScale((prev) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * factor));
      const c = clampT(tx, ty, baseScale * next);
      setTx(c.tx);
      setTy(c.ty);
      return next;
    });
  }

  function onPointerDown(e: ReactPointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY, tx, ty };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent) {
    if (!drag.current) return;
    const c = clampT(drag.current.tx + (e.clientX - drag.current.x), drag.current.ty + (e.clientY - drag.current.y), S);
    setTx(c.tx);
    setTy(c.ty);
  }
  function onPointerUp() { drag.current = null; }

  function onWheel(e: ReactWheelEvent) {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08);
  }

  function handleDone() {
    const img = imgRef.current;
    if (!nat || !img) return;
    setSaving(true);
    try {
      const cW = OUTPUT_W;
      const cH = Math.round(OUTPUT_W * aspect);
      const canvas = document.createElement("canvas");
      canvas.width = cW;
      canvas.height = cH;
      const ctx = canvas.getContext("2d");
      if (!ctx) { setSaving(false); return; }
      const k = cW / fW;

      // Background fill
      if (bg === "blur") {
        ctx.filter = `blur(${Math.round(26 * k)}px)`;
        const cover = Math.max(cW / nat.w, cH / nat.h);
        const bw = nat.w * cover;
        const bh = nat.h * cover;
        ctx.drawImage(img, (cW - bw) / 2, (cH - bh) / 2, bw, bh);
        ctx.filter = "none";
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(0, 0, cW, cH);
      } else {
        ctx.fillStyle = bg === "white" ? "#ffffff" : "#000000";
        ctx.fillRect(0, 0, cW, cH);
      }

      // Foreground photo at the framed position/scale
      const imgW = nat.w * S;
      const imgH = nat.h * S;
      const left = (fW - imgW) / 2 + tx;
      const top = (fH - imgH) / 2 + ty;
      ctx.drawImage(img, left * k, top * k, imgW * k, imgH * k);

      canvas.toBlob(
        (blob) => {
          if (blob) onDone(new File([blob], `compare_${Date.now()}.jpg`, { type: "image/jpeg" }));
          else setSaving(false);
        },
        "image/jpeg",
        0.92,
      );
    } catch {
      setSaving(false);
    }
  }

  const imgW = nat ? nat.w * S : 0;
  const imgH = nat ? nat.h * S : 0;
  const fgStyle: CSSProperties = {
    position: "absolute",
    width: imgW,
    height: imgH,
    left: (fW - imgW) / 2 + tx,
    top: (fH - imgH) / 2 + ty,
    userSelect: "none",
    pointerEvents: "none",
  };

  return (
    <div className="cx-modal-overlay" role="dialog" aria-modal="true" aria-label="Crop image" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="ig-cropper">
        <h3 className="ig-cropper-title">Crop &amp; position</h3>
        <p className="ig-cropper-hint">Drag to move · scroll or −/+ to zoom · what you see is what posts</p>

        <div
          className="ig-cropper-frame"
          style={{ width: fW, height: fH }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
        >
          {nat && bg === "blur" ? (
            <>
              <img src={src} alt="" className="ig-cropper-bgblur" draggable={false} />
              <div className="ig-cropper-bgtint" />
            </>
          ) : (
            <div className="ig-cropper-bgsolid" style={{ background: bg === "white" ? "#fff" : "#000" }} />
          )}
          {nat ? <img src={src} alt="" style={fgStyle} draggable={false} /> : <div className="ig-cropper-loading">Loading…</div>}
          <div className="ig-cropper-guide ig-cropper-guide--v" style={{ left: fW / 3 }} />
          <div className="ig-cropper-guide ig-cropper-guide--v" style={{ left: (fW / 3) * 2 }} />
          <div className="ig-cropper-guide ig-cropper-guide--h" style={{ top: fH / 3 }} />
          <div className="ig-cropper-guide ig-cropper-guide--h" style={{ top: (fH / 3) * 2 }} />
        </div>

        <div className="ig-cropper-zoom">
          <button type="button" className="ig-cropper-zoom-btn" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
          <span className="ig-cropper-zoom-val">{Math.round(scale * 100)}%</span>
          <button type="button" className="ig-cropper-zoom-btn" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        </div>

        <div className="ig-cropper-fill">
          <span className="ig-cropper-fill-label">Fill</span>
          {(["blur", "black", "white"] as BgMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`ig-cropper-fill-chip${bg === m ? " ig-cropper-fill-chip--active" : ""}`}
              onClick={() => setBg(m)}
            >
              {m === "blur" ? "Blur" : m === "black" ? "Black" : "White"}
            </button>
          ))}
        </div>

        <div className="ig-cropper-actions">
          <button type="button" className="ig-cropper-btn ig-cropper-btn--ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" className="ig-cropper-btn ig-cropper-btn--primary" onClick={handleDone} disabled={saving || !nat}>
            {saving ? "Saving…" : "Use photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
