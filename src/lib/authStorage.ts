export const ACCESS_TOKEN_KEY = "ctrend_access_token";
export const USER_KEY = "ctrend_user";

export type StoredUser = {
  id: string;
  email: string;
  displayName?: string | null;
  username?: string | null;
  bio?: string | null;
};

export function readStoredToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function readStoredUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function writeSession(token: string, user: StoredUser): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
