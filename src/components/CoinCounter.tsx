import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCoins } from "../context/CoinsContext";

/** Compact coin balance shown in the top bar. Doubles as the fly-animation
 * target and links to the coins hub (history + leaderboard). */
export function CoinCounter() {
  const { balance, registerCounter, pulsing, dropping } = useCoins();
  const navigate = useNavigate();
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    registerCounter(ref.current);
    return () => registerCounter(null);
  }, [registerCounter]);

  return (
    <button
      ref={ref}
      type="button"
      className={`cx-coin-counter${pulsing ? " cx-coin-counter--pulse" : ""}${dropping ? " cx-coin-counter--drop" : ""}`}
      onClick={() => navigate("/coins")}
      aria-label={`${balance ?? 0} coins — view coin history and leaderboard`}
      title="Your coins"
    >
      <span className="cx-coin-counter-icon" aria-hidden>
        ¢
      </span>
      <span className="cx-coin-counter-value">{balance ?? 0}</span>
    </button>
  );
}
