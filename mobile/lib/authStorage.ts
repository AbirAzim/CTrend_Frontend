import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StoredUser } from "@ctrend/shared/types/user";

export type { StoredUser };

export const ACCESS_TOKEN_KEY = "ctrend_access_token";
export const USER_KEY = "ctrend_user";

export async function readStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

export async function readStoredUser(): Promise<StoredUser | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export async function writeSession(
  token: string,
  user: StoredUser,
): Promise<void> {
  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_KEY, token],
    [USER_KEY, JSON.stringify(user)],
  ]);
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, USER_KEY]);
}
