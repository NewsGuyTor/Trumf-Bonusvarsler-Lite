/**
 * Greasemonkey/Tampermonkey storage adapter using GM.getValue/setValue
 */

import type { StorageAdapter, SessionStorageAdapter } from "./types.js";

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
      for (const key of keys) {
        if (typeof GM !== "undefined" && GM.deleteValue) {
          await GM.deleteValue(key);
        } else if (typeof GM_deleteValue === "function") {
          GM_deleteValue(key);
        }
      }
    } catch {
      // Fail silently
    }
  }
}

/**
 * Session storage using localStorage (same for userscript)
 * Used for per-site session data
 */
export class LocalSessionStorage implements SessionStorageAdapter {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage blocked on this site, fail silently
    }
  }
}

// Singleton instances
let gmStorage: GMStorage | null = null;
let sessionStorage: LocalSessionStorage | null = null;

export function getGMStorage(): GMStorage {
  if (!gmStorage) {
    gmStorage = new GMStorage();
  }
  return gmStorage;
}

export function getSessionStorage(): LocalSessionStorage {
  if (!sessionStorage) {
    sessionStorage = new LocalSessionStorage();
  }
  return sessionStorage;
}

// Alias for GM-specific naming
export const getGMSessionStorage = getSessionStorage;
