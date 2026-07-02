import { Ionicons } from "@expo/vector-icons";

type IconProps = { size?: number; color: string };

/** Side-by-side compare slots. */
export function CompareIcon({ size = 16, color }: IconProps) {
  return <Ionicons name="albums-outline" size={size} color={color} />;
}

/** Poll / chart format. */
export function PollIcon({ size = 16, color }: IconProps) {
  return <Ionicons name="stats-chart-outline" size={size} color={color} />;
}

/** Single image / gallery slot. */
export function ImagesIcon({ size = 16, color }: IconProps) {
  return <Ionicons name="image-outline" size={size} color={color} />;
}

/** Vote count / voted tab. */
export function VoteIcon({ size = 16, color }: IconProps) {
  return <Ionicons name="checkbox-outline" size={size} color={color} />;
}

/** Direct message / chat. */
export function MessageIcon({ size = 16, color }: IconProps) {
  return <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />;
}
