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

// Instagram-style dark theme: true-black base, neutral gray surfaces, blue accent.
const DARK: ColorPalette = {
  bg: "#000000",        // true black feed (IG)
  card: "#121212",      // slightly elevated surface
  section: "#1c1c1e",   // raised surface / chips
  border: "#262626",    // IG hairline gray
  topbar: "#161616",    // header band — neutral, just-distinct from black
  text: "#fafafa",
  subtext: "#a8a8a8",   // IG secondary text
  muted: "#737373",
  accent: "#0095f6",    // Instagram blue
  accentLight: "#5cb4f7",
  circleBtnBg: "#1f1f21",
  tabBg: "#000000",
  inputBg: "#1c1c1e",
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
