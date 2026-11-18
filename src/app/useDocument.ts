import { createElement, useCallback, useEffect, useRef, useState } from "react";
import {
  CompatibilityReport,
  CompatibilityWarning,
  RecoveryDialog,
  SaveChangesDialog,
  type SaveChoice,
} from "../components/dialogs/documentDialogs";
import { useDialogs } from "../components/ui/DialogProvider";
import { issuesKey, type CompatIssue } from "../io/compatibility";
import { fileKindOf, openWorkbookBytes, saveWorkbookBytes, type FileKind, type SaveKind } from "../io/formats";
import { baseName, fileNameOf } from "../io/workbookConvert";
import { getFileBackend } from "../platform/fileBackend";
import { guardWindowClose, listenForFileDrops, setDocumentEdited } from "../platform/nativeDocument";
import { clearRecentFiles, forgetRecentFile, loadRecentFiles, rememberRecentFile, type RecentFile } from "../platform/recentFiles";
import { getRecoveryStore, type RecoverySnapshot } from "../platform/recovery";
import { setNativeWindowTitle } from "../platform/tauri";
import { createBlankWorkbook } from "../spreadsheet/blankWorkbook";
import type { SheetController } from "../spreadsheet/SheetController";
import type { RunCommand } from "./CommandRunner";

export interface DocumentState {
  /** File that Save writes to (null: untitled, or imported from a format Save can't write back). */
  path: string | null;
  /** Display name, e.g. "Budget.xlsx" or "Untitled". */
  name: string;
  sourceKind: FileKind | null;
  dirty: boolean;
  /** Features in the opened file that won't survive a save. */
  issues: CompatIssue[];
  /** Warnings the user already accepted for this document (by fingerprint). */
  acknowledged: string[];
}

const UNTITLED: DocumentState = { path: null, name: "Untitled", sourceKind: null, dirty: false, issues: [], acknowledged: [] };

/** Debounce for recovery snapshots after edits, and the most an edit can wait. */
const SNAPSHOT_DELAY_MS = 2000;
const SNAPSHOT_MAX_WAIT_MS = 20000;

export interface DocumentApi {
  doc: DocumentState;
  recent: RecentFile[];
  canUseFiles: boolean;
  dropActive: boolean;
  newDocument(): Promise<void>;
  openDocument(): Promise<void>;
  openRecent(path: string): Promise<void>;
  openBytes(fileName: string, bytes: Uint8Array): Promise<void>;
  saveDocument(): Promise<void>;
  saveDocumentAs(): Promise<void>;
  exportCsv(): Promise<void>;
  clearRecent(): void;
  showCompatibilityReport(): void;
}

export function useDocument(controller: SheetController | null, run: RunCommand): DocumentApi {
  const dialogs = useDialogs();
  const [doc, setDocState] = useState<DocumentState>(UNTITLED);
  const [recent, setRecent] = useState<RecentFile[]>(() => loadRecentFiles());
  const [dropActive, setDropActive] = useState(false);
  const docRef = useRef(doc);
  const setDoc = useCallback((next: DocumentState | ((d: DocumentState) => DocumentState)) => {
    setDocState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      docRef.current = value;
      return value;
    });
  }, []);
  const backend = getFileBackend();
  const recovery = useRef(getRecoveryStore()).current;

  // ---- Dialog helpers --------------------------------------------------------

  const askSaveChanges = useCallback(
    (name: string) => new Promise<SaveChoice>((resolve) => dialogs.show((close) => createElement(SaveChangesDialog, { name, done: (c) => (close(), resolve(c)) }))),
    [dialogs],
  );

  /** Shows the warning unless the same set was already accepted for this document. */
  const confirmIssues = useCallback(
    async (issues: CompatIssue[], fileName: string, action: string) => {
      if (!issues.length) return true;
      const key = issuesKey(issues);
      if (docRef.current.acknowledged.includes(key)) return true;
      const ok = await new Promise<boolean>((resolve) =>
        dialogs.show((close) => createElement(CompatibilityWarning, { issues, fileName, action, done: (v) => (close(), resolve(v)) })),
      );
      if (ok) setDoc((d) => ({ ...d, acknowledged: [...d.acknowledged, key] }));
      return ok;
    },
    [dialogs, setDoc],
  );

  // ---- Window chrome: title, edited dot ----------------------------------------

  useEffect(() => {
    const title = doc.path || doc.dirty || doc.sourceKind ? `${doc.name}${doc.dirty ? " — Edited" : ""} — MacTuxel` : "MacTuxel";
    void setNativeWindowTitle(title);
    void setDocumentEdited(doc.dirty);
  }, [doc.name, doc.path, doc.dirty, doc.sourceKind]);

  // ---- Dirty tracking + recovery snapshots ------------------------------------

  const snapshotTimer = useRef<number | undefined>(undefined);
  const firstPendingEdit = useRef<number | null>(null);

  const writeSnapshot = useCallback(async () => {
    window.clearTimeout(snapshotTimer.current);
    firstPendingEdit.current = null;
    const d = docRef.current;
    const workbook = controller?.snapshot();
    if (!d.dirty || !workbook) return;
    const snapshot: RecoverySnapshot = {
      version: 1,
      savedAt: Date.now(),
      document: { path: d.path, name: d.name, sourceKind: d.sourceKind, canSaveInPlace: d.path !== null, issues: d.issues },
      workbook,
    };
    try {
      await recovery.save(snapshot);
    } catch (error) {
      console.error("recovery snapshot failed", error);
    }
  }, [controller, recovery]);

  useEffect(() => {
    if (!controller) return;
    return controller.onDirty(() => {
      if (!docRef.current.dirty) setDoc((d) => ({ ...d, dirty: true }));
      const now = Date.now();
      firstPendingEdit.current ??= now;
      window.clearTimeout(snapshotTimer.current);
      const wait = Math.max(0, Math.min(SNAPSHOT_DELAY_MS, firstPendingEdit.current + SNAPSHOT_MAX_WAIT_MS - now));
      snapshotTimer.current = window.setTimeout(() => void writeSnapshot(), wait);
    });
  }, [controller, setDoc, writeSnapshot]);

  const discardRecovery = useCallback(async () => {
    window.clearTimeout(snapshotTimer.current);
    firstPendingEdit.current = null;
    await recovery.clear().catch(() => undefined);
  }, [recovery]);

  // Offer recovery once, when the grid first becomes available.
  const recoveryChecked = useRef(false);
  useEffect(() => {
    if (!controller || recoveryChecked.current) return;
    recoveryChecked.current = true;
    void (async () => {
      const snap = await recovery.load().catch(() => null);
      if (!snap) return;
      const restore = await new Promise<boolean>((resolve) =>
        dialogs.show((close) => createElement(RecoveryDialog, { name: snap.document.name, savedAt: snap.savedAt, done: (v) => (close(), resolve(v)) })),
      );
      if (!restore) {
        await discardRecovery();
        return;
      }
      controller.load(snap.workbook);
      setDoc({
        path: snap.document.canSaveInPlace ? snap.document.path : null,
        name: snap.document.name,
        sourceKind: snap.document.sourceKind,
        dirty: true,
        issues: snap.document.issues ?? [],
        acknowledged: [],
      });
      await run("Recover", async () => `Recovered unsaved changes to ${snap.document.name}`);
    })();
  }, [controller, dialogs, recovery, run, setDoc, discardRecovery]);

  // ---- Saving ------------------------------------------------------------------

  const writeXlsx = useCallback(
    async (path: string): Promise<boolean> => {
      if (!controller || !backend) throw new Error("Saving isn't available here.");
      const snapshot = controller.snapshot();
      if (!snapshot) throw new Error("No workbook is open.");
      const formula = controller.api.getFormula();
      const { bytes, issues: exportIssues } = saveWorkbookBytes(snapshot, "xlsx", {
        moveFormula: (f, dx, dy) => formula.moveFormulaRefOffset(f, dx, dy),
      });
      const name = fileNameOf(path);
      if (!(await confirmIssues([...docRef.current.issues, ...exportIssues], name, "Save Anyway"))) return false;
      await backend.write(path, bytes);
      setDoc((d) => ({ ...d, path, name, sourceKind: "xlsx", dirty: false, issues: [] }));
      setRecent(rememberRecentFile(path));
      await discardRecovery();
      return true;
    },
    [backend, controller, confirmIssues, setDoc, discardRecovery],
  );

  const saveAsFlow = useCallback(async (): Promise<boolean> => {
    if (!backend) throw new Error("Saving files requires the MacTuxel desktop app.");
    const d = docRef.current;
    const base = d.path ? baseName(d.path) : d.sourceKind ? baseName(d.name) : d.name;
    const path = await backend.pickSave(`${base}.xlsx`, ["xlsx"]);
    if (!path) return false;
    const target = /\.xlsx$/i.test(path) ? path : `${path}.xlsx`;
    return writeXlsx(target);
  }, [backend, writeXlsx]);

  const saveFlow = useCallback(async (): Promise<boolean> => {
    const d = docRef.current;
    if (d.path) return writeXlsx(d.path);
    return saveAsFlow();
  }, [saveAsFlow, writeXlsx]);

  /** Before replacing or closing the document: Save / Don't Save / Cancel. Resolves true to proceed. */
  const ensureCanDiscard = useCallback(async (): Promise<boolean> => {
    const d = docRef.current;
    if (!d.dirty) return true;
    const choice = await askSaveChanges(d.name);
    if (choice === "cancel") return false;
    if (choice === "discard") {
      await discardRecovery();
      return true;
    }
    try {
      return await saveFlow();
    } catch (error) {
      await run("Save", () => Promise.reject(error));
      return false;
    }
  }, [askSaveChanges, discardRecovery, saveFlow, run]);

  // ---- Opening -----------------------------------------------------------------

  const loadOpened = useCallback(
    async (fileName: string, bytes: Uint8Array, path: string | null) => {
      if (!controller) throw new Error("The spreadsheet isn't ready yet.");
      const opened = openWorkbookBytes(bytes, fileName);
      controller.load(opened.workbook);
      setDoc({
        path: path && opened.canSaveInPlace ? path : null,
        name: fileName,
        sourceKind: opened.kind,
        dirty: false,
        issues: opened.issues,
        acknowledged: [],
      });
      await discardRecovery();
      if (path) setRecent(rememberRecentFile(path));
      const removed = opened.issues.filter((i) => i.effect === "removed").length;
      return removed
        ? `Opened ${fileName}. Some features aren't supported — see File ▸ Compatibility Report.`
        : `Opened ${fileName}`;
    },
    [controller, setDoc, discardRecovery],
  );

  const openPathNow = useCallback(
    async (path: string) => {
      if (!backend) throw new Error("Opening files requires the MacTuxel desktop app.");
      let bytes: Uint8Array;
      try {
        bytes = await backend.read(path);
      } catch (error) {
        setRecent(forgetRecentFile(path));
        throw new Error(`"${fileNameOf(path)}" couldn't be opened. It may have been moved, renamed or deleted. (${error instanceof Error ? error.message : String(error)})`);
      }
      return loadOpened(fileNameOf(path), bytes, path);
    },
    [backend, loadOpened],
  );

  // ---- Public actions ------------------------------------------------------------

  const newDocument = useCallback(
    () =>
      run("New", async () => {
        if (!controller || !(await ensureCanDiscard())) return;
        controller.load(createBlankWorkbook());
        setDoc(UNTITLED);
        await discardRecovery();
        return "New workbook";
      }),
    [controller, run, ensureCanDiscard, setDoc, discardRecovery],
  );

  const openDocument = useCallback(
    () =>
      run("Open", async () => {
        if (!backend) throw new Error("Opening files requires the MacTuxel desktop app.");
        if (!(await ensureCanDiscard())) return;
        const path = await backend.pickOpen();
        if (!path) return;
        return openPathNow(path);
      }),
    [backend, run, ensureCanDiscard, openPathNow],
  );

  const openRecent = useCallback(
    (path: string) =>
      run("Open", async () => {
        if (!(await ensureCanDiscard())) return;
        return openPathNow(path);
      }),
    [run, ensureCanDiscard, openPathNow],
  );

  const openBytes = useCallback(
    (fileName: string, bytes: Uint8Array) =>
      run("Open", async () => {
        if (!fileKindOf(fileName)) throw new Error(`MacTuxel can't open "${fileName}".`);
        if (!(await ensureCanDiscard())) return;
        return loadOpened(fileName, bytes, null);
      }),
    [run, ensureCanDiscard, loadOpened],
  );

  const saveDocument = useCallback(
    () =>
      run("Save", async () => {
        if (!(await saveFlow())) return;
        return `Saved ${docRef.current.name}`;
      }),
    [run, saveFlow],
  );

  const saveDocumentAs = useCallback(
    () =>
      run("Save", async () => {
        if (!(await saveAsFlow())) return;
        return `Saved ${docRef.current.name}`;
      }),
    [run, saveAsFlow],
  );

  const exportCsv = useCallback(
    () =>
      run("Export", async () => {
        if (!controller || !backend) throw new Error("Exporting requires the MacTuxel desktop app.");
        const snapshot = controller.snapshot();
        if (!snapshot) throw new Error("No workbook is open.");
        const sheetName = controller.api.getActiveWorkbook()?.getActiveSheet().getSheetName();
        const d = docRef.current;
        const base = d.path ? baseName(d.path) : baseName(d.name);
        const path = await backend.pickSave(`${base}${sheetName && snapshot.sheetOrder.length > 1 ? ` - ${sheetName}` : ""}.csv`, ["csv"]);
        if (!path) return;
        const target = /\.csv$/i.test(path) ? path : `${path}.csv`;
        const { bytes, issues } = saveWorkbookBytes(snapshot, "csv" as SaveKind, { activeSheetName: sheetName });
        if (!(await confirmIssues(issues, fileNameOf(target), "Export"))) return;
        await backend.write(target, bytes);
        return `Exported "${sheetName}" to ${fileNameOf(target)}`;
      }),
    [backend, controller, run, confirmIssues],
  );

  const clearRecent = useCallback(() => setRecent(clearRecentFiles()), []);

  const showCompatibilityReport = useCallback(() => {
    const d = docRef.current;
    dialogs.show((close) => createElement(CompatibilityReport, { issues: d.issues, fileName: d.name, close }));
  }, [dialogs]);

  // ---- Close / quit guard ------------------------------------------------------

  useEffect(() => guardWindowClose(() => docRef.current.dirty, ensureCanDiscard), [ensureCanDiscard]);

  // ---- Drag and drop -------------------------------------------------------------

  useEffect(
    () =>
      listenForFileDrops({
        onEnter: (paths) => setDropActive(paths.some((p) => fileKindOf(p))),
        onLeave: () => setDropActive(false),
        onDrop: (paths) => {
          setDropActive(false);
          const supported = paths.filter((p) => fileKindOf(p));
          void run("Open", async () => {
            if (!supported.length) throw new Error(`MacTuxel can't open ${paths.length === 1 ? `"${fileNameOf(paths[0])}"` : "those files"}.`);
            if (!(await ensureCanDiscard())) return;
            const message = await openPathNow(supported[0]);
            return supported.length > 1 ? `${message} (opened the first of ${supported.length} files)` : message;
          });
        },
      }),
    [run, ensureCanDiscard, openPathNow],
  );

  return {
    doc,
    recent,
    canUseFiles: backend !== null,
    dropActive,
    newDocument,
    openDocument,
    openRecent,
    openBytes,
    saveDocument,
    saveDocumentAs,
    exportCsv,
    clearRecent,
    showCompatibilityReport,
  };
}
