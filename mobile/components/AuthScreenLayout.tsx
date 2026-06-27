import { Image } from "expo-image";
import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import logoAsset from "../assets/logo.png";
import { useTheme } from "../context/ThemeContext";

type Props = {
  children: ReactNode;
};

/** Shared auth chrome — fixed logo/header size so login ↔ signup swaps don't jump. */
export function AuthScreenLayout({ children }: Props) {
  const { colors } = useTheme();

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Image source={logoAsset} style={styles.logoImg} contentFit="contain" />
          <Text style={[styles.tagline, { color: colors.subtext }]}>Compare · vote · vibe</Text>
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthFormCard({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 40 },
  header: { alignItems: "center", marginBottom: 36, minHeight: 168 },
  logoImg: { width: 140, height: 120, marginBottom: 6 },
  tagline: { fontSize: 14, marginTop: 2 },
  form: { borderRadius: 20, padding: 24, gap: 8, borderWidth: 1 },
});
