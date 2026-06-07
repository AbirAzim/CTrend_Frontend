import { router } from "expo-router";
import { useCallback, useEffect } from "react";
import { BackHandler } from "react-native";

/**
 * Back navigation for screens that can be opened directly from a push
 * notification (post, chat, profile, notifications). On a cold start there's
 * nothing in the stack to pop, so a normal back would get stuck or exit the
 * app — instead we fall back to the feed.
 *
 * Returns a `goBack` handler for the on-screen back button, and registers an
 * Android hardware/gesture back listener that applies the same rule.
 */
export function useBackToFeed(): () => void {
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/tabs");
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (router.canGoBack()) return false; // let the navigator pop normally
      router.replace("/tabs");
      return true; // handled — don't exit the app
    });
    return () => sub.remove();
  }, []);

  return goBack;
}
