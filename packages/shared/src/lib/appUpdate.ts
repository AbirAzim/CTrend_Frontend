/** Google Play listing for Ke Jitbe (com.ctrend.app). */
export const ANDROID_PACKAGE_ID = "com.ctrend.app";

/** Public Play Store listing (production). */
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.ctrend.app";

/** Closed testing opt-in / update page. */
export const PLAY_STORE_CLOSED_TESTING_URL =
  "https://play.google.com/apps/testing/com.ctrend.app";

/**
 * Bundled Android versionCode from the last app release build.
 * Keep in sync with mobile/app.json and android/app/build.gradle on every Play upload.
 * Server `platformSettings.minAndroidVersionCode` overrides this when set (> 0).
 */
export const BUNDLED_ANDROID_VERSION_CODE = 11;
