/** What the user picked in the appearance switcher. */
export type ThemePreference = "system" | "light" | "dark";

/** The scheme actually applied to the UI. */
export type ColorScheme = "light" | "dark";

export const THEME_STORAGE_KEY = "mactuxel.theme";

export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

export function parseThemePreference(raw: unknown): ThemePreference {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

export function resolveColorScheme(preference: ThemePreference, systemPrefersDark: boolean): ColorScheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

/** Reads the stored preference; storage may be unavailable, so never throws. */
export function loadThemePreference(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): ThemePreference {
  try {
    return parseThemePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function saveThemePreference(
  preference: ThemePreference,
  storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* Storage blocked — the preference just won't persist. */
  }
}
