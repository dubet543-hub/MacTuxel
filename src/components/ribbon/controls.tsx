import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { useRunCommand } from "../../app/CommandRunner";
import { useSheetController, useSheetState } from "../../spreadsheet/SheetContext";
import { NUMBER_FORMAT_PRESETS, describeNumberFormat } from "../../spreadsheet/numberFormats";
import { Popover } from "../ui/Popover";
import { Menu, MenuItem } from "../ui/Menu";

export const FONT_FAMILIES = [
  "Arial",
  "Helvetica Neue",
  "Avenir Next",
  "Futura",
  "Gill Sans",
  "Georgia",
  "Palatino",
  "Times New Roman",
  "Verdana",
  "Trebuchet MS",
  "Courier New",
  "Menlo",
];

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];

/** Native macOS pop-up button for the font family. */
export function FontFamilyPicker() {
  const controller = useSheetController();
  const run = useRunCommand();
  const { style } = useSheetState();
  const families = FONT_FAMILIES.includes(style.fontFamily) ? FONT_FAMILIES : [style.fontFamily, ...FONT_FAMILIES];
  return (
    <select
      className="rc-select rc-select--font"
      aria-label="Font"
      data-tip="Font"
      data-tip-desc="Choose a typeface for the selected cells."
      value={style.fontFamily}
      onChange={(e) => {
        const family = e.target.value;
        void run("Font", async () => {
          await controller?.setFontFamily(family);
          controller?.focusGrid();
        });
      }}
    >
      {families.map((f) => (
        <option key={f} value={f} style={{ fontFamily: f }}>
          {f}
        </option>
      ))}
    </select>
  );
}

/** Editable font-size combo box with a preset list. */
export function FontSizeBox() {
  const controller = useSheetController();
  const run = useRunCommand();
  const { style } = useSheetState();
  const [draft, setDraft] = useState(String(style.fontSize));
  const [open, setOpen] = useState(false);
  const focused = useRef(false);
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focused.current) setDraft(String(style.fontSize));
  }, [style.fontSize]);

  const apply = (size: number) =>
    run("Font Size", async () => {
      await controller?.setFontSize(size);
      controller?.focusGrid();
    });

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const n = Number(draft);
      if (Number.isFinite(n) && n >= 1 && n <= 409) void apply(n);
      else setDraft(String(style.fontSize));
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setDraft(String(style.fontSize));
      e.currentTarget.blur();
      controller?.focusGrid();
    }
  };

  return (
    <div ref={anchor} className="rc-combo" data-tip="Font Size" data-tip-desc="Type a size (1–409) or pick one.">
      <input
        className="rc-combo__input"
        aria-label="Font size"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onBlur={() => {
          focused.current = false;
          setDraft(String(style.fontSize));
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="rc-combo__button"
        aria-label="Font size options"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown size={11} strokeWidth={2} />
      </button>
      <Popover anchor={anchor.current} open={open} onClose={() => setOpen(false)} label="Font sizes">
        <Menu label="Font sizes">
          {FONT_SIZES.map((size) => (
            <MenuItem
              key={size}
              label={String(size)}
              checked={size === style.fontSize}
              onSelect={() => {
                setOpen(false);
                void apply(size);
              }}
            />
          ))}
        </Menu>
      </Popover>
    </div>
  );
}

/** Number format pop-up showing the active cell's format category. */
export function NumberFormatSelect() {
  const controller = useSheetController();
  const run = useRunCommand();
  const { numberFormat } = useSheetState();
  const preset = NUMBER_FORMAT_PRESETS.find((p) => p.pattern === numberFormat) ?? (numberFormat === "General" ? NUMBER_FORMAT_PRESETS[0] : null);
  return (
    <select
      className="rc-select rc-select--numfmt"
      aria-label="Number format"
      data-tip="Number Format"
      data-tip-desc="Choose how values appear: currency, percentage, date and more."
      value={preset?.id ?? "custom"}
      onChange={(e) => {
        const next = NUMBER_FORMAT_PRESETS.find((p) => p.id === e.target.value);
        if (!next) return;
        void run("Number Format", async () => {
          await controller?.setNumberFormat(next.pattern);
          controller?.focusGrid();
        });
      }}
    >
      {!preset && (
        <option value="custom" disabled>
          {describeNumberFormat(numberFormat)}
        </option>
      )}
      {NUMBER_FORMAT_PRESETS.map((p) => (
        <option key={p.id} value={p.id} title={p.sample}>
          {p.label}
        </option>
      ))}
    </select>
  );
}
