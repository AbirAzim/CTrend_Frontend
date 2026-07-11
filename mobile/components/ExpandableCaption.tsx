import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextStyle, View } from 'react-native';
import { MentionifyText } from '../lib/mentionify';

const CLAMP_LINES = 4;
// RN can't measure "would this overflow N lines" without a second render
// pass, so this is a rough chars-per-caption heuristic to decide whether the
// toggle is worth showing at all — numberOfLines is the real visual backstop
// either way, so being a little generous here just costs an occasional
// "See more" on text that would've barely fit.
const LONG_TEXT_THRESHOLD = 150;

/**
 * Caption with a Facebook-style "See more" toggle. Collapsed state shows
 * plain (non-interactive) truncated text via native `numberOfLines`, since
 * `MentionifyText`'s flex-wrap layout (used whenever the caption has
 * mentions/links) can't be clamped to N lines the same way a plain `<Text>`
 * can. Expanding swaps in the full mention/link-aware render.
 */
export function ExpandableCaption({
  text,
  style,
}: {
  text: string;
  style?: TextStyle | TextStyle[];
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > LONG_TEXT_THRESHOLD;
  const flat = StyleSheet.flatten(style) ?? {};
  const moreStyle: TextStyle = {
    paddingHorizontal: flat.paddingHorizontal,
    paddingLeft: flat.paddingLeft,
    paddingRight: flat.paddingRight,
    fontSize: flat.fontSize,
    fontWeight: '700',
    color: flat.color,
    opacity: 0.6,
  };

  if (!isLong) {
    return <MentionifyText text={text} style={style} />;
  }

  if (expanded) {
    return (
      <View>
        <MentionifyText text={text} style={style} />
        <Pressable onPress={() => setExpanded(false)} hitSlop={4}>
          <Text style={moreStyle}>See less</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Text style={style} numberOfLines={CLAMP_LINES}>
        {text}
      </Text>
      <Pressable onPress={() => setExpanded(true)} hitSlop={4}>
        <Text style={moreStyle}>See more</Text>
      </Pressable>
    </View>
  );
}
