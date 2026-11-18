import { FilePlus, FolderOpen, Moon, Redo2, Save, Sun, SunMoon, Undo2 } from "lucide-react";
import { useRunCommand } from "../../app/CommandRunner";
import { useSheetController } from "../../spreadsheet/SheetContext";
import type { ColorScheme, ThemePreference } from "../../theme/colorScheme";
import { BrandMark } from "../BrandMark";
import "./titlebar.css";

interface TitleBarProps {
  documentName: string;
  dirty: boolean;
  busy: boolean;
  canUseFiles: boolean;
  /** Reserve space for the macOS traffic lights (overlay title bar). */
  nativeControls: boolean;
  themePreference: ThemePreference;
  scheme: ColorScheme;
  onThemeChange: (value: ThemePreference) => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
}

const NEXT_THEME: Record<ThemePreference, ThemePreference> = { system: "light", light: "dark", dark: "system" };
const THEME_LABEL: Record<ThemePreference, string> = { system: "Automatic", light: "Light", dark: "Dark" };

/** Unified title bar: brand, quick access toolbar and document title. Doubles as the window drag region. */
export function TitleBar(props: TitleBarProps) {
  const controller = useSheetController();
  const run = useRunCommand();
  const fileHint = props.canUseFiles ? undefined : "Available in the MacTuxel desktop app.";
  const keep = (e: React.MouseEvent) => e.preventDefault();
  const ThemeIcon = props.themePreference === "system" ? SunMoon : props.scheme === "dark" ? Moon : Sun;

  const qat = (
    label: string,
    keys: string,
    Icon: typeof Save,
    onClick: () => unknown,
    disabled = false,
    disabledReason?: string,
  ) => (
    <button
      type="button"
      className="qat__btn"
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-tip={label}
      data-tip-keys={keys}
      data-tip-desc={disabled ? disabledReason : undefined}
      data-testid={`qat-${label.toLowerCase().replace(/\W+/g, "-")}`}
      onMouseDown={keep}
      onClick={() => !disabled && void run(label, onClick)}
    >
      <Icon size={15} strokeWidth={1.7} />
    </button>
  );

  return (
    <header className={`titlebar ${props.nativeControls ? "titlebar--native" : ""}`} data-tauri-drag-region>
      <div className="titlebar__left" data-tauri-drag-region>
        <BrandMark size={18} />
        <span className="titlebar__app" data-tauri-drag-region>
          MacTuxel
        </span>
        <div className="qat" role="toolbar" aria-label="Quick Access Toolbar">
          {qat("New", "⌘N", FilePlus, props.onNew, props.busy)}
          {qat("Open", "⌘O", FolderOpen, props.onOpen, props.busy || !props.canUseFiles, fileHint)}
          {qat("Save", "⌘S", Save, props.onSave, props.busy || !props.canUseFiles, fileHint)}
          <span className="qat__sep" />
          {qat("Undo", "⌘Z", Undo2, () => controller?.undo())}
          {qat("Redo", "⇧⌘Z", Redo2, () => controller?.redo())}
        </div>
      </div>
      <div className="titlebar__title" data-tauri-drag-region data-testid="document-name">
        {props.documentName}
        {props.dirty && (
          <span className="titlebar__dirty" data-testid="dirty-indicator" title="Unsaved changes">
            {" "}
            — Edited
          </span>
        )}
      </div>
      <div className="titlebar__right" data-tauri-drag-region>
        <button
          type="button"
          className="qat__btn"
          aria-label={`Appearance: ${THEME_LABEL[props.themePreference]}`}
          data-tip={`Appearance: ${THEME_LABEL[props.themePreference]}`}
          data-tip-desc={`Click to switch to ${THEME_LABEL[NEXT_THEME[props.themePreference]]}.`}
          data-testid="theme-cycle"
          onMouseDown={keep}
          onClick={() => props.onThemeChange(NEXT_THEME[props.themePreference])}
        >
          <ThemeIcon size={15} strokeWidth={1.7} />
        </button>
      </div>
    </header>
  );
}
