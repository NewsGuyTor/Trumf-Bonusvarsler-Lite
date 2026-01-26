/**
 * Extension storage adapter using browser.storage.local
 */

import type { StorageAdapter, SessionStorageAdapter } from "./types.js";

// Cross-browser compatibility
declare const globalThis: {
  browser?: typeof chrome;
  chrome?: typeof chrome;
};

const browser = globalThis.browser || globalThis.chrome!;

export class ExtensionStorage implements StorageAdapter {
  async get<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const result = await browser.storage.local.get(key);
      return result[key] !== undefined ? (result[key] as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    try {
      await browser.storage.local.set({ [key]: value });
    } catch {
      // Storage unavailable or full, fail silently
    }
  }

  async remove(keys: string[]): Promise<void> {
    try {
      await browser.storage.local.remove(keys);
    } catch {
      // Fail silently
    }
  }
}

/**
 * Session storage using localStorage
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
let extensionStorage: ExtensionStorage | null = null;
let sessionStorage: LocalSessionStorage | null = null;

export function getExtensionStorage(): ExtensionStorage {
  if (!extensionStorage) {
    extensionStorage = new ExtensionStorage();
  }
  return extensionStorage;
}

export function getSessionStorage(): LocalSessionStorage {
  if (!sessionStorage) {
    sessionStorage = new LocalSessionStorage();
  }
  return sessionStorage;
}

// Alias for extension-specific naming
export const getExtensionSessionStorage = getSessionStorage;
