import { useFonts, Caveat_700Bold } from "@expo-google-fonts/caveat";
import { Image } from "expo-image";
import { Platform, StyleSheet, Text, View } from "react-native";
import headerLogoAsset from "../assets/header-logo.png";
import headerLogoLightSolidAsset from "../assets/header-logo-light-solid.png";

const LOGO_W = 112;
const LOGO_H = 30;

type Props = {
  isDark: boolean;
  color: string;
};

/** Crisp header wordmark — vector Caveat on light theme, gradient PNG on dark. */
export function HeaderWordmark({ isDark, color }: Props) {
  const [fontsLoaded] = useFonts({ Caveat_700Bold });

  if (isDark) {
    return (
      <Image
        source={headerLogoAsset}
        style={styles.logoFill}
        contentFit="contain"
        accessibilityLabel="Ke Jitbe"
      />
    );
  }

  if (!fontsLoaded) {
    return (
      <Image
        source={headerLogoLightSolidAsset}
        style={styles.logoFill}
        contentFit="contain"
        accessibilityLabel="Ke Jitbe"
      />
    );
  }

  return (
    <View style={styles.wordmarkBox}>
      <Text style={[styles.wordmark, { color }]} numberOfLines={1} accessibilityLabel="Ke Jitbe">
        Ke Jitbe
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logoFill: { width: "100%", height: "100%" },
  wordmarkBox: {
    width: LOGO_W,
    height: LOGO_H,
    justifyContent: "center",
  },
  wordmark: {
    fontFamily: "Caveat_700Bold",
    fontSize: 30,
    lineHeight: LOGO_H,
    letterSpacing: -0.3,
    ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
  },
});
