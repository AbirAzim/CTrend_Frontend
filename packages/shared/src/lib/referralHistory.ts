import { COIN_META, type CoinType } from "./coins";

/** Human-readable referral history row — includes the other party when known. */
export function referralHistoryLabel(
  type: string,
  relatedUserName?: string | null,
): string {
  const name = relatedUserName?.trim();
  if (name) {
    if (type === "INVITE") return `${name} joined via your invite`;
    if (type === "REFERRAL_INVITEE") return `Joined with ${name}'s invite code`;
  }
  return COIN_META[type as CoinType]?.label ?? type;
}
