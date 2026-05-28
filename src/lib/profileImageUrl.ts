export function normalizeProfileImageUrl(
  input: string | null | undefined,
): string | null {
  const raw = input?.trim();
  if (!raw) return null;

  if (raw.startsWith("//")) {
    return `https:${raw}`;
  }

  if (raw.startsWith("http://")) {
    return `https://${raw.slice("http://".length)}`;
  }

  return raw;
}

