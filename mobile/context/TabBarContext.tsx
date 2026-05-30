import { createContext, useContext, useRef } from "react";
import { Animated } from "react-native";

type TabBarCtx = {
  translateY: Animated.Value;
  onScroll: Animated.Value;
};

const TabBarContext = createContext<TabBarCtx | null>(null);

export function TabBarProvider({ children }: { children: React.ReactNode }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const onScroll = useRef(new Animated.Value(0)).current;

  return (
    <TabBarContext.Provider value={{ translateY, onScroll }}>
      {children}
    </TabBarContext.Provider>
  );
}

export function useTabBar() {
  const ctx = useContext(TabBarContext);
  if (!ctx) throw new Error("useTabBar must be inside TabBarProvider");
  return ctx;
}
