import { useMutation } from "@apollo/client/react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { REGISTER_PUSH_TOKEN } from "@ctrend/shared/graphql/notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function navigateFromNotification(notification: Notifications.Notification) {
  const data = notification.request.content.data as Record<string, unknown> | undefined;
  if (!data) return;
  const { referenceType, referenceId } = data as { referenceType?: string; referenceId?: string };
  if (!referenceType || !referenceId) return;
  if (referenceType === "POST") {
    router.push(`/post/${referenceId}` as `/${string}`);
  } else if (referenceType === "USER") {
    router.push(`/profile/${referenceId}` as `/${string}`);
  } else if (referenceType === "MESSAGE") {
    router.push(`/chat/${referenceId}` as `/${string}`);
  }
}

export function usePushNotifications(isAuthenticated: boolean) {
  const [registerToken] = useMutation(REGISTER_PUSH_TOKEN);
  const listenerRef = useRef<Notifications.EventSubscription | null>(null);
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null);

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
          name: "Default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#6366f1",
        });
      }

      try {
        const tokenData = await Notifications.getExpoPushTokenAsync();
        await registerToken({
          variables: { token: tokenData.data, platform: Platform.OS },
        });
      } catch {
        // Backend may not support this yet — ignore silently
      }
    }

    void setup();

    // Foreground handler — show system banner (handled by setNotificationHandler)
    listenerRef.current = Notifications.addNotificationReceivedListener(() => {
      // System banner shown automatically
    });

    // Background tap handler — navigate to referenced screen
    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateFromNotification(response.notification);
    });

    return () => {
      cancelled = true;
      listenerRef.current?.remove();
      responseListenerRef.current?.remove();
    };
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps
}
