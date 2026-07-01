export type MonthlyPodiumStats = {
  firstPlaceCount: number;
  secondPlaceCount: number;
  thirdPlaceCount: number;
};

const TIERS = [
  { key: "firstPlaceCount" as const, tier: "gold", medal: "🥇", label: "1st" },
  { key: "secondPlaceCount" as const, tier: "silver", medal: "🥈", label: "2nd" },
  { key: "thirdPlaceCount" as const, tier: "bronze", medal: "🥉", label: "3rd" },
];

type Props = {
  stats: MonthlyPodiumStats;
  /** `grid` = equal columns for profile cards; `inline` = compact chips */
  layout?: "grid" | "inline";
  size?: "sm" | "md";
  className?: string;
};

/** Lifetime monthly podium tally — times finished 1st / 2nd / 3rd each month. */
export function MonthlyPodiumBadge({
  stats,
  layout = "inline",
  size = "sm",
  className = "",
}: Props) {
  if (layout === "grid") {
    return (
      <div
        className={`cx-podium-grid${className ? ` ${className}` : ""}`}
        aria-label={`Monthly podiums: ${stats.firstPlaceCount} first, ${stats.secondPlaceCount} second, ${stats.thirdPlaceCount} third`}
      >
        {TIERS.map(({ key, tier, medal, label }) => {
          const count = stats[key];
          return (
            <div
              key={key}
              className={`cx-podium-cell cx-podium-cell--${tier}${count > 0 ? " cx-podium-cell--active" : ""}`}
              title={`Finished ${label} — ${count} ${count === 1 ? "month" : "months"}`}
            >
              <span className="cx-podium-cell-medal" aria-hidden>
                {medal}
              </span>
              <span className="cx-podium-cell-count">{count}</span>
              <span className="cx-podium-cell-label">{label}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={`cx-podium-tally cx-podium-tally--${size}${className ? ` ${className}` : ""}`}
      aria-label={`Monthly podiums: ${stats.firstPlaceCount} first, ${stats.secondPlaceCount} second, ${stats.thirdPlaceCount} third`}
    >
      {TIERS.map(({ key, tier, medal, label }) => {
        const count = stats[key];
        return (
          <span
            key={key}
            className={`cx-podium-chip cx-podium-chip--${tier}${count > 0 ? "" : " cx-podium-chip--zero"}`}
            title={`${label} place — ${count} ${count === 1 ? "month" : "months"}`}
          >
            <span className="cx-podium-chip-medal" aria-hidden>
              {medal}
            </span>
            <span className="cx-podium-chip-count">{count}</span>
          </span>
        );
      })}
    </div>
  );
}
