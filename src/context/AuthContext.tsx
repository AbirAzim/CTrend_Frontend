import {
  createContext,
  useCallback,
  useContext,
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
  setSession: (token: string, user: StoredUser) => void;
  /** Merge fields into the stored user (after profile update or `me` refresh). */
  patchUser: (patch: Partial<StoredUser>) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function hydrate(): { token: string | null; user: StoredUser | null } {
  return { token: readStoredToken(), user: readStoredUser() };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [{ token, user }, setState] = useState(hydrate);

  const setSession = useCallback((nextToken: string, nextUser: StoredUser) => {
    writeSession(nextToken, nextUser);
    // Reconnect WS first so the new connection picks up the token in
    // connectionParams, then reset the Apollo store.
    reconnectWs();
    void apolloClient.resetStore().catch(() => {/* ignore reset errors */});
    setState({ token: nextToken, user: nextUser });
  }, []);

  const logout = useCallback(() => {
    clearSession();
    reconnectWs();
    void apolloClient.clearStore();
    setState({ token: null, user: null });
  }, []);

  const patchUser = useCallback((patch: Partial<StoredUser>) => {
    const t = readStoredToken();
    const u = readStoredUser();
    if (!t || !u) {
      return;
    }
    const next: StoredUser = { ...u, ...patch, id: u.id, email: u.email };
    writeSession(t, next);
    setState({ token: t, user: next });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      setSession,
      patchUser,
      logout,
    }),
    [user, token, setSession, patchUser, logout],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
