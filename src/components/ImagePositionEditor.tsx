import { useCallback, useRef, useState } from "react";
import {
  clampFocal,
  DEFAULT_IMAGE_FOCAL,
  imageObjectPosition,
} from "../lib/imageFocal";

type Props = {
  src: string;
  label: string;
  focalX: number;
  focalY: number;
  onChange: (focalX: number, focalY: number) => void;
  onClose: () => void;
};

export function ImagePositionEditor({
  src,
  label,
  focalX,
  focalY,
  onChange,
  onClose,
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startFocalX: number;
    startFocalY: number;
  } | null>(null);
  const [localX, setLocalX] = useState(focalX);
  const [localY, setLocalY] = useState(focalY);

  const applyDelta = useCallback((clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || !frame) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dx = clientX - drag.startX;
    const dy = clientY - drag.startY;
    setLocalX(clampFocal(drag.startFocalX - (dx / rect.width) * 100));
    setLocalY(clampFocal(drag.startFocalY - (dy / rect.height) * 100));
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startFocalX: localX,
      startFocalY: localY,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    applyDelta(e.clientX, e.clientY);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function handleDone() {
    onChange(localX, localY);
    onClose();
  }

  const position = imageObjectPosition(localX, localY);

  return (
    <div
      className="cx-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Adjust image position for ${label}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cx-modal-card cx-image-position-modal">
        <div className="cx-modal-head">
          <h2 className="cx-modal-title">Adjust position</h2>
          <button type="button" className="cx-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="cx-modal-body">
          <p className="cx-image-position-hint muted small">
            Drag the image so the important part shows in the frame. This matches how it appears in the feed.
          </p>
          <div
            ref={frameRef}
            className="cx-image-position-frame"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <img
              src={src}
              alt=""
              className="cx-image-position-img"
              style={{ objectPosition: position }}
              draggable={false}
            />
            <span className="cx-image-position-frame-label">{label}</span>
          </div>
          <div className="cx-image-position-sliders">
            <label className="cx-image-position-slider-label">
              Horizontal
              <input
                type="range"
                min={0}
                max={100}
                value={localX}
                onChange={(e) => setLocalX(clampFocal(Number(e.target.value)))}
              />
            </label>
            <label className="cx-image-position-slider-label">
              Vertical
              <input
                type="range"
                min={0}
                max={100}
                value={localY}
                onChange={(e) => setLocalY(clampFocal(Number(e.target.value)))}
              />
            </label>
          </div>
        </div>
        <div className="cx-modal-footer">
          <button
            type="button"
            className="cx-conn-btn cx-conn-btn--ghost"
            onClick={() => {
              setLocalX(DEFAULT_IMAGE_FOCAL);
              setLocalY(DEFAULT_IMAGE_FOCAL);
            }}
          >
            Reset
          </button>
          <button type="button" className="cx-conn-btn cx-conn-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="cx-conn-btn cx-conn-btn--add" onClick={handleDone}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
