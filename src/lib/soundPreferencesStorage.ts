export const SOUND_PREFS_CACHE_KEY = "ctrend_sound_preferences";

export type CachedSoundPreferences = {
  voteSoundId?: string | null;
  notificationSoundId?: string | null;
  messageSoundId?: string | null;
};

export function readCachedSoundPreferences(): CachedSoundPreferences {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(SOUND_PREFS_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CachedSoundPreferences;
  } catch {
    return {};
  }
}

export function writeCachedSoundPreferences(prefs: CachedSoundPreferences): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SOUND_PREFS_CACHE_KEY, JSON.stringify(prefs));
}
