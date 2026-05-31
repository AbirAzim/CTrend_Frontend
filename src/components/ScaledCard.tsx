import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  scale?: number;
  children: ReactNode;
};

/**
 * Renders children at `scale` (default 0.5) using CSS transform.
 * A ResizeObserver keeps the outer container height = natural height × scale
 * so surrounding layout is always correct.
 */
export function ScaledCard({ scale = 0.5, children }: Props) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [naturalHeight, setNaturalHeight] = useState(0);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setNaturalHeight(el.offsetHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className="cx-scaled-card-outer"
      style={{ height: naturalHeight > 0 ? naturalHeight * scale : undefined }}
    >
      <div
        ref={innerRef}
        className="cx-scaled-card-inner"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: `${100 / scale}%`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
