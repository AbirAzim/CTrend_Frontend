import { useLayoutEffect, useRef, useState } from "react";
import { mentionifyText } from "../lib/mentionify";

/**
 * Caption with a Facebook-style "See more" toggle — clamped to 4 lines via
 * CSS (`.cx-caption-clamped`), with the toggle shown only when the DOM
 * actually overflows (measured, not a character-count guess).
 */
export function ExpandableCaption({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);

  return (
    <>
      <p ref={ref} className={expanded ? undefined : "cx-caption-clamped"}>
        {mentionifyText(text)}
      </p>
      {overflowing || expanded ? (
        <button
          type="button"
          className="cx-caption-more-btn"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? "See less" : "See more"}
        </button>
      ) : null}
    </>
  );
}
