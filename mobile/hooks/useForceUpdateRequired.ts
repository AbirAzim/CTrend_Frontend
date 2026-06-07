import { useQuery } from "@apollo/client/react";
import Constants from "expo-constants";
import { useCallback, useEffect, useMemo } from "react";
import { AppState, Platform } from "react-native";
import { PLATFORM_SETTINGS } from "@ctrend/shared/graphql/admin";
import { BUNDLED_ANDROID_VERSION_CODE } from "@ctrend/shared/lib/appUpdate";

type PlatformSettingsData = {
  platformSettings?: {
    minAndroidVersionCode?: number | null;
  };
};

function getInstalledAndroidVersionCode(): number {
  if (Platform.OS !== "android") return Number.MAX_SAFE_INTEGER;
  const raw = Constants.expoConfig?.android?.versionCode;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : BUNDLED_ANDROID_VERSION_CODE;
}

export function useForceUpdateRequired() {
  const installedVersionCode = getInstalledAndroidVersionCode();

  const { data, refetch, error } = useQuery<PlatformSettingsData>(PLATFORM_SETTINGS, {
    fetchPolicy: "cache-and-network",
    pollInterval: 5 * 60 * 1000,
    errorPolicy: "all",
  });

  const minRequiredVersionCode = useMemo(() => {
    if (error) return 0;
    const fromServer = data?.platformSettings?.minAndroidVersionCode;
    if (typeof fromServer === "number" && fromServer > 0) return fromServer;
    return 0;
  }, [data?.platformSettings?.minAndroidVersionCode, error]);

  const needsUpdate =
    Platform.OS === "android" &&
    minRequiredVersionCode > 0 &&
    installedVersionCode < minRequiredVersionCode;

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return {
    needsUpdate,
    installedVersionCode,
    minRequiredVersionCode,
    refresh,
  };
}
