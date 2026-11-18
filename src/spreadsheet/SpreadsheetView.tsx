import { useEffect, useRef } from "react";
import { createSpreadsheet } from "./createSpreadsheet";
import { SheetController } from "./SheetController";

interface SpreadsheetViewProps {
  dark: boolean;
  onReady: (controller: SheetController | null) => void;
}

/** Hosts the Univer canvas grid. Created once; dark mode is toggled live. */
export function SpreadsheetView({ dark, onReady }: SpreadsheetViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SheetController | null>(null);
  const initialDark = useRef(dark);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Each Univer instance gets its own mount node so a remount (e.g. React
    // StrictMode in dev) never shares a container with one being torn down.
    const mount = document.createElement("div");
    mount.className = "sheet-mount";
    host.appendChild(mount);

    const controller = new SheetController(createSpreadsheet(mount, { darkMode: initialDark.current }), mount);
    controllerRef.current = controller;
    onReadyRef.current(controller);

    return () => {
      onReadyRef.current(null);
      controllerRef.current = null;
      // Univer unmounts its own React root on dispose; doing that while our
      // React tree is committing triggers a race warning, so defer it.
      setTimeout(() => {
        controller.dispose();
        mount.remove();
      }, 0);
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.handle.setDarkMode(dark);
  }, [dark]);

  return <div ref={hostRef} className="sheet-host" data-testid="spreadsheet" />;
}
