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
import { apolloClient } from "../lib/apolloClient";

type AuthContextValue = {
  user: StoredUser | null;
  token: string | null;
  isAuthenticated: boolean;
  setSession: (token: string, user: StoredUser) => void;
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
    setState({ token: nextToken, user: nextUser });
  }, []);

  const logout = useCallback(() => {
    clearSession();
    void apolloClient.clearStore();
    setState({ token: null, user: null });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      setSession,
      logout,
    }),
    [user, token, setSession, logout],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
