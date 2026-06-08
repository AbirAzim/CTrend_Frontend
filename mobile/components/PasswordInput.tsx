import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

type Props = Omit<TextInputProps, "secureTextEntry">;

/**
 * Password TextInput with a show/hide eye toggle. Spreads all TextInput props;
 * `secureTextEntry` is controlled internally. Pass the same `style` you'd give a
 * normal input — the component adds right padding to make room for the icon.
 */
export function PasswordInput({ style, ...props }: Props) {
  const { colors } = useTheme();
  const [show, setShow] = useState(false);
  return (
    <View style={styles.wrap}>
      <TextInput
        {...props}
        secureTextEntry={!show}
        style={[style, styles.input]}
      />
      <Pressable
        style={styles.toggle}
        onPress={() => setShow((s) => !s)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={show ? "Hide password" : "Show password"}
      >
        <Ionicons
          name={show ? "eye-off-outline" : "eye-outline"}
          size={20}
          color={colors.muted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", justifyContent: "center" },
  input: { paddingRight: 46 },
  toggle: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
});
