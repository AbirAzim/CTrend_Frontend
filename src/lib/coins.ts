/**
 * Coins / gamification shared helpers.
 *
 * Coin awards happen server-side; the client mirrors them optimistically and
 * plays a "coin fly" animation from the action's screen position up to the
 * counter in the top bar. Action handlers dispatch `dispatchCoinEarned(...)`;
 * the CoinsProvider listens, animates, and reconciles the balance with the
 * server.
 */

/** Coin amounts — must mirror the backend `COIN_AMOUNTS` map. */
export const COIN_AMOUNTS = {
  HYPE: 5,
  VOTE: 10,
  PREDICTION: 15,
  POST: 20,
  COMMENT: 3,
  POST_HYPED: 2,
  POST_VOTED: 2,
  PREDICTION_CORRECT: 25,
  CAMPAIGN_WINNER: 25,
  VOTE_WINNER: 15,
  DAILY_STREAK: 5,
  INVITE: 10,
  REFERRAL_INVITEE: 5,
} as const;

export type CoinType = keyof typeof COIN_AMOUNTS;

/** Human-friendly label + emoji icon for each coin event (history / tooltips). */
export const COIN_META: Record<CoinType, { label: string; icon: string }> = {
  HYPE: { label: "Hyped a post", icon: "🔥" },
  VOTE: { label: "Voted", icon: "🗳️" },
  PREDICTION: { label: "Made a prediction", icon: "🎯" },
  POST: { label: "Created a post", icon: "✨" },
  COMMENT: { label: "Commented", icon: "💬" },
  POST_HYPED: { label: "Your post got hyped", icon: "🔥" },
  POST_VOTED: { label: "Your post got a vote", icon: "🗳️" },
  PREDICTION_CORRECT: { label: "Nailed a prediction", icon: "🏆" },
  CAMPAIGN_WINNER: { label: "Won a campaign", icon: "👑" },
  VOTE_WINNER: { label: "Won a vote draw", icon: "🎁" },
  DAILY_STREAK: { label: "Daily streak bonus", icon: "📅" },
  INVITE: { label: "Friend joined via your invite", icon: "🤝" },
  REFERRAL_INVITEE: { label: "Joined with a referral code", icon: "🎟️" },
};

export const COIN_EARNED_EVENT = "ctrend:coin-earned";
export const COIN_SPENT_EVENT = "ctrend:coin-spent";

export type CoinEarnedDetail = {
  amount: number;
  /** Screen coordinates the coins should fly from. */
  x: number;
  y: number;
};

export type CoinSpentDetail = {
  amount: number;
};

/** Resolve a screen point from a click event or DOM element (center). */
export function pointFromEvent(
  source:
    | { clientX: number; clientY: number }
    | Element
    | null
    | undefined,
): { x: number; y: number } {
  if (!source) {
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }
  if ("clientX" in source && typeof source.clientX === "number") {
    return { x: source.clientX, y: source.clientY };
  }
  const rect = (source as Element).getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Fire the coin-earned animation. Pass the amount and either a click event or
 * the originating element so the coins fly from the right place.
 */
export function dispatchCoinEarned(
  amount: number,
  source?:
    | { clientX: number; clientY: number }
    | Element
    | null,
): void {
  if (!amount) return;
  const { x, y } = pointFromEvent(source);
  window.dispatchEvent(
    new CustomEvent<CoinEarnedDetail>(COIN_EARNED_EVENT, {
      detail: { amount, x, y },
    }),
  );
}

/**
 * Reverse a reward in the UI (e.g. un-hyping). Decrements the counter with a
 * downward pulse; no fly animation.
 */
export function dispatchCoinSpent(amount: number): void {
  if (!amount) return;
  window.dispatchEvent(
    new CustomEvent<CoinSpentDetail>(COIN_SPENT_EVENT, {
      detail: { amount },
    }),
  );
}
