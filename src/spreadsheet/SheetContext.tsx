import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { SheetController } from "./SheetController";
import { INITIAL_SHEET_STATE, type SheetUIState } from "./sheetState";

const SheetContext = createContext<SheetController | null>(null);

export function SheetProvider({ controller, children }: { controller: SheetController | null; children: ReactNode }) {
  return <SheetContext.Provider value={controller}>{children}</SheetContext.Provider>;
}

/** The controller, or null while the grid is mounting. */
export function useSheetController(): SheetController | null {
  return useContext(SheetContext);
}

const noopSubscribe = () => () => {};
const initial = () => INITIAL_SHEET_STATE;

/** Reactive selection/format/sheet state for UI components. */
export function useSheetState(): SheetUIState {
  const controller = useContext(SheetContext);
  return useSyncExternalStore(controller?.subscribe ?? noopSubscribe, controller?.getState ?? initial);
}
