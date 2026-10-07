import { STORAGE_KEYS } from "../config/storage-keys.ts";

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

/** Collapse preference survives reloads; a blocked storage keeps the expanded default. */
export function readSidebarCollapsed(storage?: StorageReader): boolean {
  try {
    return (storage ?? globalThis.localStorage)?.getItem(STORAGE_KEYS.sidebarCollapsed) === "1";
  } catch {
    return false;
  }
}

export function persistSidebarCollapsed(collapsed: boolean, storage?: StorageWriter): void {
  try {
    (storage ?? globalThis.localStorage)?.setItem(STORAGE_KEYS.sidebarCollapsed, collapsed ? "1" : "0");
  } catch {
    // Storage can be blocked; the in-memory choice still applies for this session.
  }
}
