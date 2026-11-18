import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDismiss } from "./useDismiss";
import "./ui.css";

interface PopoverProps {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  placement?: "bottom-start" | "top-start";
  label?: string;
}

/** Floating panel anchored to an element; closes on outside click or Escape. */
export function Popover({ anchor, open, onClose, children, className, placement = "bottom-start", label }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useDismiss(open, onClose, [ref, anchor]);

  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current) return;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const p = ref.current!.getBoundingClientRect();
      let left = a.left;
      let top = placement === "top-start" ? a.top - p.height - 4 : a.bottom + 4;
      if (left + p.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - p.width - 8);
      if (top + p.height > window.innerHeight - 8) top = Math.max(8, a.top - p.height - 4);
      if (top < 8) top = 8;
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchor, placement]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      className={`popover ${className ?? ""}`}
      role="dialog"
      aria-label={label}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
      // Keep keyboard focus in the grid while clicking inside menus.
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest("input, select, textarea")) e.preventDefault();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
