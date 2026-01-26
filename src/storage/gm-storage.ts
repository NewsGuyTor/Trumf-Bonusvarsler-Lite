/**
 * Greasemonkey/Tampermonkey storage adapter using GM.getValue/setValue
 */

import type { StorageAdapter } from "./types.js";
import { LocalSessionStorage, getLocalSessionStorage } from "./local-session-storage.js";

// GM API declarations
declare function GM_getValue<T>(key: string, defaultValue: T): T;
declare function GM_setValue(key: string, value: unknown): void;
declare function GM_deleteValue(key: string): void;
declare const GM: {
  getValue<T>(key: string, defaultValue?: T): Promise<T>;
  setValue(key: string, value: unknown): Promise<void>;
  deleteValue(key: string): Promise<void>;
};

export class GMStorage implements StorageAdapter {
  async get<T>(key: string, defaultValue: T): Promise<T> {
    try {
      // Try GM.getValue first (async), fall back to GM_getValue (sync)
      if (typeof GM !== "undefined" && GM.getValue) {
        const value = await GM.getValue(key, defaultValue);
        return value as T;
      } else if (typeof GM_getValue === "function") {
        return GM_getValue(key, defaultValue) as T;
      }
      return defaultValue;
    } catch {
      return defaultValue;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    try {
      if (typeof GM !== "undefined" && GM.setValue) {
        await GM.setValue(key, value);
      } else if (typeof GM_setValue === "function") {
        GM_setValue(key, value);
      }
    } catch {
      // Storage unavailable, fail silently
    }
  }

  async remove(keys: string[]): Promise<void> {
    try {
      if (typeof GM !== "undefined" && GM.deleteValue) {
        // Parallel delete using async API
        await Promise.all(keys.map((key) => GM.deleteValue(key)));
      } else if (typeof GM_deleteValue === "function") {
        // Sync API - sequential delete
        for (const key of keys) {
          GM_deleteValue(key);
        }
      }
    } catch {
      // Fail silently
    }
  }
}

// Re-export LocalSessionStorage for backwards compatibility
export { LocalSessionStorage };

// Singleton instance
let gmStorageInstance: GMStorage | null = null;

export function getGMStorage(): GMStorage {
  if (!gmStorageInstance) {
    gmStorageInstance = new GMStorage();
  }
  return gmStorageInstance;
}

export function getSessionStorage(): LocalSessionStorage {
  return getLocalSessionStorage();
}

// Alias for GM-specific naming
export const getGMSessionStorage = getSessionStorage;
