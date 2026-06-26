import { useLocalSearchParams } from "expo-router";
import { PointsHub } from "../../components/PointsHub";

/** Public referral-point history for another user. */
export default function UserPointsScreen() {
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  return <PointsHub userId={userId} />;
}
