import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery } from "@apollo/client/react";
import { useAudioPlayer } from "expo-audio";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import tickWav from "../assets/vote-tick.wav";
import notifWav from "../assets/notification.wav";
import { ME, UPDATE_PROFILE } from "@ctrend/shared/graphql/profile";
import { useAuth } from "./AuthContext";
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

function resolvePreferences(
  fromServer?: { voteSoundId?: string | null; notificationSoundId?: string | null; messageSoundId?: string | null } | null,
  fromCache?: Partial<SoundPreferences>,
): SoundPreferences {
  return {
    voteSoundId:
      (fromServer?.voteSoundId && isVoteSoundId(fromServer.voteSoundId) ? fromServer.voteSoundId : null) ??
      (fromCache?.voteSoundId && isVoteSoundId(fromCache.voteSoundId) ? fromCache.voteSoundId : null) ??
      DEFAULT_VOTE_SOUND_ID,
    notificationSoundId:
      (fromServer?.notificationSoundId && isNotificationSoundId(fromServer.notificationSoundId) ? fromServer.notificationSoundId : null) ??
      (fromCache?.notificationSoundId && isNotificationSoundId(fromCache.notificationSoundId) ? fromCache.notificationSoundId : null) ??
      DEFAULT_NOTIFICATION_SOUND_ID,
    messageSoundId:
      (fromServer?.messageSoundId && isMessageSoundId(fromServer.messageSoundId) ? fromServer.messageSoundId : null) ??
      (fromCache?.messageSoundId && isMessageSoundId(fromCache.messageSoundId) ? fromCache.messageSoundId : null) ??
      DEFAULT_MESSAGE_SOUND_ID,
  };
}

type SoundCtx = {
  playTick: () => void;
  playNotification: () => void;
  playMessage: () => void;
  previewVoteSound: () => void;
  previewNotificationSound: () => void;
  previewMessageSound: () => void;
  preferences: SoundPreferences;
  setSoundPreference: (category: SoundCategory, id: VoteSoundId | NotificationSoundId | MessageSoundId) => Promise<void>;
  savingPreference: boolean;
};

const SoundContext = createContext<SoundCtx>({
  playTick: () => {},
  playNotification: () => {},
  playMessage: () => {},
  previewVoteSound: () => {},
  previewNotificationSound: () => {},
  previewMessageSound: () => {},
  preferences: {
    voteSoundId: DEFAULT_VOTE_SOUND_ID,
    notificationSoundId: DEFAULT_NOTIFICATION_SOUND_ID,
    messageSoundId: DEFAULT_MESSAGE_SOUND_ID,
  },
  setSoundPreference: async () => {},
  savingPreference: false,
});

type MeSoundData = {
  me: {
    voteSoundId?: string | null;
    notificationSoundId?: string | null;
    messageSoundId?: string | null;
  };
};

export function SoundProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [preferences, setPreferences] = useState<SoundPreferences>({
    voteSoundId: DEFAULT_VOTE_SOUND_ID,
    notificationSoundId: DEFAULT_NOTIFICATION_SOUND_ID,
    messageSoundId: DEFAULT_MESSAGE_SOUND_ID,
  });
  const [savingPreference, setSavingPreference] = useState(false);

  const tickPlayer = useAudioPlayer(tickWav);
  const notifPlayer = useAudioPlayer(notifWav);

  const { data: meData } = useQuery<MeSoundData>(ME, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-and-network",
  });

  const [updateProfile] = useMutation(UPDATE_PROFILE);

  // Load from AsyncStorage on mount, then merge with server data
  useEffect(() => {
    let cancelled = false;
    readStoredPrefs().then((cached) => {
      if (cancelled) return;
      setPreferences((prev) => resolvePreferences(null, { ...prev, ...cached }));
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync when ME query resolves
  useEffect(() => {
    if (!meData?.me) return;
    setPreferences((prev) => {
      const merged = resolvePreferences(meData.me, prev);
      void writeStoredPrefs(merged);
      return merged;
    });
  }, [meData?.me]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prime players shortly after mount
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        tickPlayer.play();
        notifPlayer.play();
        setTimeout(() => {
          try {
            tickPlayer.pause();
            tickPlayer.seekTo(0).catch(() => {});
            notifPlayer.pause();
            notifPlayer.seekTo(0).catch(() => {});
          } catch { /* ignore */ }
        }, 120);
      } catch { /* ignore */ }
    }, 600);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function playTick() {
    try { tickPlayer.play(); } catch { /* ignore */ }
    setTimeout(() => tickPlayer.seekTo(0).catch(() => {}), 220);
  }

  function playNotification() {
    try { notifPlayer.play(); } catch { /* ignore */ }
    setTimeout(() => notifPlayer.seekTo(0).catch(() => {}), 2500);
  }

  function playMessage() {
    try { notifPlayer.play(); } catch { /* ignore */ }
    setTimeout(() => notifPlayer.seekTo(0).catch(() => {}), 2500);
  }

  function previewVoteSound() {
    try { tickPlayer.seekTo(0).catch(() => {}); tickPlayer.play(); } catch { /* ignore */ }
    setTimeout(() => tickPlayer.seekTo(0).catch(() => {}), 300);
  }

  function previewNotificationSound() {
    try { notifPlayer.seekTo(0).catch(() => {}); notifPlayer.play(); } catch { /* ignore */ }
    setTimeout(() => notifPlayer.seekTo(0).catch(() => {}), 3000);
  }

  function previewMessageSound() {
    try { notifPlayer.seekTo(0).catch(() => {}); notifPlayer.play(); } catch { /* ignore */ }
    setTimeout(() => notifPlayer.seekTo(0).catch(() => {}), 3000);
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
    await writeStoredPrefs(updated);

    if (!isAuthenticated) return;
    setSavingPreference(true);
    try {
      await updateProfile({ variables: { input: { [field]: id } } });
    } catch {
      // ignore — preference is already saved locally
    } finally {
      setSavingPreference(false);
    }
  }

  return (
    <SoundContext.Provider value={{
      playTick,
      playNotification,
      playMessage,
      previewVoteSound,
      previewNotificationSound,
      previewMessageSound,
      preferences,
      setSoundPreference,
      savingPreference,
    }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSounds() {
  return useContext(SoundContext);
}
