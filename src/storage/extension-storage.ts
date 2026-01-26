/**
 * Extension storage adapter using browser.storage.local
 */

import type { StorageAdapter } from "./types.js";
import { LocalSessionStorage, getLocalSessionStorage } from "./local-session-storage.js";

// Use browser API (Firefox) or chrome API (Chrome/Edge)
const browserAPI = (typeof browser !== "undefined" ? browser : chrome);

export class ExtensionStorage implements StorageAdapter {
  async get<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const result = await browserAPI.storage.local.get(key);
      return result[key] !== undefined ? (result[key] as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    try {
      await browserAPI.storage.local.set({ [key]: value });
    } catch {
      // Storage unavailable or full, fail silently
    }
  }

  async remove(keys: string[]): Promise<void> {
    try {
      await browserAPI.storage.local.remove(keys);
    } catch {
      // Fail silently
    }
  }
}

// Re-export LocalSessionStorage for backwards compatibility
export { LocalSessionStorage };

// Singleton instance
let extensionStorageInstance: ExtensionStorage | null = null;

export function getExtensionStorage(): ExtensionStorage {
  if (!extensionStorageInstance) {
    extensionStorageInstance = new ExtensionStorage();
  }
  return extensionStorageInstance;
}

export function getSessionStorage(): LocalSessionStorage {
  return getLocalSessionStorage();
}

// Alias for extension-specific naming
export const getExtensionSessionStorage = getSessionStorage;
