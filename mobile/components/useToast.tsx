import { useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ToastType = "success" | "error" | "info";

const BG: Record<ToastType, string> = {
  success: "#22c55e",
  error: "#ef4444",
  info: "#6366f1",
};

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const [type, setType] = useState<ToastType>("success");
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-50)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, t: ToastType = "success") {
    if (timer.current) clearTimeout(timer.current);
    setMessage(msg);
    setType(t);
    opacity.setValue(0);
    translateY.setValue(-50);
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 180, friction: 12 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    timer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -50, duration: 280, useNativeDriver: true }),
      ]).start(() => setMessage(null));
    }, 2500);
  }

  function ToastView() {
    const insets = useSafeAreaInsets();
    if (!message) return null;
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.toast,
          { backgroundColor: BG[type], top: insets.top + 12, opacity, transform: [{ translateY }] },
        ]}
      >
        <View style={styles.inner}>
          <Text style={styles.text}>{message}</Text>
        </View>
      </Animated.View>
    );
  }

  return { showToast, ToastView };
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
  },
  inner: { paddingVertical: 11, paddingHorizontal: 20, alignItems: "center" },
  text: { color: "#fff", fontSize: 14, fontWeight: "700", textAlign: "center" },
});
