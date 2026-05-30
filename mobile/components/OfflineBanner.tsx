import NetInfo from "@react-native-community/netinfo";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const slideAnim = useRef(new Animated.Value(-48)).current;

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });
    return unsub;
  }, []);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOffline ? 0 : -48,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}>
      <Text style={styles.text}>📡 No internet connection</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    backgroundColor: "#d97706",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  text: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
