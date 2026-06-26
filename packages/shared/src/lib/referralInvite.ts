import { COIN_AMOUNTS } from "./coins";

/** 1 referral point = 1 BDT when withdrawing. */
export const POINTS_BDT_RATE = 1;

export function pointsToBdt(points: number): number {
  return Math.max(0, points) * POINTS_BDT_RATE;
}

export function formatPointsBdt(points: number): string {
  return `৳${pointsToBdt(points).toLocaleString()}`;
}

/** Short subtitle under the invite modal title. */
export const INVITE_MODAL_SUBTITLE =
  "Earn referral points you can withdraw as cash — invite friends or redeem a code from your profile.";

/** Body copy explaining how invite + redeem + withdrawal work. */
export function inviteModalDescription(): string {
  return `Send an invite and we email your friend a personal referral code. When they sign up, you earn +${COIN_AMOUNTS.INVITE} referral points and they get +${COIN_AMOUNTS.REFERRAL_INVITEE}. Redeem codes from your profile anytime. Withdraw your points as money — 10 points = 10 BDT.`;
}

export const INVITE_MODAL_TIPS = [
  `+${COIN_AMOUNTS.INVITE} points for you when a friend joins`,
  `+${COIN_AMOUNTS.REFERRAL_INVITEE} points for your friend`,
  "10 points = 10 BDT when you withdraw",
  "Redeem referral codes from your profile",
] as const;
