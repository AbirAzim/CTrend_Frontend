import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import type { LinkPreviewData } from "@ctrend/shared/lib/parseTextLinks";
import { extractFirstUrl } from "@ctrend/shared/lib/parseTextLinks";

const API_BASE = (process.env.EXPO_PUBLIC_WEB_ORIGIN ?? "https://www.kejitbe.app").replace(
  /\/$/,
  "",
);

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

async function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
  try {
    const res = await fetch(`${API_BASE}/api/link-preview?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    return (await res.json()) as LinkPreviewData;
  } catch {
    return null;
  }
}

type Props = {
  text: string;
  colors: {
    border: string;
    card: string;
    muted: string;
    subtext: string;
    text: string;
  };
};

export function CommentLinkPreview({ text, colors }: Props) {
  const url = extractFirstUrl(text);
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);

  useEffect(() => {
    if (!url) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    void fetchLinkPreview(url).then((data) => {
      if (!cancelled) setPreview(data);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url || !preview || (!preview.title && !preview.image)) return null;

  const label = preview.siteName || hostLabel(url);

  return (
    <Pressable
      style={[st.card, { borderColor: colors.border, backgroundColor: colors.card }]}
      onPress={() => void Linking.openURL(url)}
      accessibilityRole="link"
    >
      {preview.image ? (
        <Image
          source={{ uri: preview.image }}
          style={st.thumb}
          contentFit="cover"
          recyclingKey={preview.image}
        />
      ) : null}
      <View style={st.body}>
        <Text style={[st.domain, { color: colors.muted }]} numberOfLines={1}>
          {label}
        </Text>
        {preview.title ? (
          <Text style={[st.title, { color: colors.text }]} numberOfLines={2}>
            {preview.title}
          </Text>
        ) : null}
        {preview.description ? (
          <Text style={[st.desc, { color: colors.subtext }]} numberOfLines={2}>
            {preview.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  card: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "stretch",
  },
  thumb: {
    width: 88,
    minHeight: 88,
    backgroundColor: "#e5e7eb",
  },
  body: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
    justifyContent: "center",
  },
  domain: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
  },
  desc: {
    fontSize: 12,
    lineHeight: 16,
  },
});
