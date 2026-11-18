import "./ui.css";

/** MacTuxel palette: neutrals plus ten hues, each in five tints. */
const NEUTRALS = ["#000000", "#262626", "#525252", "#737373", "#a3a3a3", "#d4d4d4", "#e5e5e5", "#f5f5f5", "#fafafa", "#ffffff"];
const HUES: string[][] = [
  ["#fecaca", "#f87171", "#dc2626", "#991b1b", "#5f1212"],
  ["#fed7aa", "#fb923c", "#ea580c", "#9a3412", "#5c210c"],
  ["#fde68a", "#fbbf24", "#d97706", "#92400e", "#5a2a0b"],
  ["#d9f99d", "#a3e635", "#65a30d", "#3f6212", "#25390c"],
  ["#bbf7d0", "#4ade80", "#16a34a", "#166534", "#0d3b20"],
  ["#99f6e4", "#2dd4bf", "#0d9488", "#115e59", "#0a3a37"],
  ["#bae6fd", "#38bdf8", "#0284c7", "#075985", "#063a57"],
  ["#c7d2fe", "#818cf8", "#4f46e5", "#3730a3", "#221d66"],
  ["#e9d5ff", "#c084fc", "#9333ea", "#6b21a8", "#401466"],
  ["#fbcfe8", "#f472b6", "#db2777", "#9d174d", "#5e0e2e"],
];

interface ColorPaletteProps {
  onPick: (color: string | null) => void;
  /** Label for the "reset" choice, e.g. "Automatic" or "No Fill". */
  resetLabel: string;
  current?: string | null;
}

export function ColorPalette({ onPick, resetLabel, current }: ColorPaletteProps) {
  const swatch = (color: string) => (
    <button
      key={color}
      type="button"
      className={`palette__swatch ${current?.toLowerCase() === color ? "is-current" : ""}`}
      style={{ background: color }}
      aria-label={color}
      data-color={color}
      onClick={() => onPick(color)}
    />
  );
  return (
    <div className="palette">
      <button type="button" className="palette__reset" onClick={() => onPick(null)}>
        <span className="palette__reset-chip" aria-hidden="true" />
        {resetLabel}
      </button>
      <div className="palette__grid">{NEUTRALS.map(swatch)}</div>
      <div className="palette__grid palette__grid--hues">
        {[0, 1, 2, 3, 4].map((shade) => HUES.map((hue) => swatch(hue[shade])))}
      </div>
    </div>
  );
}
