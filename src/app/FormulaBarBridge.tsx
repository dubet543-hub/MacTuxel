import { createContext, useContext, useRef, type ReactNode, type RefObject } from "react";

export interface FormulaBarHandle {
  /** Puts text (e.g. "=SUM(") in the formula bar and focuses it for completion. */
  edit(text: string): void;
  focus(): void;
}

const BridgeContext = createContext<RefObject<FormulaBarHandle | null> | null>(null);

export function FormulaBarBridge({ children }: { children: ReactNode }) {
  const ref = useRef<FormulaBarHandle | null>(null);
  return <BridgeContext.Provider value={ref}>{children}</BridgeContext.Provider>;
}

/** The ref the FormulaBar registers itself on. */
export function useFormulaBarRef(): RefObject<FormulaBarHandle | null> {
  const ref = useContext(BridgeContext);
  if (!ref) throw new Error("useFormulaBarRef must be used inside <FormulaBarBridge>");
  return ref;
}

/** Lets ribbon commands start a formula in the formula bar. */
export function useFormulaBar(): FormulaBarHandle {
  const ref = useFormulaBarRef();
  return {
    edit: (text) => ref.current?.edit(text),
    focus: () => ref.current?.focus(),
  };
}
