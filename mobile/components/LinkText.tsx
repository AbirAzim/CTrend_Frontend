import { Fragment, type ReactNode } from "react";
import { Linking, StyleProp, Text, TextStyle } from "react-native";
import { parseTextLinks } from "@ctrend/shared/lib/parseTextLinks";
import { useMentionNavigate } from "../lib/mentionify";

// Non-global, so `.test()` below is stateless — separate from the `g`-flagged
// copy used for `matchAll` (global regexes carry mutable lastIndex state that
// would otherwise leak across calls sharing this module-level constant).
const HAS_MENTION_RE = /@([a-zA-Z0-9_]{2,30})/;
const MENTION_RE = /@([a-zA-Z0-9_]{2,30})/g;

/**
 * Renders message text with clickable URLs and `@mentions`. URLs open in the
 * system browser; mentions resolve the username and navigate to that user's
 * profile. Plain text inherits the surrounding style. Web counterpart:
 * LinkifiedText.tsx.
 */
export function LinkText({
  text,
  style,
  linkColor,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  linkColor?: string;
}) {
  const navigateToMention = useMentionNavigate();
  const segments = parseTextLinks(text);
  const hasMention = HAS_MENTION_RE.test(text);
  if (segments.length === 0 && !hasMention) return <Text style={style}>{text}</Text>;

  function renderPlain(value: string, keyPrefix: string): ReactNode {
    if (!HAS_MENTION_RE.test(value)) return <Fragment key={keyPrefix}>{value}</Fragment>;
    const nodes: ReactNode[] = [];
    let last = 0;
    let i = 0;
    for (const m of value.matchAll(MENTION_RE)) {
      const idx = m.index ?? 0;
      if (idx > last) nodes.push(<Fragment key={`${keyPrefix}-t${i}`}>{value.slice(last, idx)}</Fragment>);
      const username = m[1];
      nodes.push(
        <Text
          key={`${keyPrefix}-m${i}`}
          style={{ color: linkColor, fontWeight: "600" }}
          onPressIn={() => void navigateToMention(username)}
          accessibilityRole="link"
        >
          @{username}
        </Text>,
      );
      last = idx + m[0].length;
      i++;
    }
    if (last < value.length) nodes.push(<Fragment key={`${keyPrefix}-tail`}>{value.slice(last)}</Fragment>);
    return nodes;
  }

  return (
    <Text style={style}>
      {segments.length === 0
        ? renderPlain(text, "seg-0")
        : segments.map((seg, i) =>
            seg.type === "link" ? (
              <Text
                key={i}
                style={{ color: linkColor, textDecorationLine: "underline" }}
                onPressIn={() => {
                  void Linking.openURL(seg.href).catch(() => {});
                }}
                accessibilityRole="link"
              >
                {seg.value}
              </Text>
            ) : (
              renderPlain(seg.value, `seg-${i}`)
            ),
          )}
    </Text>
  );
}
