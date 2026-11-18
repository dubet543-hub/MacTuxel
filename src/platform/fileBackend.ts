import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { OPEN_EXTENSIONS, type SaveKind } from "../io/formats";
import { fileNameOf } from "../io/workbookConvert";
import { isTauri } from "./tauri";

/** Where files come from and go to. Tauri in the app; an in-memory store in dev tests. */
export interface FileBackend {
  readonly kind: "native" | "memory";
  pickOpen(): Promise<string | null>;
  pickSave(suggestedName: string, kinds: readonly SaveKind[]): Promise<string | null>;
  read(path: string): Promise<Uint8Array>;
  write(path: string, bytes: Uint8Array): Promise<void>;
}

const FILTERS: Record<SaveKind, { name: string; extensions: string[] }> = {
  xlsx: { name: "Excel Workbook (.xlsx)", extensions: ["xlsx"] },
  csv: { name: "CSV, UTF-8 (current sheet)", extensions: ["csv"] },
};

const nativeBackend: FileBackend = {
  kind: "native",
  async pickOpen() {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Spreadsheets", extensions: [...OPEN_EXTENSIONS] }],
    });
    return typeof selected === "string" ? selected : null;
  },
  async pickSave(suggestedName, kinds) {
    return save({ defaultPath: suggestedName, filters: kinds.map((k) => FILTERS[k]) });
  },
  read: (path) => readFile(path),
  write: (path, bytes) => writeFile(path, bytes),
};

/**
 * Dev-only test harness: Playwright installs `window.__MACTUXEL_TEST_FS__`
 * before the app loads. Picker answers are queued by the test.
 */
export interface TestFileSystem {
  files: Record<string, number[]>;
  openQueue: (string | null)[];
  saveQueue: (string | null)[];
  log: string[];
}

declare global {
  interface Window {
    __MACTUXEL_TEST_FS__?: TestFileSystem;
  }
}

function memoryBackend(fs: TestFileSystem): FileBackend {
  return {
    kind: "memory",
    async pickOpen() {
      fs.log.push("pickOpen");
      return fs.openQueue.shift() ?? null;
    },
    async pickSave(suggestedName, kinds) {
      fs.log.push(`pickSave:${suggestedName}:${kinds.join(",")}`);
      return fs.saveQueue.shift() ?? null;
    },
    async read(path) {
      const data = fs.files[path];
      if (!data) throw new Error(`The file "${fileNameOf(path)}" couldn't be found. It may have been moved or deleted.`);
      return new Uint8Array(data);
    },
    async write(path, bytes) {
      fs.log.push(`write:${path}`);
      fs.files[path] = [...bytes];
    },
  };
}

/** The active backend, or null when files aren't available (plain browser preview). */
export function getFileBackend(): FileBackend | null {
  if (import.meta.env.DEV && typeof window !== "undefined" && window.__MACTUXEL_TEST_FS__) return memoryBackend(window.__MACTUXEL_TEST_FS__);
  return isTauri() ? nativeBackend : null;
}
