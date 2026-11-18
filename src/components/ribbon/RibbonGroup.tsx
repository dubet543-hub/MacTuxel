import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, LayoutGrid, type LucideIcon } from "lucide-react";
import { useDismiss } from "../ui/useDismiss";
import { useGroupCollapsed } from "./RibbonLayout";

interface RibbonGroupProps {
  label: string;
  /** Shown when the window is too narrow and the group collapses to one button. */
  icon?: LucideIcon;
  children: ReactNode;
}

/**
 * A labelled cluster of ribbon commands. When the ribbon runs out of room it
 * collapses into a single button that drops the full group down.
 */
export function RibbonGroup({ label, icon: Icon = LayoutGrid, children }: RibbonGroupProps) {
  const ref = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [, forceMeasure] = useState(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const collapsed = useGroupCollapsed(ref.current);

  // Re-render once mounted so the group can find its position in the panel.
  useLayoutEffect(() => forceMeasure(1), []);
  useDismiss(open && collapsed, () => setOpen(false), [dropRef, buttonRef]);

  const toggle = () => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 420)), top: r.bottom + 2 });
    setOpen((o) => !o);
  };

  return (
    <section ref={ref} className={`rg ${collapsed ? "is-collapsed" : ""}`} aria-label={label}>
      {collapsed && (
        <div className="rb rb--large">
          <button
            ref={buttonRef}
            type="button"
            className="rb__main"
            aria-haspopup="true"
            aria-expanded={open}
            aria-label={label}
            data-tip={label}
            data-tip-desc="Click to show this group's commands."
            data-testid={`group-${label}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggle}
          >
            <span className="rb__icon">
              <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="rb__label">{label}</span>
            <ChevronDown className="rb__caret" size={11} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      )}
      <div
        ref={dropRef}
        className={`rg__content ${collapsed ? "rg__content--drop" : ""} ${collapsed && open ? "is-open" : ""}`}
        style={collapsed ? { left: pos.left, top: pos.top } : undefined}
        onClick={(e) => {
          // Close the dropdown once a command runs; keep it while a nested menu opens.
          if (!collapsed) return;
          const target = e.target as HTMLElement;
          const command = target.closest(".rb__main, .menu__item, .palette__swatch, .palette__reset, .style-gallery__item");
          if (command && !command.hasAttribute("aria-haspopup")) setOpen(false);
        }}
      >
        {children}
      </div>
      {!collapsed && <div className="rg__label">{label}</div>}
    </section>
  );
}

/** Stacks children in rows inside a group (e.g. the Font group's two rows). */
export function RibbonStack({ children }: { children: ReactNode }) {
  return <div className="rg__stack">{children}</div>;
}

export function RibbonRow({ children }: { children: ReactNode }) {
  return <div className="rg__row">{children}</div>;
}

/** Joins related icon buttons into one segmented control. */
export function RibbonSegment({ children }: { children: ReactNode }) {
  return <div className="rg__segment">{children}</div>;
}
