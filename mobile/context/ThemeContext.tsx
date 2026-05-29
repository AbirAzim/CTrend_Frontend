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
  bg: "#0a0a0a",
  card: "#1a1a1a",
  section: "#242424",
  border: "#2e2e2e",
  topbar: "#0f0f1a",
  text: "#ffffff",
  subtext: "#9ca3af",
  muted: "#6b7280",
  accent: "#818cf8",
  accentLight: "#c4b5fd",
  circleBtnBg: "#1e1e2e",
  tabBg: "#111111",
  inputBg: "#1e1e1e",
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
