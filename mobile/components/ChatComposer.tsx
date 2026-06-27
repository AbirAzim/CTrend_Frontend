import { Ionicons } from "@expo/vector-icons";
import { type RefObject } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { AnimatedSendButton } from "./AnimatedSendButton";
import type { KeyboardImagePayload } from "../lib/chatKeyboardImage";
import { inferImageMimeType } from "../lib/presignedImageUpload";
import { TextInputWrapper, type PasteEventPayload } from "expo-paste-input";

type ThemeColors = {
  bg: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  section: string;
  inputBg: string;
};

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  maxLength?: number;
  canSend: boolean;
  sending: boolean;
  onSend: () => void;
  colors: ThemeColors;
  bottomInset?: number;
  surfaceColor?: string;
  onPickImage?: () => void;
  pickImageBusy?: boolean;
  showEmojiPicker?: boolean;
  onToggleEmoji?: () => void;
  onFocus?: TextInputProps["onFocus"];
  onKeyboardImage?: (payload: KeyboardImagePayload) => void;
  inputRef?: RefObject<TextInput | null>;
};

export function ChatComposer({
  value,
  onChangeText,
  placeholder = "Message…",
  maxLength = 1000,
  canSend,
  sending,
  onSend,
  colors,
  bottomInset = 0,
  surfaceColor,
  onPickImage,
  pickImageBusy = false,
  showEmojiPicker = false,
  onToggleEmoji,
  onFocus,
  onKeyboardImage,
  inputRef,
}: Props) {
  const hasText = value.trim().length > 0;

  function handlePaste(payload: PasteEventPayload) {
    if (payload.type !== "images" || payload.uris.length === 0) return;
    const uri = payload.uris[0];
    onKeyboardImage?.({
      uri,
      mimeType: inferImageMimeType(uri),
    });
  }

  return (
    <View
      style={[
        st.bar,
        {
          backgroundColor: surfaceColor ?? colors.bg,
          borderTopColor: colors.border,
          paddingBottom: bottomInset + 10,
        },
      ]}
    >
      {onToggleEmoji ? (
        <Pressable
          onPress={onToggleEmoji}
          style={[st.sideBtn, showEmojiPicker && { backgroundColor: `${colors.accent}18` }]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Emoji picker"
        >
          <Ionicons
            name={showEmojiPicker ? "happy" : "happy-outline"}
            size={23}
            color={showEmojiPicker ? colors.accent : colors.muted}
          />
        </Pressable>
      ) : null}

      <View
        style={[
          st.fieldShell,
          {
            backgroundColor: colors.inputBg,
            borderColor: hasText ? `${colors.accent}55` : colors.border,
          },
        ]}
      >
        {onPickImage ? (
          <Pressable
            onPress={onPickImage}
            disabled={pickImageBusy}
            style={st.attachBtn}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="Attach image"
          >
            {pickImageBusy ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="image-outline" size={21} color={colors.accent} />
            )}
          </Pressable>
        ) : null}

        <TextInputWrapper style={st.inputWrap} onPaste={handlePaste}>
          <TextInput
            ref={inputRef}
            style={[st.input, { color: colors.text }]}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            value={value}
            onChangeText={onChangeText}
            onFocus={onFocus}
            multiline
            maxLength={maxLength}
            returnKeyType="default"
            blurOnSubmit={false}
            textAlignVertical="center"
            scrollEnabled
          />
        </TextInputWrapper>
      </View>

      <AnimatedSendButton
        canSend={canSend}
        sending={sending}
        onSend={onSend}
        accentColor={colors.accent}
        disabledColor={colors.section}
        mutedColor={colors.muted}
      />
    </View>
  );
}

const st = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 8 },
    }),
  },
  sideBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  fieldShell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 24,
    borderWidth: 1,
    minHeight: 44,
    maxHeight: 132,
    paddingLeft: 4,
    paddingRight: 6,
    paddingVertical: 4,
  },
  attachBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  inputWrap: {
    flex: 1,
    minHeight: 36,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 8,
    paddingTop: Platform.OS === "ios" ? 10 : 8,
    paddingBottom: Platform.OS === "ios" ? 10 : 8,
    maxHeight: 120,
  },
});
