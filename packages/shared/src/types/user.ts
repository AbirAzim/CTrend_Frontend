export type StoredUser = {
  id: string;
  email: string;
  displayName?: string | null;
  username?: string | null;
  profileImageUrl?: string | null;
  bio?: string | null;
  role?: string | null;
  roles?: string[] | null;
};
