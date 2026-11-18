import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppDialogs } from "../components/dialogs/useAppDialogs";
import { CompatibilityBanner, DropOverlay } from "../components/documentChrome";
import { FileTab } from "../components/ribbon/tabs/FileTab";
import { DataTab, FormulasTab, HelpTab, InsertTab, PageLayoutTab, ReviewTab, ViewTab } from "../components/ribbon/tabs/OtherTabs";
import { HomeTab } from "../components/ribbon/tabs/HomeTab";
import { Ribbon, type RibbonTab } from "../components/ribbon/Ribbon";
import { FormulaBar } from "../components/formulabar/FormulaBar";
import { SheetTabs } from "../components/sheettabs/SheetTabs";
import { StatusBar } from "../components/statusbar/StatusBar";
import { TitleBar } from "../components/titlebar/TitleBar";
import { DialogProvider } from "../components/ui/DialogProvider";
import { TooltipLayer } from "../components/ui/TooltipLayer";
import { fileKindOf } from "../io/formats";
import { isTauri, showErrorAlert } from "../platform/tauri";
import { SheetProvider } from "../spreadsheet/SheetContext";
import type { SheetController } from "../spreadsheet/SheetController";
import { SpreadsheetView } from "../spreadsheet/SpreadsheetView";
import { useColorScheme } from "../theme/useColorScheme";
import { CommandRunnerProvider, type RunCommand } from "./CommandRunner";
import { FormulaBarBridge } from "./FormulaBarBridge";
import { useAppMenu } from "./useAppMenu";
import { useDocument } from "./useDocument";
import { useGlobalShortcuts } from "./useGlobalShortcuts";

declare global {
  interface Window {
    /** Dev/test-only handle for driving the spreadsheet from Playwright. */
    __MACTUXEL__?: SheetController;
  }
}

const NATIVE_TITLEBAR = isTauri() && /Mac/.test(navigator.userAgent);
const FILE_COMMANDS = new Set(["Open", "Save", "Export", "Recover"]);

export function App() {
  const [controller, setController] = useState<SheetController | null>(null);
  const [status, setStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);

  // Commands can nest (a button's runner wraps a menu's runner); an error reported by
  // an inner run must not be overwritten by the outer run's "Ready".
  const errorCount = useRef(0);
  const run = useCallback<RunCommand>(async (label, action) => {
    const errorsBefore = errorCount.current;
    setBusy(true);
    try {
      const result = await action();
      if (typeof result === "string") setStatus(result);
      else if (errorCount.current === errorsBefore) setStatus("Ready");
    } catch (error) {
      errorCount.current += 1;
      const text = `${label}: ${error instanceof Error ? error.message : String(error)}`;
      setStatus(text);
      if (FILE_COMMANDS.has(label)) await showErrorAlert(text);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleReady = useCallback((next: SheetController | null) => {
    setController(next);
    if (import.meta.env.DEV) window.__MACTUXEL__ = next ?? undefined;
  }, []);

  return (
    <CommandRunnerProvider run={run}>
      <SheetProvider controller={controller}>
        <DialogProvider>
          <FormulaBarBridge>
            <AppShell controller={controller} run={run} status={status} busy={busy} onReady={handleReady} />
            <TooltipLayer />
          </FormulaBarBridge>
        </DialogProvider>
      </SheetProvider>
    </CommandRunnerProvider>
  );
}

interface AppShellProps {
  controller: SheetController | null;
  run: RunCommand;
  status: string;
  busy: boolean;
  onReady: (controller: SheetController | null) => void;
}

function AppShell({ controller, run, status, busy, onReady }: AppShellProps) {
  const { preference, setPreference, scheme } = useColorScheme();
  const docApi = useDocument(controller, run);
  const appDialogs = useAppDialogs();
  const { doc, canUseFiles } = docApi;
  const [htmlDrop, setHtmlDrop] = useState(false);

  useGlobalShortcuts(controller, {
    newDocument: docApi.newDocument,
    openDocument: docApi.openDocument,
    saveDocument: docApi.saveDocument,
    saveDocumentAs: docApi.saveDocumentAs,
    canUseFiles,
  });

  useAppMenu(
    controller,
    {
      newDocument: docApi.newDocument,
      openDocument: docApi.openDocument,
      openRecent: docApi.openRecent,
      clearRecent: docApi.clearRecent,
      saveDocument: docApi.saveDocument,
      saveDocumentAs: docApi.saveDocumentAs,
      exportCsv: docApi.exportCsv,
      showCompatibilityReport: docApi.showCompatibilityReport,
      showAbout: appDialogs.about,
      showShortcuts: appDialogs.shortcuts,
      showFunctions: appDialogs.functions,
    },
    docApi.recent,
    doc.issues.length > 0,
  );

  // Browser preview: HTML5 file drops (the desktop app receives native drops instead).
  const openBytes = docApi.openBytes;
  useEffect(() => {
    if (isTauri()) return;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setHtmlDrop(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setHtmlDrop(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setHtmlDrop(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      const file = files.find((f) => fileKindOf(f.name)) ?? files[0];
      if (!file) return;
      void file.arrayBuffer().then((buf) => openBytes(file.name, new Uint8Array(buf)));
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [openBytes]);

  const tabs = useMemo<RibbonTab[]>(
    () => [
      { id: "file", label: "File", render: () => <FileTab docApi={docApi} /> },
      { id: "home", label: "Home", render: () => <HomeTab /> },
      { id: "insert", label: "Insert", render: () => <InsertTab /> },
      { id: "page-layout", label: "Page Layout", render: () => <PageLayoutTab /> },
      { id: "formulas", label: "Formulas", render: () => <FormulasTab /> },
      { id: "data", label: "Data", render: () => <DataTab onOpenFile={() => void docApi.openDocument()} canOpenFiles={canUseFiles} /> },
      { id: "review", label: "Review", render: () => <ReviewTab /> },
      { id: "view", label: "View", render: () => <ViewTab themePreference={preference} onThemeChange={setPreference} /> },
      { id: "help", label: "Help", render: () => <HelpTab /> },
    ],
    [docApi, canUseFiles, preference, setPreference],
  );

  return (
    <div className="app" data-scheme={scheme}>
      <TitleBar
        documentName={doc.name}
        dirty={doc.dirty}
        busy={busy}
        canUseFiles={canUseFiles}
        nativeControls={NATIVE_TITLEBAR}
        themePreference={preference}
        scheme={scheme}
        onThemeChange={setPreference}
        onNew={() => void docApi.newDocument()}
        onOpen={() => void docApi.openDocument()}
        onSave={() => void docApi.saveDocument()}
      />
      <Ribbon tabs={tabs} initialTab="home" />
      <CompatibilityBanner issues={doc.issues} fileName={doc.name} onDetails={docApi.showCompatibilityReport} />
      <FormulaBar />
      <SpreadsheetView dark={scheme === "dark"} onReady={onReady} />
      <SheetTabs />
      <StatusBar message={status} />
      <DropOverlay active={docApi.dropActive || htmlDrop} />
    </div>
  );
}
