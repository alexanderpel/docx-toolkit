import type { ShellTheme, ShellThemeTokens } from "@/bridge/types";

const TOKEN_TO_CSS_VAR: Record<keyof ShellThemeTokens, string> = {
  background: "--background",
  foreground: "--foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  border: "--border",
  accent: "--accent",
  accentForeground: "--accent-foreground",
};

export const applyTheme = (theme: ShellTheme, tokens: ShellThemeTokens) => {
  const root = document.documentElement;
  root.dataset.theme = theme;
  (Object.keys(TOKEN_TO_CSS_VAR) as Array<keyof ShellThemeTokens>).forEach((key) => {
    const value = tokens[key];
    if (value) root.style.setProperty(TOKEN_TO_CSS_VAR[key], value);
  });
};
