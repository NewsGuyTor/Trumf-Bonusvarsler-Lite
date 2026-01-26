/**
 * Session storage using localStorage
 * Shared between extension and userscript platforms
 * Used for per-site session data that doesn't need cross-site sync
 */

import type { SessionStorageAdapter } from "./types.js";

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

// Singleton instance
let localSessionStorageInstance: LocalSessionStorage | null = null;

export function getLocalSessionStorage(): LocalSessionStorage {
  if (!localSessionStorageInstance) {
    localSessionStorageInstance = new LocalSessionStorage();
  }
  return localSessionStorageInstance;
}
