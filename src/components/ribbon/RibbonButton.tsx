import { useRef, useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { useRunCommand } from "../../app/CommandRunner";
import { Popover } from "../ui/Popover";

export const NOT_AVAILABLE = "Not available in this version of MacTuxel.";

export interface RibbonButtonProps {
  icon: LucideIcon;
  label: string;
  /** large: icon over label; small: icon + label in a row; icon: icon only. */
  size?: "large" | "small" | "icon";
  keys?: string;
  desc?: string;
  onClick?: () => unknown;
  /** Toggle state (renders aria-pressed). */
  active?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** Whole button opens this menu. */
  menu?: (close: () => void) => ReactNode;
  /** Button runs onClick; the attached arrow opens this menu. */
  splitMenu?: (close: () => void) => ReactNode;
  /** Color bar under the icon (font/fill color buttons). */
  swatch?: string | null;
  testId?: string;
}

const ICON_SIZE = { large: 22, small: 16, icon: 16 } as const;

/** Ribbon command button. Never takes focus from the grid on click. */
export function RibbonButton(props: RibbonButtonProps) {
  const { icon: Icon, label, size = "small", keys, desc, active, disabled, menu, splitMenu, swatch, testId } = props;
  const run = useRunCommand();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const menuContent = menu ?? splitMenu;
  const close = () => setOpen(false);

  const tipDesc = disabled ? props.disabledReason ?? NOT_AVAILABLE : desc;
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  const onMain = () => {
    if (disabled) return;
    if (menu) setOpen((o) => !o);
    else if (props.onClick) void run(label, props.onClick);
  };

  const body = (
    <>
      <span className="rb__icon">
        <Icon size={ICON_SIZE[size]} strokeWidth={size === "large" ? 1.5 : 1.7} aria-hidden="true" />
        {swatch !== undefined && <span className="rb__swatch" style={{ background: swatch ?? "transparent" }} />}
      </span>
      {size !== "icon" && <span className="rb__label">{label}</span>}
      {menu && <ChevronDown className="rb__caret" size={11} strokeWidth={2} aria-hidden="true" />}
    </>
  );

  return (
    <div ref={anchor} className={`rb rb--${size} ${splitMenu ? "rb--split" : ""} ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className={`rb__main ${active ? "is-active" : ""}`}
        aria-label={label}
        aria-pressed={active === undefined ? undefined : active}
        aria-disabled={disabled || undefined}
        aria-haspopup={menu ? "menu" : undefined}
        aria-expanded={menu ? open : undefined}
        data-tip={label}
        data-tip-keys={keys}
        data-tip-desc={tipDesc}
        data-testid={testId}
        onMouseDown={keepFocus}
        onClick={onMain}
      >
        {body}
      </button>
      {splitMenu && (
        <button
          type="button"
          className="rb__arrow"
          aria-label={`${label} options`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-disabled={disabled || undefined}
          data-tip={`${label} options`}
          data-testid={testId ? `${testId}-menu` : undefined}
          onMouseDown={keepFocus}
          onClick={() => !disabled && setOpen((o) => !o)}
        >
          <ChevronDown size={11} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
      {menuContent && (
        <Popover anchor={anchor.current} open={open} onClose={close} label={label}>
          {menuContent(close)}
        </Popover>
      )}
    </div>
  );
}
