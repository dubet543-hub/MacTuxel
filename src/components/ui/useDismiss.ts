import { useEffect, useRef, type RefObject } from "react";

type Target = RefObject<HTMLElement | null> | HTMLElement | null;

/** Calls `onDismiss` on Escape or a pointer press outside every target. */
export function useDismiss(active: boolean, onDismiss: () => void, targets: Target[]) {
  const cb = useRef(onDismiss);
  cb.current = onDismiss;
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  useEffect(() => {
    if (!active) return;
    const inside = (node: Node) =>
      targetsRef.current.some((t) => {
        const el = t && "current" in t ? t.current : t;
        return !!el && el.contains(node);
      });
    const onPointer = (e: PointerEvent) => {
      if (!inside(e.target as Node)) cb.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cb.current();
      }
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", cb.current);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", cb.current);
    };
  }, [active]);
}
