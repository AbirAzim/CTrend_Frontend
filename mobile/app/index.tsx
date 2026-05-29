import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../context/AuthContext";

export default function Index() {
  const { hydrated } = useAuth();

  if (!hydrated) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#312e81" />
      </View>
    );
  }

  // Always go to tabs — feed is public, individual screens guard their own auth
  return <Redirect href="/tabs" />;
}
