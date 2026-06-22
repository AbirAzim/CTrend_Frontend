import { useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { PressableScale } from "./PressableScale";
import { useCoins, useCoinsBalance } from "../context/CoinsContext";

/** Compact coin balance for the top bar. Doubles as the fly-animation target
 * and links to the coins hub (history + leaderboard). */
export function CoinCounter() {
  const { registerCounter, counterAnim } = useCoins();
  const balance = useCoinsBalance();
  const viewRef = useRef<View | null>(null);

  return (
    <PressableScale
      hitSlop={6}
      onPress={() => router.push("/coins" as `/${string}`)}
    >
      <Animated.View
        ref={(node) => {
          // PressableScale wraps an Animated.View; capture the inner View for measuring.
          viewRef.current = node as unknown as View;
          registerCounter(node as unknown as View);
        }}
        style={[styles.pill, { transform: [{ scale: counterAnim }] }]}
      >
        <View style={styles.coin}>
          <Text style={styles.coinGlyph}>¢</Text>
        </View>
        <Text style={styles.value}>{balance ?? 0}</Text>
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 30,
    paddingLeft: 4,
    paddingRight: 9,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(245,197,24,0.4)",
    backgroundColor: "rgba(245,197,24,0.14)",
  },
  coin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#f5c518",
    alignItems: "center",
    justifyContent: "center",
  },
  coinGlyph: { color: "#7a4a05", fontWeight: "900", fontSize: 11 },
  value: {
    color: "#f5c518",
    fontWeight: "800",
    fontSize: 13,
    minWidth: 11,
    textAlign: "center",
  },
});
