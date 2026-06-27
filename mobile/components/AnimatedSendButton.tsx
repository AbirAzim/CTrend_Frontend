import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type Props = {
  canSend: boolean;
  sending: boolean;
  onSend: () => void;
  accentColor: string;
  disabledColor: string;
  mutedColor: string;
  style?: StyleProp<ViewStyle>;
};

const SIZE = 44;

export function AnimatedSendButton({
  canSend,
  sending,
  onSend,
  accentColor,
  disabledColor,
  mutedColor,
  style,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const iconSlide = useRef(new Animated.Value(canSend ? 0 : 6)).current;
  const glow = useRef(new Animated.Value(canSend ? 1 : 0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(iconSlide, {
        toValue: canSend ? 0 : 6,
        useNativeDriver: true,
        friction: 7,
        tension: 140,
      }),
      Animated.timing(glow, {
        toValue: canSend ? 1 : 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [canSend, glow, iconSlide]);

  useEffect(() => {
    if (sending) {
      spin.setValue(0);
      spinLoop.current = Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      spinLoop.current.start();
    } else {
      spinLoop.current?.stop();
      spin.setValue(0);
    }
    return () => spinLoop.current?.stop();
  }, [sending, spin]);

  const bgColor = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [disabledColor, accentColor],
  });

  const ringScale = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.12],
  });

  const ringOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.4],
  });

  const spinDeg = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  function pressIn() {
    if (!canSend || sending) return;
    Animated.spring(scale, {
      toValue: 0.9,
      useNativeDriver: true,
      friction: 6,
      tension: 240,
    }).start();
  }

  function pressOut() {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 5,
      tension: 180,
    }).start();
  }

  function handlePress() {
    if (!canSend || sending) return;
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.84,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 4,
        tension: 220,
      }),
    ]).start();
    onSend();
  }

  const disabled = !canSend || sending;

  return (
    <Pressable
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={handlePress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Send message"
      accessibilityState={{ disabled }}
    >
      <Animated.View
        style={[
          st.wrap,
          canSend && !sending ? st.wrapActive : null,
          { transform: [{ scale }] },
          canSend && !sending ? { shadowColor: accentColor } : null,
          style,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            st.ring,
            {
              borderColor: accentColor,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
        <Animated.View style={[st.btn, { backgroundColor: bgColor }]}>
          {sending ? (
            <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
              <ActivityIndicator size="small" color="#fff" />
            </Animated.View>
          ) : (
            <Animated.View style={{ transform: [{ translateY: iconSlide }] }}>
              <Ionicons
                name="send"
                size={20}
                color={canSend ? "#fff" : mutedColor}
                style={st.sendIcon}
              />
            </Animated.View>
          )}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  wrapActive: {
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
    }),
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: SIZE / 2,
    borderWidth: 2,
  },
  btn: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sendIcon: {
    marginLeft: 2,
    marginTop: -1,
  },
});
