import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { normalizeProfileImageUrl } from "../lib/profileImageUrl";
import type { MentionCandidate } from "../hooks/useMentionAutocomplete";

interface MentionAutocompleteProps {
  candidates: MentionCandidate[];
  activeIndex: number;
  onSelect: (user: MentionCandidate) => void;
  onHover: (index: number) => void;
  onClose: () => void;
  /** Positions the dropdown above this element — a portal is used so it
   * isn't clipped by a scroll/rounded-corner ancestor (e.g. the comments
   * panel, which sets `overflow: hidden`). */
  anchorRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
}

/** Floating dropdown of matching users shown while typing an `@mention`.
 * Trigger detection/keyboard nav lives in `useMentionAutocomplete`; this
 * component owns its own viewport positioning, outside-click, and Escape
 * handling since it renders through a portal. */
export function MentionAutocomplete({
  candidates,
  activeIndex,
  onSelect,
  onHover,
  onClose,
  anchorRef,
}: MentionAutocompleteProps) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const open = candidates.length > 0;

  useLayoutEffect(() => {
    if (!open) return;
    function updatePosition() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setStyle({
        position: "fixed",
        left: rect.left,
        width: Math.max(rect.width, 240),
        bottom: window.innerHeight - rect.top + 6,
        zIndex: 10050,
      });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, anchorRef, candidates.length]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".cx-mention-dropdown")) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchorRef, onClose]);

  if (!open || !style) return null;

  return createPortal(
    <div className="cx-mention-dropdown" style={style} role="listbox">
      {candidates.map((user, i) => {
        const name = user.displayName?.trim() || user.username;
        const img = normalizeProfileImageUrl(user.profileImageUrl);
        return (
          <button
            type="button"
            key={user.id}
            className={`cx-mention-option${i === activeIndex ? " cx-mention-option--active" : ""}`}
            // mousedown (not click) so the textarea doesn't lose focus/selection first
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(user);
            }}
            onMouseEnter={() => onHover(i)}
            role="option"
            aria-selected={i === activeIndex}
          >
            <span className="cx-mention-avatar">
              {img ? (
                <img src={img} alt="" />
              ) : (
                <span className="cx-mention-avatar-fallback">
                  {name.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span className="cx-mention-option-text">
              <span className="cx-mention-option-name">{name}</span>
              <span className="cx-mention-option-username">@{user.username}</span>
            </span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
