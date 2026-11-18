import { useEffect, useMemo, useState } from "react";
import { SHORTCUT_SECTIONS } from "../../app/shortcuts";
import { getAppInfo, type AppInfo } from "../../platform/tauri";
import { useSheetController } from "../../spreadsheet/SheetContext";
import { FUNCTION_CATEGORIES, functionsIn } from "../../spreadsheet/functionCatalog";
import type { WorkbookStatistics } from "../../spreadsheet/SheetController";
import { BrandMark } from "../BrandMark";
import { Dialog } from "../ui/Dialog";
import { useDialogs } from "../ui/DialogProvider";
import "./dialogs.css";

function CloseFooter({ close }: { close: () => void }) {
  return (
    <button type="button" className="btn btn--primary" onClick={close}>
      Done
    </button>
  );
}

function AboutDialog({ close }: { close: () => void }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    void getAppInfo().then(setInfo);
  }, []);
  return (
    <Dialog title="About MacTuxel" onClose={close} footer={<CloseFooter close={close} />}>
      <div className="about">
        <BrandMark size={64} />
        <div className="about__name">MacTuxel</div>
        <div className="about__meta">
          {info ? `Version ${info.version} · ${info.arch === "aarch64" ? "Apple Silicon" : info.arch}` : "Browser preview"}
        </div>
        <p className="about__text">An offline-first spreadsheet editor for macOS, built by Tushar.</p>
        <p className="about__credits">Spreadsheet engine: Univer (Apache-2.0). Excel files: SheetJS CE (Apache-2.0). Icons: Lucide (ISC).</p>
      </div>
    </Dialog>
  );
}

function ShortcutsDialog({ close }: { close: () => void }) {
  return (
    <Dialog title="Keyboard Shortcuts" onClose={close} width={520} footer={<CloseFooter close={close} />}>
      <div className="shortcuts">
        {SHORTCUT_SECTIONS.map((section) => (
          <section key={section.title}>
            <h3>{section.title}</h3>
            <dl>
              {section.items.map((item) => (
                <div key={item.action} className="shortcuts__row">
                  <dt>{item.action}</dt>
                  <dd>
                    <kbd>{item.keys}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

function FunctionsDialog({ close }: { close: () => void }) {
  return (
    <Dialog title="Function Reference" onClose={close} width={560} footer={<CloseFooter close={close} />}>
      <div className="fnref">
        {FUNCTION_CATEGORIES.map((cat) => (
          <section key={cat}>
            <h3>{cat}</h3>
            {functionsIn(cat).map((f) => (
              <div key={f.name} className="fnref__row">
                <code>{f.syntax}</code>
                <span>{f.description}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Dialog>
  );
}

function StatisticsDialog({ close, stats }: { close: () => void; stats: WorkbookStatistics }) {
  const rows: [string, string | number][] = [
    ["Sheets", stats.sheets],
    ["Used range (current sheet)", stats.usedRange],
    ["Cells with data", stats.cellsWithData],
    ["Numbers", stats.numbers],
    ["Text cells", stats.text],
    ["Formulas", stats.formulas],
  ];
  return (
    <Dialog title="Workbook Statistics" onClose={close} footer={<CloseFooter close={close} />}>
      <dl className="stats-table" data-testid="workbook-stats">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

/** App-level informational dialogs. */
export function useAppDialogs() {
  const { show } = useDialogs();
  const controller = useSheetController();
  return useMemo(
    () => ({
      about: () => show((close) => <AboutDialog close={close} />),
      shortcuts: () => show((close) => <ShortcutsDialog close={close} />),
      functions: () => show((close) => <FunctionsDialog close={close} />),
      statistics: () => {
        if (!controller) return;
        const stats = controller.workbookStatistics();
        show((close) => <StatisticsDialog close={close} stats={stats} />);
      },
    }),
    [show, controller],
  );
}
