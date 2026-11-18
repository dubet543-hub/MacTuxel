import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronUp } from "lucide-react";
import { RibbonLayoutContext } from "./RibbonLayout";
import "./ribbon.css";

export interface RibbonTab {
  id: string;
  label: string;
  render: () => ReactNode;
}

interface RibbonProps {
  tabs: RibbonTab[];
  initialTab?: string;
}

/** Tab strip plus the active tab's command panel. Double-click a tab to collapse. */
export function Ribbon({ tabs, initialTab }: RibbonProps) {
  const [active, setActive] = useState(initialTab ?? tabs[0].id);
  const [collapsed, setCollapsed] = useState(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState(0);

  // Fit the panel: collapse groups from the right until nothing overflows.
  useLayoutEffect(() => {
    if (!panel) return;
    if (panel.scrollWidth > panel.clientWidth + 1 && collapsedGroups < panel.children.length - 1) {
      setCollapsedGroups((n) => n + 1);
    }
  });

  // Start over (expanded) when the tab changes or the window grows.
  useLayoutEffect(() => setCollapsedGroups(0), [current.id]);
  useEffect(() => {
    if (!panel) return;
    let width = panel.clientWidth;
    const observer = new ResizeObserver(() => {
      if (panel.clientWidth > width) setCollapsedGroups(0);
      else if (panel.scrollWidth > panel.clientWidth + 1) setCollapsedGroups((n) => n + 1);
      width = panel.clientWidth;
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [panel]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === active);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    setActive(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div className={`ribbon ${collapsed ? "is-collapsed" : ""}`} data-testid="ribbon">
      <div className="ribbon__tabs" role="tablist" aria-label="Ribbon" onKeyDown={onKeyDown}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={`ribbon-tab-${tab.id}`}
            aria-selected={tab.id === current.id}
            aria-controls="ribbon-panel"
            tabIndex={tab.id === current.id ? 0 : -1}
            className="ribbon__tab"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setActive(tab.id);
              setCollapsed(false);
            }}
            onDoubleClick={() => setCollapsed((c) => !c)}
          >
            {tab.label}
          </button>
        ))}
        <div className="ribbon__spacer" />
        <button
          type="button"
          className="ribbon__collapse"
          aria-label={collapsed ? "Show ribbon" : "Hide ribbon"}
          data-tip={collapsed ? "Show ribbon" : "Hide ribbon"}
          data-tip-desc="Double-click a tab to toggle too."
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setCollapsed((c) => !c)}
        >
          <ChevronUp size={14} strokeWidth={1.8} style={{ transform: collapsed ? "rotate(180deg)" : undefined }} />
        </button>
      </div>
      {!collapsed && (
        <RibbonLayoutContext.Provider value={{ collapsed: collapsedGroups, panel }}>
          <div ref={setPanel} className="ribbon__panel" id="ribbon-panel" role="tabpanel" aria-labelledby={`ribbon-tab-${current.id}`}>
            {current.render()}
          </div>
        </RibbonLayoutContext.Provider>
      )}
    </div>
  );
}
