import { Redirect, useLocalSearchParams } from "expo-router";

// World Cup is now a tab at /tabs/world-cup. Keep this path as a redirect so any
// existing deep links / notifications to /world-cup still land on the tab.
export default function WorldCupRedirect() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return (
    <Redirect
      href={(tab ? `/tabs/world-cup?tab=${tab}` : "/tabs/world-cup") as `/${string}`}
    />
  );
}
