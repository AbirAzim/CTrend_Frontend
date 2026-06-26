import { Linking, StyleProp, Text, TextStyle } from "react-native";
import { parseTextLinks } from "@ctrend/shared/lib/parseTextLinks";

/**
 * Renders message text with clickable URLs. URLs open in the system browser;
 * plain text inherits the surrounding style. Web counterpart: LinkifiedText.tsx.
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
  const segments = parseTextLinks(text);
  if (segments.length === 0) return <Text style={style}>{text}</Text>;

  return (
    <Text style={style}>
      {segments.map((seg, i) =>
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
          <Text key={i}>{seg.value}</Text>
        ),
      )}
    </Text>
  );
}
