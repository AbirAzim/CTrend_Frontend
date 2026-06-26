package com.ctrend.app

/**
 * Mirrors React Native `AppState` (active vs background) for native FCM handling.
 * `RunningAppProcessInfo.IMPORTANCE_FOREGROUND` stays true while the RN bridge
 * is alive even after the user leaves the app — that caused CtrendMessagingService
 * to skip background pushes while JS also skipped Notifee → sound only, no tray.
 */
object AppForeground {
  @Volatile
  var isInForeground: Boolean = false
}
