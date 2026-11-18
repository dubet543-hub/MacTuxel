import { useMemo } from "react";
import { useDialogs } from "../components/ui/DialogProvider";
import { useSheetController } from "../spreadsheet/SheetContext";
import { validateSheetName } from "../spreadsheet/sheetNames";
import { useRunCommand } from "./CommandRunner";

/** Worksheet actions with their confirmation/prompt dialogs, shared by tabs, menus and the ribbon. */
export function useSheetActions() {
  const controller = useSheetController();
  const dialogs = useDialogs();
  const run = useRunCommand();

  return useMemo(() => {
    const activeId = () => controller?.getState().activeSheetId ?? null;

    return {
      add: () => run("Insert Sheet", () => controller?.addSheet()),
      duplicate: (id = activeId()) => run("Duplicate Sheet", () => id && controller?.duplicateSheet(id)),
      move: (delta: number, id = activeId()) => run("Move Sheet", () => id && controller?.moveSheet(id, delta)),
      activate: (id: string) => run("Select Sheet", () => controller?.activateSheet(id)),
      setTabColor: (color: string | null, id = activeId()) => run("Tab Color", () => id && controller?.setTabColor(id, color)),
      rename: async (id = activeId()) => {
        if (!controller || !id) return;
        const sheets = controller.getState().sheets;
        const current = sheets.find((s) => s.id === id);
        if (!current) return;
        const name = await dialogs.prompt({
          title: "Rename Sheet",
          label: "Sheet name",
          initialValue: current.name,
          okLabel: "Rename",
          validate: (value) =>
            validateSheetName(
              value,
              sheets.map((s) => s.name),
              current.name,
            ),
        });
        if (name !== null && name.trim() !== current.name) await run("Rename Sheet", () => controller.renameSheet(id, name));
        controller.focusGrid();
      },
      remove: async (id = activeId()) => {
        if (!controller || !id) return;
        const sheet = controller.getState().sheets.find((s) => s.id === id);
        if (!sheet || !controller.canDeleteSheet()) return;
        const ok = await dialogs.confirm("Delete Sheet", `Delete "${sheet.name}"? You can undo this with ⌘Z.`, "Delete");
        if (ok) await run("Delete Sheet", () => controller.deleteSheet(id));
        controller.focusGrid();
      },
    };
  }, [controller, dialogs, run]);
}
