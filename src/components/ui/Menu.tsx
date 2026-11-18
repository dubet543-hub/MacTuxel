import type { KeyboardEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import "./ui.css";

/** Vertical command menu with arrow-key navigation. */
export function Menu({ children, label }: { children: ReactNode; label?: string }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([aria-disabled="true"])')];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next].focus();
  };
  return (
    <div className="menu" role="menu" aria-label={label} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}

interface MenuItemProps {
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  danger?: boolean;
  onSelect: () => void;
  children?: ReactNode;
}

export function MenuItem({ label, icon: Icon, shortcut, checked, disabled, disabledReason, danger, onSelect, children }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`menu__item ${danger ? "menu__item--danger" : ""}`}
      aria-disabled={disabled || undefined}
      aria-checked={checked}
      data-tip={disabled && disabledReason ? label : undefined}
      data-tip-desc={disabled ? disabledReason : undefined}
      onClick={() => {
        if (!disabled) onSelect();
      }}
    >
      <span className="menu__icon">{Icon ? <Icon size={15} strokeWidth={1.7} /> : checked ? "✓" : null}</span>
      <span className="menu__label">{children ?? label}</span>
      {shortcut && <kbd className="menu__shortcut">{shortcut}</kbd>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="menu__separator" role="separator" />;
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return <div className="menu__heading">{children}</div>;
}
