/**
 * Coins / gamification shared constants (platform-agnostic).
 *
 * The coin amounts mirror the backend `COIN_AMOUNTS` map. Award/spend
 * dispatching is platform-specific (web uses window events, mobile uses a
 * context emitter), so it lives in each app, not here.
 */

/** Coin amounts — must mirror the backend `COIN_AMOUNTS` map. */
export const COIN_AMOUNTS = {
  HYPE: 5,
  VOTE: 10,
  PREDICTION: 15,
  POST: 20,
  COMMENT: 1,
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
