import { useQuery } from "@apollo/client/react";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { useCallback, useEffect, useMemo } from "react";
import { AppState, Platform } from "react-native";
import { PLATFORM_SETTINGS } from "@ctrend/shared/graphql/admin";

type PlatformSettingsData = {
  platformSettings?: {
    minAndroidVersionCode?: number | null;
  };
};

/**
 * Read the real Android versionCode baked into the installed APK/AAB.
 * Do NOT fall back to bundled JS constants — that would lie about the version
 * and skip the force-update gate on older installs.
 */
function getInstalledAndroidVersionCode(): number {
  if (Platform.OS !== "android") return Number.MAX_SAFE_INTEGER;

  const nativeBuild = Application.nativeBuildVersion;
  if (nativeBuild) {
    const parsed = parseInt(String(nativeBuild), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const fromExpo = Constants.expoConfig?.android?.versionCode;
  if (typeof fromExpo === "number" && Number.isFinite(fromExpo) && fromExpo > 0) {
    return fromExpo;
  }
  const parsedExpo = parseInt(String(fromExpo ?? ""), 10);
  if (Number.isFinite(parsedExpo) && parsedExpo > 0) return parsedExpo;

  return 0;
}

export function useForceUpdateRequired() {
  const installedVersionCode = getInstalledAndroidVersionCode();

  const { data, refetch } = useQuery<PlatformSettingsData>(PLATFORM_SETTINGS, {
    fetchPolicy: "network-only",
    pollInterval: 60 * 1000,
  });

  const minRequiredVersionCode = useMemo(() => {
    const fromServer = data?.platformSettings?.minAndroidVersionCode;
    if (typeof fromServer === "number" && fromServer > 0) return fromServer;
    return 0;
  }, [data?.platformSettings?.minAndroidVersionCode]);

  const needsUpdate =
    Platform.OS === "android" &&
    minRequiredVersionCode > 0 &&
    installedVersionCode > 0 &&
    installedVersionCode < minRequiredVersionCode;

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    void refetch();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh, refetch]);

  return {
    needsUpdate,
    installedVersionCode,
    minRequiredVersionCode,
    refresh,
  };
}
