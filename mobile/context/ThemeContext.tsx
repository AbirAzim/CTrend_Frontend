import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

export type ColorPalette = {
  bg: string;
  card: string;
  section: string;
  border: string;
  topbar: string;
  text: string;
  subtext: string;
  muted: string;
  accent: string;
  accentLight: string;
  circleBtnBg: string;
  tabBg: string;
  inputBg: string;
};

const DARK: ColorPalette = {
  bg: "#0a0a18",        // deep indigo-black — richer, cooler than the old muddy near-black
  card: "#16162b",      // indigo-tinted card for real depth
  section: "#20203b",   // more saturated raised surface
  border: "#2e2e52",    // cooler, more visible borders
  topbar: "#0e0d20",
  text: "#f4f3ff",      // crisp near-white, cool tint
  subtext: "#a6a4d6",   // brighter violet-gray (was a dull #8b8ba8)
  muted: "#6f6ea6",     // livelier muted (was #5c5c78)
  accent: "#8b7dff",    // brighter, more vivid indigo
  accentLight: "#c6bcff",
  circleBtnBg: "#20203a",
  tabBg: "#121026",
  inputBg: "#1b1a32",
};

const LIGHT: ColorPalette = {
  bg: "#f4f4f5",
  card: "#ffffff",
  section: "#f0f0f0",
  border: "#e4e4e7",
  topbar: "#ffffff",
  text: "#09090b",
  subtext: "#71717a",
  muted: "#a1a1aa",
  accent: "#6366f1",
  accentLight: "#818cf8",
  circleBtnBg: "#f0f0f5",
  tabBg: "#ffffff",
  inputBg: "#f4f4f5",
};

type ThemeCtx = { isDark: boolean; colors: ColorPalette; toggleTheme: () => void };

const ThemeContext = createContext<ThemeCtx>({ isDark: true, colors: DARK, toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(true);
  const toggleTheme = useCallback(() => setIsDark((d) => !d), []);
  return (
    <ThemeContext.Provider value={{ isDark, colors: isDark ? DARK : LIGHT, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
