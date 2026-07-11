import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { useQuery } from "@apollo/client/react";
import { SEARCH_USERS } from "../graphql/search";

export type MentionCandidate = {
  id: string;
  username: string;
  displayName?: string | null;
  profileImageUrl?: string | null;
};

export type MentionMode =
  | { kind: "global" }
  | { kind: "participants"; participants: MentionCandidate[] };

type MentionTrigger = { start: number; end: number; query: string };

/** Finds an active `@query` trigger ending at `cursor`, or null if the
 * cursor isn't inside one (e.g. mid-email, or after whitespace broke it). */
function detectMentionTrigger(text: string, cursor: number): MentionTrigger | null {
  if (cursor < 0 || cursor > text.length) return null;
  const upToCursor = text.slice(0, cursor);
  const at = upToCursor.lastIndexOf("@");
  if (at === -1) return null;
  const charBefore = at > 0 ? upToCursor[at - 1] : "";
  if (charBefore && !/\s/.test(charBefore)) return null;
  const query = upToCursor.slice(at + 1);
  if (/\s/.test(query) || query.length > 30) return null;
  return { start: at, end: cursor, query };
}

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function useGlobalMentionSearch(query: string | null): MentionCandidate[] {
  const debounced = useDebounced(query ?? "", 200);
  const { data } = useQuery<{ searchUsers: MentionCandidate[] }>(SEARCH_USERS, {
    variables: { search: debounced, take: 8 },
    skip: !debounced,
    fetchPolicy: "cache-first",
  });
  return query ? data?.searchUsers ?? [] : [];
}

interface UseMentionAutocompleteOptions {
  value: string;
  onChange: (next: string) => void;
  mode: MentionMode;
  textareaRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
}

/**
 * Detects an in-progress `@mention` trigger around the caret, fetches/filters
 * candidates (global search or a fixed participants list), and handles
 * keyboard navigation + splicing the chosen `@username` into the text.
 */
export function useMentionAutocomplete({
  value,
  onChange,
  mode,
  textareaRef,
}: UseMentionAutocompleteOptions) {
  const [cursor, setCursor] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const trigger = useMemo(
    () => (cursor === null ? null : detectMentionTrigger(value, cursor)),
    [value, cursor],
  );

  const globalCandidates = useGlobalMentionSearch(
    mode.kind === "global" ? trigger?.query ?? null : null,
  );

  const candidates = useMemo<MentionCandidate[]>(() => {
    if (!trigger) return [];
    if (mode.kind === "participants") {
      const q = trigger.query.toLowerCase();
      return mode.participants
        .filter(
          (p) =>
            p.username.toLowerCase().includes(q) ||
            (p.displayName ?? "").toLowerCase().includes(q),
        )
        .slice(0, 8);
    }
    return globalCandidates;
  }, [trigger, mode, globalCandidates]);

  useEffect(() => {
    setActiveIndex(0);
  }, [trigger?.query, trigger?.start]);

  const isOpen = trigger !== null && candidates.length > 0;

  const select = useCallback(
    (user: MentionCandidate) => {
      if (!trigger) return;
      const before = value.slice(0, trigger.start);
      const after = value.slice(trigger.end);
      const insertion = `@${user.username} `;
      onChange(`${before}${insertion}${after}`);
      const pos = before.length + insertion.length;
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(pos, pos);
        }
      });
      setCursor(null);
    },
    [trigger, value, onChange, textareaRef],
  );

  /** Call from the textarea's onKeyDown. Returns true if the key was
   * consumed by the dropdown (caller should skip its own handling). */
  const handleKeyDown = useCallback(
    (e: { key: string; preventDefault: () => void }): boolean => {
      if (!isOpen) return false;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % candidates.length);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length);
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        select(candidates[activeIndex]);
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setCursor(null);
        return true;
      }
      return false;
    },
    [isOpen, candidates, activeIndex, select],
  );

  /** Call from the textarea's onChange/onClick/onKeyUp/onSelect to keep the
   * trigger detector in sync with the current caret position. */
  const syncCursor = useCallback(() => {
    const el = textareaRef.current;
    setCursor(el ? (el.selectionStart ?? value.length) : null);
  }, [textareaRef, value.length]);

  const close = useCallback(() => setCursor(null), []);

  return {
    isOpen,
    candidates,
    activeIndex,
    setActiveIndex,
    select,
    handleKeyDown,
    syncCursor,
    close,
  };
}
