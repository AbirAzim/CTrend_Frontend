import { useLocalSearchParams } from "expo-router";
import { CoinsHub } from "../../components/CoinsHub";

/** Public coin history for another user. */
export default function UserCoinsScreen() {
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  return <CoinsHub userId={userId} />;
}
