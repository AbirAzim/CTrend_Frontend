import { useMutation } from "@apollo/client/react";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";
import { REGISTER_PUSH_TOKEN } from "@ctrend/shared/graphql/notifications";

// Show system banner/sound/badge for push notifications arriving while app is open.
// Chat messages are excluded: while the app is open they are rendered by Notifee
// (with Reply/👍 Like) via the GraphQL subscription, so showing the raw FCM copy
// here would be a duplicate notification.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as
      | { type?: string; conversationId?: string; referenceType?: string }
      | undefined;
    const isChatMessage =
      data?.type === "MESSAGE" ||
      !!data?.conversationId ||
      (data?.referenceType ?? "").toUpperCase() === "CONVERSATION";
    if (isChatMessage) {
      return {
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: true,
      };
    }
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    };
  },
});

async function getPushToken(): Promise<{ token: string; type: "expo" | "device" } | null> {
  try {
    const projectId =
      (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.eas?.projectId as string | undefined ??
      Constants.easConfig?.projectId;
    if (projectId) {
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      return { token: tokenData.data, type: "expo" };
    }
  } catch { /* no project ID */ }

  try {
    const tokenData = await Notifications.getDevicePushTokenAsync();
    return { token: tokenData.data as string, type: "device" };
  } catch {
    return null;
  }
}

export function usePushNotifications(isAuthenticated: boolean) {
  const [registerToken] = useMutation(REGISTER_PUSH_TOKEN);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    async function setup() {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted" || cancelled) return;

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Ke Jitbe",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#6366f1",
          // Omit `sound` to use the system default tone. Passing "default" makes
          // expo-notifications look for a custom raw resource named "default"
          // (which doesn't exist) → "custom sound default not found" warning.
          showBadge: true,
        });
      }

      const result = await getPushToken();
      if (result && !cancelled) {
        try {
          await registerToken({ variables: { token: result.token, platform: Platform.OS } });
        } catch { /* ignore */ }
      }
    }

    void setup();
    return () => { cancelled = true; };
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps
}
