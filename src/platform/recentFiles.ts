import { fileNameOf } from "../io/workbookConvert";

export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
}

export const RECENT_FILES_KEY = "mactuxel.recentFiles";
export const MAX_RECENT_FILES = 10;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadRecentFiles(store: Storage | undefined = storage()): RecentFile[] {
  try {
    const raw = JSON.parse(store?.getItem(RECENT_FILES_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r): r is RecentFile => typeof r?.path === "string" && typeof r?.name === "string")
      .slice(0, MAX_RECENT_FILES);
  } catch {
    return [];
  }
}

function persist(list: RecentFile[], store: Storage | undefined) {
  try {
    store?.setItem(RECENT_FILES_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: the list just won't persist */
  }
  return list;
}

/** Moves (or adds) a path to the top of the list. */
export function rememberRecentFile(path: string, now = Date.now(), store: Storage | undefined = storage()): RecentFile[] {
  const list = loadRecentFiles(store).filter((r) => r.path !== path);
  list.unshift({ path, name: fileNameOf(path), openedAt: now });
  return persist(list.slice(0, MAX_RECENT_FILES), store);
}

export function forgetRecentFile(path: string, store: Storage | undefined = storage()): RecentFile[] {
  return persist(loadRecentFiles(store).filter((r) => r.path !== path), store);
}

export function clearRecentFiles(store: Storage | undefined = storage()): RecentFile[] {
  return persist([], store);
}
