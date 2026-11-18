import { useEffect, useState } from "react";
import { setNativeWindowTheme } from "../platform/tauri";
import {
  type ColorScheme,
  type ThemePreference,
  loadThemePreference,
  resolveColorScheme,
  saveThemePreference,
} from "./colorScheme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(DARK_QUERY).matches;
}

/**
 * Tracks the user's appearance preference, follows the macOS system setting
 * when set to "system", and keeps the native window chrome in sync.
 */
export function useColorScheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => loadThemePreference());
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  useEffect(() => {
    const mql = window.matchMedia?.(DARK_QUERY);
    if (!mql) return;
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const scheme: ColorScheme = resolveColorScheme(preference, systemDark);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = scheme;
    root.style.colorScheme = scheme;
  }, [scheme]);

  useEffect(() => {
    saveThemePreference(preference);
    // `null` hands control back to macOS so the window follows the system.
    void setNativeWindowTheme(preference === "system" ? null : preference);
  }, [preference]);

  return { preference, setPreference, scheme };
}
