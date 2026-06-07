import * as Application from "expo-application";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { BUNDLED_ANDROID_VERSION_CODE } from "@ctrend/shared/lib/appUpdate";

function parseVersionCode(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  const parsed = parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 0;
}

/** Real Android versionCode from the installed APK (PackageManager is source of truth). */
export function getInstalledAndroidVersionCode(): number {
  if (Platform.OS !== "android") return Number.MAX_SAFE_INTEGER;

  const fromNative = parseVersionCode(Application.nativeBuildVersion);
  if (fromNative > 0) return fromNative;

  const fromExpo = parseVersionCode(Constants.expoConfig?.android?.versionCode);
  if (fromExpo > 0) return fromExpo;

  if (BUNDLED_ANDROID_VERSION_CODE > 0) return BUNDLED_ANDROID_VERSION_CODE;

  return 0;
}

export function getAndroidClientHeaders(): Record<string, string> {
  if (Platform.OS !== "android") return {};
  const code = getInstalledAndroidVersionCode();
  return {
    "X-App-Platform": "android",
    ...(code > 0 ? { "X-Android-Version-Code": String(code) } : {}),
  };
}
