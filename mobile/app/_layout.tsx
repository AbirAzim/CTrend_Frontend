import { ApolloProvider } from "@apollo/client/react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { apolloClient } from "../lib/apolloClient";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { TabBarProvider } from "../context/TabBarContext";
import { OfflineBanner } from "../components/OfflineBanner";
import { usePushNotifications } from "../hooks/usePushNotifications";

function AppStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

function AppServices() {
  const { isAuthenticated } = useAuth();
  usePushNotifications(isAuthenticated);
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ApolloProvider client={apolloClient}>
        <AuthProvider>
          <ThemeProvider>
            <TabBarProvider>
              <KeyboardProvider>
                <View style={{ flex: 1 }}>
                  <AppServices />
                  <AppStatusBar />
                  <Stack screenOptions={{ headerShown: false }} />
                  <OfflineBanner />
                </View>
              </KeyboardProvider>
            </TabBarProvider>
          </ThemeProvider>
        </AuthProvider>
      </ApolloProvider>
    </SafeAreaProvider>
  );
}
