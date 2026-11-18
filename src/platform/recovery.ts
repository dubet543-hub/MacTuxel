import { invoke } from "@tauri-apps/api/core";
import type { IWorkbookData } from "@univerjs/presets";
import type { CompatIssue } from "../io/compatibility";
import type { FileKind } from "../io/formats";
import { isTauri } from "./tauri";

/** What's needed to put an unsaved document back exactly as it was. */
export interface RecoverySnapshot {
  version: 1;
  savedAt: number;
  document: {
    path: string | null;
    name: string;
    sourceKind: FileKind | null;
    canSaveInPlace: boolean;
    issues: CompatIssue[];
  };
  workbook: IWorkbookData;
}

export interface RecoveryStore {
  save(snapshot: RecoverySnapshot): Promise<void>;
  load(): Promise<RecoverySnapshot | null>;
  clear(): Promise<void>;
}

const LOCAL_KEY = "mactuxel.recovery";

function parse(text: string | null): RecoverySnapshot | null {
  if (!text) return null;
  try {
    const snap = JSON.parse(text) as RecoverySnapshot;
    return snap?.version === 1 && snap.workbook?.sheetOrder ? snap : null;
  } catch {
    return null;
  }
}

/** Desktop: a file in the app's local data folder (written atomically by Rust). */
const nativeStore: RecoveryStore = {
  save: (snapshot) => invoke("recovery_save", { snapshot: JSON.stringify(snapshot) }),
  load: async () => parse(await invoke<string | null>("recovery_load")),
  clear: () => invoke("recovery_clear"),
};

/** Browser preview and tests: localStorage. */
const localStore: RecoveryStore = {
  async save(snapshot) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot));
    } catch {
      /* quota or blocked: recovery just isn't available */
    }
  },
  async load() {
    try {
      return parse(localStorage.getItem(LOCAL_KEY));
    } catch {
      return null;
    }
  },
  async clear() {
    try {
      localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* ignore */
    }
  },
};

export function getRecoveryStore(): RecoveryStore {
  return isTauri() ? nativeStore : localStore;
}
