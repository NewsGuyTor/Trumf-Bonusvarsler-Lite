/**
 * Storage exports
 */

export type { StorageAdapter, SessionStorageAdapter } from "./types.js";
export { ExtensionStorage, getExtensionStorage, getSessionStorage as getExtensionSessionStorage } from "./extension-storage.js";
export { GMStorage, getGMStorage, getSessionStorage as getGMSessionStorage } from "./gm-storage.js";
