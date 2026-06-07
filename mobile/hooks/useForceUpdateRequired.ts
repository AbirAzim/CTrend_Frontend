import { useQuery } from "@apollo/client/react";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import { PLATFORM_SETTINGS } from "@ctrend/shared/graphql/admin";
import { getInstalledAndroidVersionCode } from "../lib/androidVersion";
import {
  getForceUpdateFromGraphqlError,
  subscribeForceUpdateFromGraphqlError,
} from "../lib/forceUpdateState";

type PlatformSettingsData = {
  platformSettings?: {
    minAndroidVersionCode?: number | null;
    androidUpdateTitle?: string | null;
    androidUpdateBody?: string | null;
  };
};

function parseVersionCode(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  const parsed = parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 0;
}

export function useForceUpdateRequired() {
  const installedVersionCode = getInstalledAndroidVersionCode();
  const graphqlForced = useSyncExternalStore(
    subscribeForceUpdateFromGraphqlError,
    getForceUpdateFromGraphqlError,
    () => null,
  );

  const { data, refetch } = useQuery<PlatformSettingsData>(PLATFORM_SETTINGS, {
    fetchPolicy: "network-only",
    pollInterval: 30 * 1000,
  });

  const minRequiredVersionCode = useMemo(() => {
    const fromServer = parseVersionCode(data?.platformSettings?.minAndroidVersionCode);
    const fromError = graphqlForced?.minRequiredVersionCode ?? 0;
    return Math.max(fromServer, fromError);
  }, [data?.platformSettings?.minAndroidVersionCode, graphqlForced]);

  const updateTitle = useMemo(() => {
    const fromServer = data?.platformSettings?.androidUpdateTitle?.trim();
    if (fromServer) return fromServer;
    return graphqlForced?.title?.trim() || "Update required";
  }, [data?.platformSettings?.androidUpdateTitle, graphqlForced]);

  const updateBody = useMemo(() => {
    const fromServer = data?.platformSettings?.androidUpdateBody?.trim();
    if (fromServer) return fromServer;
    return (
      graphqlForced?.body?.trim() ||
      "A newer version of Ke Jitbe is available. Please update to continue using the app."
    );
  }, [data?.platformSettings?.androidUpdateBody, graphqlForced]);

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
    updateTitle,
    updateBody,
    refresh,
  };
}

export { getInstalledAndroidVersionCode } from "../lib/androidVersion";
