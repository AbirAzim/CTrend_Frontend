import { useRef } from "react";
import { Animated, Pressable, type PressableProps, type ViewStyle, type StyleProp } from "react-native";

/**
 * Drop-in replacement for <Pressable> that springs a subtle scale-down on press —
 * a small, tactile animation for buttons/icons across the app.
 */
export function PressableScale({
  children,
  scaleTo = 0.9,
  wrapperStyle,
  onPressIn,
  onPressOut,
  ...props
}: PressableProps & { scaleTo?: number; wrapperStyle?: StyleProp<ViewStyle> }) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={[wrapperStyle, { transform: [{ scale }] }]}>
      <Pressable
        {...props}
        onPressIn={(e) => {
          Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 12 }).start();
          onPressOut?.(e);
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
