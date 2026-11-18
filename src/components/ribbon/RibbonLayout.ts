import { createContext, useContext } from "react";

export interface RibbonLayout {
  /** How many groups, counted from the right, are collapsed into dropdowns. */
  collapsed: number;
  panel: HTMLElement | null;
}

export const RibbonLayoutContext = createContext<RibbonLayout>({ collapsed: 0, panel: null });

/** Whether this group element should render collapsed. */
export function useGroupCollapsed(el: HTMLElement | null): boolean {
  const { collapsed, panel } = useContext(RibbonLayoutContext);
  if (!collapsed || !panel || !el) return false;
  const groups = [...panel.children];
  const index = groups.indexOf(el);
  return index >= 0 && index >= groups.length - collapsed;
}
