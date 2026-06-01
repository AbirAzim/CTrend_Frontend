import { createContext, useContext, useRef, useState } from "react";
import { Animated } from "react-native";

type TabBarCtx = {
  translateY: Animated.Value;
  onScroll: Animated.Value;
  savedCount: number;
  setSavedCount: (n: number) => void;
  adjustSavedCount: (delta: 1 | -1) => void;
};

const TabBarContext = createContext<TabBarCtx | null>(null);

export function TabBarProvider({ children }: { children: React.ReactNode }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const onScroll = useRef(new Animated.Value(0)).current;
  const [savedCount, setSavedCountRaw] = useState(0);

  function setSavedCount(n: number) {
    setSavedCountRaw(Math.max(0, n));
  }

  function adjustSavedCount(delta: 1 | -1) {
    setSavedCountRaw((n) => Math.max(0, n + delta));
  }

  return (
    <TabBarContext.Provider value={{ translateY, onScroll, savedCount, setSavedCount, adjustSavedCount }}>
      {children}
    </TabBarContext.Provider>
  );
}

export function useTabBar() {
  const ctx = useContext(TabBarContext);
  if (!ctx) throw new Error("useTabBar must be inside TabBarProvider");
  return ctx;
}
