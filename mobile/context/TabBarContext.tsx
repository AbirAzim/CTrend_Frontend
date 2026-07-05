import { createContext, useContext, useState } from "react";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

type TabBarCtx = {
  translateY: SharedValue<number>;
  savedCount: number;
  setSavedCount: (n: number) => void;
  adjustSavedCount: (delta: 1 | -1) => void;
};

const TabBarContext = createContext<TabBarCtx | null>(null);

export function TabBarProvider({ children }: { children: React.ReactNode }) {
  const translateY = useSharedValue(0);
  const [savedCount, setSavedCountRaw] = useState(0);

  function setSavedCount(n: number) {
    setSavedCountRaw(Math.max(0, n));
  }

  function adjustSavedCount(delta: 1 | -1) {
    setSavedCountRaw((n) => Math.max(0, n + delta));
  }

  return (
    <TabBarContext.Provider value={{ translateY, savedCount, setSavedCount, adjustSavedCount }}>
      {children}
    </TabBarContext.Provider>
  );
}

export function useTabBar() {
  const ctx = useContext(TabBarContext);
  if (!ctx) throw new Error("useTabBar must be inside TabBarProvider");
  return ctx;
}
