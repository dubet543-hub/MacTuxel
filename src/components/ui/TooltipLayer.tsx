import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ui.css";

interface TipState {
  title: string;
  keys?: string;
  desc?: string;
  x: number;
  y: number;
  above: boolean;
}

const SHOW_DELAY = 450;

/**
 * One tooltip for the whole app. Any element with `data-tip` gets a rich
 * tooltip (title, optional `data-tip-keys` shortcut and `data-tip-desc`).
 * Works for aria-disabled buttons, which is why it isn't the native `title`.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<TipState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const current = useRef<Element | null>(null);

  useEffect(() => {
    const hide = () => {
      window.clearTimeout(timer.current);
      current.current = null;
      setTip(null);
    };
    const onOver = (event: PointerEvent) => {
      const el = (event.target as Element | null)?.closest?.("[data-tip]") ?? null;
      if (el === current.current) return;
      hide();
      if (!el) return;
      current.current = el;
      timer.current = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        const above = r.bottom + 70 > window.innerHeight;
        setTip({
          title: el.getAttribute("data-tip") ?? "",
          keys: el.getAttribute("data-tip-keys") ?? undefined,
          desc: el.getAttribute("data-tip-desc") ?? undefined,
          x: Math.min(Math.max(8, r.left + r.width / 2), window.innerWidth - 8),
          y: above ? r.top - 6 : r.bottom + 6,
          above,
        });
      }, SHOW_DELAY);
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    window.addEventListener("blur", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      hide();
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      window.removeEventListener("blur", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  if (!tip) return null;
  return createPortal(
    <div
      className={`tooltip ${tip.above ? "tooltip--above" : ""}`}
      role="tooltip"
      data-testid="tooltip"
      style={{ left: tip.x, top: tip.y }}
    >
      <div className="tooltip__title">
        {tip.title}
        {tip.keys && <kbd className="tooltip__keys">{tip.keys}</kbd>}
      </div>
      {tip.desc && <div className="tooltip__desc">{tip.desc}</div>}
    </div>,
    document.body,
  );
}
