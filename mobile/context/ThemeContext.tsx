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
  bg: "#08080f",
  card: "#13131f",
  section: "#1c1c2a",
  border: "#252535",
  topbar: "#0d0d1a",
  text: "#f0f0ff",
  subtext: "#8b8ba8",
  muted: "#5c5c78",
  accent: "#7c72f5",
  accentLight: "#b8abff",
  circleBtnBg: "#1c1c2e",
  tabBg: "#0f0f1c",
  inputBg: "#1a1a28",
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
