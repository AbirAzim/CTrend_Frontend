import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearSession,
  readStoredToken,
  readStoredUser,
  writeSession,
  type StoredUser,
} from "../lib/authStorage";
import { apolloClient, reconnectWs } from "../lib/apolloClient";

type AuthContextValue = {
  user: StoredUser | null;
  token: string | null;
  isAuthenticated: boolean;
  hydrated: boolean;
  setSession: (token: string, user: StoredUser) => Promise<void>;
  patchUser: (patch: Partial<StoredUser>) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<StoredUser | null>(null);

  // Async hydration — AsyncStorage reads are never synchronous on mobile
  useEffect(() => {
    Promise.all([readStoredToken(), readStoredUser()])
      .then(([t, u]) => {
        setToken(t);
        setUser(u);
      })
      .finally(() => setHydrated(true));
  }, []);

  const setSession = useCallback(async (nextToken: string, nextUser: StoredUser) => {
    await writeSession(nextToken, nextUser);
    reconnectWs();
    void apolloClient.resetStore().catch(() => {});
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    reconnectWs();
    void apolloClient.clearStore();
    setToken(null);
    setUser(null);
  }, []);

  const patchUser = useCallback(async (patch: Partial<StoredUser>) => {
    const [t, u] = await Promise.all([readStoredToken(), readStoredUser()]);
    if (!t || !u) return;
    const next: StoredUser = { ...u, ...patch, id: u.id, email: u.email };
    await writeSession(t, next);
    setUser(next);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      hydrated,
      setSession,
      patchUser,
      logout,
    }),
    [user, token, hydrated, setSession, patchUser, logout],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
