import { THEME_PREFERENCES, type ThemePreference } from "../theme/colorScheme";
import "./ui/ui.css";

const LABELS: Record<ThemePreference, string> = { system: "Auto", light: "Light", dark: "Dark" };

interface ThemeSwitcherProps {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
}

export function ThemeSwitcher({ value, onChange }: ThemeSwitcherProps) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Appearance">
      {THEME_PREFERENCES.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          className={value === option ? "is-active" : undefined}
          onClick={() => onChange(option)}
          title={option === "system" ? "Follow macOS appearance" : `${LABELS[option]} appearance`}
        >
          {LABELS[option]}
        </button>
      ))}
    </div>
  );
}
