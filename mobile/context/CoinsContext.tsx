import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { useQuery } from "@apollo/client/react";
import { MY_COINS } from "@ctrend/shared/graphql/coins";
import { useAuth } from "./AuthContext";

type XY = { x: number; y: number };

type CoinsContextValue = {
  /** Lifetime balance, or null until loaded. */
  balance: number | null;
  /** Earn coins: bump the balance + fly animation from `origin` to the counter. */
  awardCoins: (amount: number, origin?: XY | null) => void;
  /** Spend/reverse coins (un-hype): decrement the balance with a drop pulse. */
  spendCoins: (amount: number) => void;
  /** Re-fetch the authoritative balance from the server. */
  refresh: () => void;
  /** Counter registers its View so coins know where to fly. */
  registerCounter: (node: View | null) => void;
  /** Animated scale the counter binds to (bump on earn, dip on spend). */
  counterAnim: Animated.Value;
};

const CoinsContext = createContext<CoinsContextValue | null>(null);

type FlySprite = {
  id: number;
  pos: Animated.ValueXY;
  rotate: Animated.Value;
  opacity: Animated.Value;
};

let spriteId = 0;
const { width: SCREEN_W } = Dimensions.get("window");

export function CoinsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [sprites, setSprites] = useState<FlySprite[]>([]);
  const counterRef = useRef<View | null>(null);
  const counterAnim = useRef(new Animated.Value(1)).current;
  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const registerCounter = useCallback((node: View | null) => {
    counterRef.current = node;
  }, []);

  const refresh = useCallback(() => {
    if (isAuthenticated) void refetch();
  }, [isAuthenticated, refetch]);

  const scheduleReconcile = useCallback(() => {
    if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
    reconcileTimer.current = setTimeout(() => void refetch(), 2500);
  }, [refetch]);

  const bumpCounter = useCallback(
    (kind: "up" | "down") => {
      const peak = kind === "up" ? 1.25 : 0.82;
      Animated.sequence([
        Animated.timing(counterAnim, {
          toValue: peak,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(counterAnim, {
          toValue: 1,
          friction: 4,
          tension: 120,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [counterAnim],
  );

  const spawnFly = useCallback((origin: XY, target: XY, amount: number) => {
    const count = Math.min(6, Math.max(3, Math.round(amount / 4)));
    const made: FlySprite[] = [];
    for (let i = 0; i < count; i++) {
      const sprite: FlySprite = {
        id: spriteId++,
        pos: new Animated.ValueXY({
          x: origin.x - 13 + (Math.random() * 24 - 12),
          y: origin.y - 13 + (Math.random() * 18 - 9),
        }),
        rotate: new Animated.Value(0),
        opacity: new Animated.Value(0),
      };
      made.push(sprite);
    }
    setSprites((prev) => [...prev, ...made]);

    made.forEach((sprite, i) => {
      const delay = i * 60;
      Animated.parallel([
        Animated.sequence([
          Animated.timing(sprite.opacity, {
            toValue: 1,
            duration: 120,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(sprite.opacity, {
            toValue: 0,
            duration: 220,
            delay: 360,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(sprite.pos, {
          toValue: { x: target.x - 13, y: target.y - 13 },
          duration: 720,
          delay,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.loop(
          Animated.timing(sprite.rotate, {
            toValue: 1,
            duration: 420,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ),
      ]).start();
    });

    // Remove sprites after the animation completes.
    const total = (count - 1) * 60 + 720 + 120;
    setTimeout(() => {
      const ids = new Set(made.map((s) => s.id));
      setSprites((prev) => prev.filter((s) => !ids.has(s.id)));
    }, total + 60);
  }, []);

  const awardCoins = useCallback(
    (amount: number, origin?: XY | null) => {
      if (!amount || !isAuthenticated) return;
      Vibration.vibrate(8);
      const from: XY = origin ?? {
        x: SCREEN_W / 2,
        y: Dimensions.get("window").height - 120,
      };
      const fire = (target: XY) => {
        spawnFly(from, target, amount);
        setTimeout(() => {
          setBalance((b) => (b ?? 0) + amount);
          bumpCounter("up");
        }, 520);
        scheduleReconcile();
      };
      if (counterRef.current) {
        counterRef.current.measureInWindow((x, y, w, h) =>
          fire({ x: x + w / 2, y: y + h / 2 }),
        );
      } else {
        fire({ x: SCREEN_W - 48, y: 60 });
      }
    },
    [isAuthenticated, spawnFly, bumpCounter, scheduleReconcile],
  );

  const spendCoins = useCallback(
    (amount: number) => {
      if (!amount || !isAuthenticated) return;
      Vibration.vibrate(12);
      setBalance((b) => Math.max(0, (b ?? 0) - amount));
      bumpCounter("down");
      scheduleReconcile();
    },
    [isAuthenticated, bumpCounter, scheduleReconcile],
  );

  return (
    <CoinsContext.Provider
      value={{
        balance,
        awardCoins,
        spendCoins,
        refresh,
        registerCounter,
        counterAnim,
      }}
    >
      {children}
      {sprites.length > 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {sprites.map((s) => (
            <Animated.View
              key={s.id}
              style={[
                styles.fly,
                {
                  opacity: s.opacity,
                  transform: [
                    { translateX: s.pos.x },
                    { translateY: s.pos.y },
                    {
                      rotateY: s.rotate.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0deg", "360deg"],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={styles.flyText}>¢</Text>
            </Animated.View>
          ))}
        </View>
      )}
    </CoinsContext.Provider>
  );
}

const styles = StyleSheet.create({
  fly: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#f5c518",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#d99411",
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  flyText: { color: "#7a4a05", fontWeight: "900", fontSize: 14 },
});

export function useCoins(): CoinsContextValue {
  const ctx = useContext(CoinsContext);
  if (!ctx) throw new Error("useCoins must be used within CoinsProvider");
  return ctx;
}
