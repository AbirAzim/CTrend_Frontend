import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@apollo/client";
import { MY_COINS } from "../graphql/coins";
import { useAuth } from "./AuthContext";
import {
  COIN_EARNED_EVENT,
  COIN_SPENT_EVENT,
  type CoinEarnedDetail,
  type CoinSpentDetail,
} from "../lib/coins";

type CoinsContextValue = {
  /** Lifetime balance, or null until loaded. */
  balance: number | null;
  /** Register the top-bar counter element so coins know where to fly. */
  registerCounter: (el: HTMLElement | null) => void;
  /** Re-fetch the authoritative balance from the server. */
  refresh: () => void;
  /** True briefly after the balance increases — drives the counter pop. */
  pulsing: boolean;
  /** True briefly after the balance decreases — drives the "minus" pulse. */
  dropping: boolean;
};

const CoinsContext = createContext<CoinsContextValue | null>(null);

type FlyCoin = {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  delay: number;
};

let flyId = 0;

export function CoinsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [pulsing, setPulsing] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [flyCoins, setFlyCoins] = useState<FlyCoin[]>([]);
  const counterRef = useRef<HTMLElement | null>(null);
  const pulseTimer = useRef<number | null>(null);
  const dropTimer = useRef<number | null>(null);

  const { data, refetch } = useQuery<{ myCoins: number }>(MY_COINS, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-and-network",
  });

  useEffect(() => {
    if (typeof data?.myCoins === "number") setBalance(data.myCoins);
  }, [data?.myCoins]);

  useEffect(() => {
    if (!isAuthenticated) setBalance(null);
  }, [isAuthenticated]);

  const registerCounter = useCallback((el: HTMLElement | null) => {
    counterRef.current = el;
  }, []);

  const refresh = useCallback(() => {
    if (isAuthenticated) void refetch();
  }, [isAuthenticated, refetch]);

  const triggerPulse = useCallback(() => {
    setPulsing(true);
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulsing(false), 700);
  }, []);

  const triggerDrop = useCallback(() => {
    setDropping(true);
    if (dropTimer.current) window.clearTimeout(dropTimer.current);
    dropTimer.current = window.setTimeout(() => setDropping(false), 700);
  }, []);

  // Listen for coin-spent events (un-hype etc.) — decrement with a drop pulse.
  useEffect(() => {
    if (!isAuthenticated) return;
    let reconcile: number | null = null;
    const onSpent = (e: Event) => {
      const detail = (e as CustomEvent<CoinSpentDetail>).detail;
      if (!detail?.amount) return;
      setBalance((b) => Math.max(0, (b ?? 0) - detail.amount));
      triggerDrop();
      if (reconcile) window.clearTimeout(reconcile);
      reconcile = window.setTimeout(() => void refetch(), 2500);
    };
    window.addEventListener(COIN_SPENT_EVENT, onSpent);
    return () => {
      window.removeEventListener(COIN_SPENT_EVENT, onSpent);
      if (reconcile) window.clearTimeout(reconcile);
    };
  }, [isAuthenticated, refetch, triggerDrop]);

  // Listen for coin-earned events dispatched by action handlers.
  useEffect(() => {
    if (!isAuthenticated) return;
    let reconcile: number | null = null;

    const onEarned = (e: Event) => {
      const detail = (e as CustomEvent<CoinEarnedDetail>).detail;
      if (!detail?.amount) return;

      const target = counterRef.current?.getBoundingClientRect();
      const toX = target ? target.left + target.width / 2 : window.innerWidth - 40;
      const toY = target ? target.top + target.height / 2 : 24;

      const count = Math.min(6, Math.max(3, Math.round(detail.amount / 4)));
      const coins: FlyCoin[] = Array.from({ length: count }, (_, i) => ({
        id: flyId++,
        fromX: detail.x + (Math.random() * 28 - 14),
        fromY: detail.y + (Math.random() * 20 - 10),
        toX,
        toY,
        delay: i * 70,
      }));
      setFlyCoins((prev) => [...prev, ...coins]);

      // Bump the displayed balance as the coins land, then reconcile.
      window.setTimeout(() => {
        setBalance((b) => (b ?? 0) + detail.amount);
        triggerPulse();
      }, 620);

      // Clear sprites after the animation completes.
      const maxDelay = coins[coins.length - 1].delay;
      window.setTimeout(() => {
        const ids = new Set(coins.map((c) => c.id));
        setFlyCoins((prev) => prev.filter((c) => !ids.has(c.id)));
      }, maxDelay + 1100);

      // Debounced refetch to align with server truth.
      if (reconcile) window.clearTimeout(reconcile);
      reconcile = window.setTimeout(() => void refetch(), 2500);
    };

    window.addEventListener(COIN_EARNED_EVENT, onEarned);
    return () => {
      window.removeEventListener(COIN_EARNED_EVENT, onEarned);
      if (reconcile) window.clearTimeout(reconcile);
    };
  }, [isAuthenticated, refetch, triggerPulse]);

  return (
    <CoinsContext.Provider
      value={{ balance, registerCounter, refresh, pulsing, dropping }}
    >
      {children}
      {flyCoins.length > 0 &&
        createPortal(
          <div className="cx-coin-fly-layer" aria-hidden>
            {flyCoins.map((c) => (
              <span
                key={c.id}
                className="cx-coin-fly"
                style={
                  {
                    "--fx": `${c.fromX}px`,
                    "--fy": `${c.fromY}px`,
                    "--tx": `${c.toX}px`,
                    "--ty": `${c.toY}px`,
                    animationDelay: `${c.delay}ms`,
                  } as React.CSSProperties
                }
              >
                <span className="cx-coin-fly-face">¢</span>
              </span>
            ))}
          </div>,
          document.body,
        )}
    </CoinsContext.Provider>
  );
}

export function useCoins(): CoinsContextValue {
  const ctx = useContext(CoinsContext);
  if (!ctx) throw new Error("useCoins must be used within CoinsProvider");
  return ctx;
}
