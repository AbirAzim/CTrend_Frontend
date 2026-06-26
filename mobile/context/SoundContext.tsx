import AsyncStorage from "@react-native-async-storage/async-storage";
import { Vibration } from "react-native";
import { useAudioPlayer } from "expo-audio";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
// Distinct generated sound effects (see scripts/generate-sounds.js).
import sBuzzIn from "../assets/sounds/buzz-in.wav";
import sCrowdPop from "../assets/sounds/crowd-pop.wav";
import sSoftPop from "../assets/sounds/soft-pop.wav";
import sCoinPing from "../assets/sounds/coin-ping.wav";
import sSlotTick from "../assets/sounds/slot-tick.wav";
import sThock from "../assets/sounds/thock.wav";
import sWhistleChirp from "../assets/sounds/whistle-chirp.wav";
import sSuccessDuo from "../assets/sounds/success-duo.wav";
import sAscendingChime from "../assets/sounds/ascending-chime.wav";
import sSoftChime from "../assets/sounds/soft-chime.wav";
import sGentleBell from "../assets/sounds/gentle-bell.wav";
import sGentlePing from "../assets/sounds/gentle-ping.wav";
import {
  DEFAULT_MESSAGE_SOUND_ID,
  DEFAULT_NOTIFICATION_SOUND_ID,
  DEFAULT_VOTE_SOUND_ID,
  isMessageSoundId,
  isNotificationSoundId,
  isVoteSoundId,
  type MessageSoundId,
  type NotificationSoundId,
  type SoundCategory,
  type SoundPreferences,
  type VoteSoundId,
} from "../lib/soundPresets";

const SOUND_PREFS_KEY = "ctrend_sound_preferences";

async function readStoredPrefs(): Promise<Partial<SoundPreferences>> {
  try {
    const raw = await AsyncStorage.getItem(SOUND_PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<SoundPreferences>;
  } catch {
    return {};
  }
}

async function writeStoredPrefs(prefs: SoundPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(SOUND_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

// Sound prefs are device-local only (NOT synced to the account) — the same
// account on web vs app keeps independent sound choices to avoid confusion.
function resolvePreferences(fromCache?: Partial<SoundPreferences>): SoundPreferences {
  return {
    voteSoundId:
      (fromCache?.voteSoundId && isVoteSoundId(fromCache.voteSoundId) ? fromCache.voteSoundId : null) ?? DEFAULT_VOTE_SOUND_ID,
    notificationSoundId:
      (fromCache?.notificationSoundId && isNotificationSoundId(fromCache.notificationSoundId) ? fromCache.notificationSoundId : null) ?? DEFAULT_NOTIFICATION_SOUND_ID,
    messageSoundId:
      (fromCache?.messageSoundId && isMessageSoundId(fromCache.messageSoundId) ? fromCache.messageSoundId : null) ?? DEFAULT_MESSAGE_SOUND_ID,
    vibrationEnabled: fromCache?.vibrationEnabled !== false, // default on
  };
}

type SoundCtx = {
  playTick: () => void;
  playNotification: () => void;
  playMessage: () => void;
  previewSound: (id: string) => void;
  vibrate: (pattern?: number | number[]) => void;
  prepareSounds: () => void;
  soundsReady: boolean;
  preferences: SoundPreferences;
  setSoundPreference: (category: SoundCategory, id: VoteSoundId | NotificationSoundId | MessageSoundId) => Promise<void>;
  setVibrationEnabled: (enabled: boolean) => Promise<void>;
  savingPreference: boolean;
};

const SoundContext = createContext<SoundCtx>({
  playTick: () => {},
  playNotification: () => {},
  playMessage: () => {},
  previewSound: () => {},
  vibrate: () => {},
  prepareSounds: () => {},
  soundsReady: false,
  preferences: {
    voteSoundId: DEFAULT_VOTE_SOUND_ID,
    notificationSoundId: DEFAULT_NOTIFICATION_SOUND_ID,
    messageSoundId: DEFAULT_MESSAGE_SOUND_ID,
    vibrationEnabled: true,
  },
  setSoundPreference: async () => {},
  setVibrationEnabled: async () => {},
  savingPreference: false,
});

export function SoundProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<SoundPreferences>({
    voteSoundId: DEFAULT_VOTE_SOUND_ID,
    notificationSoundId: DEFAULT_NOTIFICATION_SOUND_ID,
    messageSoundId: DEFAULT_MESSAGE_SOUND_ID,
    vibrationEnabled: true,
  });
  const [soundsReady, setSoundsReady] = useState(false);
  const savingPreference = false; // prefs are saved instantly on-device

  // One audio player per distinct sound, keyed by preset id.
  const pBuzzIn = useAudioPlayer(sBuzzIn);
  const pCrowdPop = useAudioPlayer(sCrowdPop);
  const pSoftPop = useAudioPlayer(sSoftPop);
  const pCoinPing = useAudioPlayer(sCoinPing);
  const pSlotTick = useAudioPlayer(sSlotTick);
  const pThock = useAudioPlayer(sThock);
  const pWhistleChirp = useAudioPlayer(sWhistleChirp);
  const pSuccessDuo = useAudioPlayer(sSuccessDuo);
  const pAscendingChime = useAudioPlayer(sAscendingChime);
  const pSoftChime = useAudioPlayer(sSoftChime);
  const pGentleBell = useAudioPlayer(sGentleBell);
  const pGentlePing = useAudioPlayer(sGentlePing);

  const players: Record<string, ReturnType<typeof useAudioPlayer>> = {
    "buzz-in": pBuzzIn,
    "crowd-pop": pCrowdPop,
    "soft-pop": pSoftPop,
    "coin-ping": pCoinPing,
    "slot-tick": pSlotTick,
    "thock": pThock,
    "whistle-chirp": pWhistleChirp,
    "success-duo": pSuccessDuo,
    "ascending-chime": pAscendingChime,
    "soft-chime": pSoftChime,
    "gentle-bell": pGentleBell,
    "gentle-ping": pGentlePing,
  };

  function playId(id: string) {
    const p = players[id];
    if (!p) return;
    // Reset to the start (so repeated taps replay) then play.
    const fire = () => {
      try {
        p.seekTo(0).then(() => { try { p.play(); } catch { /* ignore */ } }).catch(() => { try { p.play(); } catch { /* ignore */ } });
      } catch { try { p.play(); } catch { /* ignore */ } }
    };
    fire();
    // If the asset hadn't finished loading, the first call is silent — retry once.
    if (!p.isLoaded) setTimeout(fire, 200);
  }

  // Load device-local prefs from AsyncStorage on mount.
  useEffect(() => {
    let cancelled = false;
    readStoredPrefs().then((cached) => {
      if (cancelled) return;
      setPreferences((prev) => resolvePreferences({ ...prev, ...cached }));
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Prime every player (muted) shortly after launch so the FIRST preview/tap
  // plays instantly — expo-audio players are silent until they've loaded once.
  useEffect(() => {
    const t = setTimeout(() => {
      Object.values(players).forEach((p) => {
        try {
          p.volume = 0;
          p.play();
          setTimeout(() => {
            try { p.pause(); p.seekTo(0).catch(() => {}); p.volume = 1; } catch { /* ignore */ }
          }, 90);
        } catch { /* ignore */ }
      });
      setSoundsReady(true);
    }, 700);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function playTick() {
    if (preferences.voteSoundId === "silent") return;
    playId(preferences.voteSoundId);
  }

  function playNotification() {
    playId(preferences.notificationSoundId);
  }

  function playMessage() {
    playId(preferences.messageSoundId);
  }

  // Preview an arbitrary preset (used by the sound settings screen).
  function previewSound(id: string) {
    playId(id);
  }

  // Vibrate, honoring the device-local preference.
  function vibrate(pattern: number | number[] = 60) {
    if (!preferences.vibrationEnabled) return;
    try { Vibration.vibrate(pattern); } catch { /* ignore */ }
  }

  // Preload/prime all players (muted) so the very first preview plays instantly.
  function prepareSounds() {
    Object.values(players).forEach((p) => {
      try {
        const prevVol = p.volume ?? 1;
        p.volume = 0;
        p.play();
        setTimeout(() => {
          try { p.pause(); p.seekTo(0).catch(() => {}); p.volume = prevVol; } catch { /* ignore */ }
        }, 60);
      } catch { /* ignore */ }
    });
    setSoundsReady(true);
  }

  async function setSoundPreference(
    category: SoundCategory,
    id: VoteSoundId | NotificationSoundId | MessageSoundId,
  ): Promise<void> {
    const field =
      category === "vote" ? "voteSoundId" :
      category === "notification" ? "notificationSoundId" : "messageSoundId";
    const updated: SoundPreferences = { ...preferences, [field]: id } as SoundPreferences;
    setPreferences(updated);
    await writeStoredPrefs(updated); // device-local only
  }

  async function setVibrationEnabled(enabled: boolean): Promise<void> {
    const updated: SoundPreferences = { ...preferences, vibrationEnabled: enabled };
    setPreferences(updated);
    await writeStoredPrefs(updated);
  }

  return (
    <SoundContext.Provider value={{
      playTick,
      playNotification,
      playMessage,
      previewSound,
      vibrate,
      prepareSounds,
      soundsReady,
      preferences,
      setSoundPreference,
      setVibrationEnabled,
      savingPreference,
    }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSounds() {
  return useContext(SoundContext);
}
