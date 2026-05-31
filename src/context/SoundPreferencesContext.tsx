import { useMutation, useQuery } from "@apollo/client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ME, UPDATE_PROFILE } from "../graphql/profile";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import {
  applySoundPreferences,
  isMessageSoundId,
  isNotificationSoundId,
  isVoteSoundId,
  syncSoundPreferences,
  type MessageSoundId,
  type NotificationSoundId,
  type SoundCategory,
  type SoundPreferences,
  type VoteSoundId,
} from "../lib/notificationSound";
import { writeCachedSoundPreferences } from "../lib/soundPreferencesStorage";
import { useAuth } from "./AuthContext";

type MeSoundFields = {
  voteSoundId?: string | null;
  notificationSoundId?: string | null;
  messageSoundId?: string | null;
};

type SoundPreferencesContextValue = {
  preferences: SoundPreferences;
  loading: boolean;
  saving: boolean;
  error: string | null;
  setSoundPreference: (
    category: SoundCategory,
    id: VoteSoundId | NotificationSoundId | MessageSoundId,
  ) => Promise<void>;
};

const SoundPreferencesContext = createContext<SoundPreferencesContextValue | null>(null);

function fieldForCategory(category: SoundCategory): keyof SoundPreferences {
  if (category === "vote") return "voteSoundId";
  if (category === "notification") return "notificationSoundId";
  return "messageSoundId";
}

export function SoundPreferencesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [preferences, setPreferences] = useState<SoundPreferences>(() =>
    syncSoundPreferences(null),
  );
  const [error, setError] = useState<string | null>(null);

  const { data, loading } = useQuery<{ me: MeSoundFields }>(ME, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-and-network",
  });

  const [updateProfile, { loading: saving }] = useMutation(UPDATE_PROFILE);

  useEffect(() => {
    if (!data?.me) return;
    const synced = syncSoundPreferences(data.me);
    setPreferences(synced);
  }, [data?.me]);

  const setSoundPreference = useCallback(
    async (
      category: SoundCategory,
      id: VoteSoundId | NotificationSoundId | MessageSoundId,
    ) => {
      setError(null);
      const field = fieldForCategory(category);
      const optimistic: SoundPreferences = {
        ...preferences,
        [field]: id,
      } as SoundPreferences;
      applySoundPreferences(optimistic);
      writeCachedSoundPreferences(optimistic);
      setPreferences(optimistic);

      if (!isAuthenticated) return;

      try {
        const input: Record<string, string> = { [field]: id };
        const { data: result } = await updateProfile({ variables: { input } });
        const me = result?.updateProfile as MeSoundFields | undefined;
        if (me) {
          const synced = syncSoundPreferences({ ...preferences, ...me });
          setPreferences(synced);
        }
      } catch (err) {
        setError(getApolloErrorMessage(err));
      }
    },
    [isAuthenticated, preferences, updateProfile],
  );

  const value = useMemo(
    () => ({
      preferences,
      loading,
      saving,
      error,
      setSoundPreference,
    }),
    [preferences, loading, saving, error, setSoundPreference],
  );

  return (
    <SoundPreferencesContext.Provider value={value}>
      {children}
    </SoundPreferencesContext.Provider>
  );
}

export function useSoundPreferences(): SoundPreferencesContextValue {
  const ctx = useContext(SoundPreferencesContext);
  if (!ctx) {
    throw new Error("useSoundPreferences must be used within SoundPreferencesProvider");
  }
  return ctx;
}

export function isSoundIdForCategory(
  category: SoundCategory,
  id: string,
): id is VoteSoundId | NotificationSoundId | MessageSoundId {
  if (category === "vote") return isVoteSoundId(id);
  if (category === "notification") return isNotificationSoundId(id);
  return isMessageSoundId(id);
}
