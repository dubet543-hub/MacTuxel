import { describe, expect, it } from "vitest";
import {
  THEME_STORAGE_KEY,
  loadThemePreference,
  parseThemePreference,
  resolveColorScheme,
  saveThemePreference,
} from "../../src/theme/colorScheme";

describe("color scheme", () => {
  it("resolves 'system' from the OS setting", () => {
    expect(resolveColorScheme("system", true)).toBe("dark");
    expect(resolveColorScheme("system", false)).toBe("light");
  });

  it("explicit choices override the OS setting", () => {
    expect(resolveColorScheme("light", true)).toBe("light");
    expect(resolveColorScheme("dark", false)).toBe("dark");
  });

  it("parses unknown values as 'system'", () => {
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("purple")).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
  });

  it("persists and restores the preference", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    saveThemePreference("dark", storage);
    expect(store.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(loadThemePreference(storage)).toBe("dark");
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadThemePreference(broken)).toBe("system");
    expect(() => saveThemePreference("light", broken)).not.toThrow();
  });
});
