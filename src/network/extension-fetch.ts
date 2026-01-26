/**
 * Extension fetch adapter using background messaging
 */

import type { FetchAdapter } from "./types.js";

// Cross-browser compatibility
declare const globalThis: {
  browser?: typeof chrome;
  chrome?: typeof chrome;
};

const browser = globalThis.browser || globalThis.chrome!;

export class ExtensionFetch implements FetchAdapter {
  async fetchJSON<T>(url: string): Promise<T | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  async fetchFeed<T>(_primaryUrl: string, _fallbackUrl?: string): Promise<T | null> {
    try {
      // Request feed from background script (handles CORS and fallback)
      const response = (await browser.runtime.sendMessage({ type: "fetchFeed" })) as {
        feed?: T;
      } | null;
      return response?.feed || null;
    } catch {
      return null;
    }
  }

  async checkUrlBlocked(url: string): Promise<boolean> {
    try {
      await fetch(url, { mode: "no-cors" });
      // With no-cors, we can't read the response, but if we get here, it wasn't blocked
      return false;
    } catch {
      return true;
    }
  }
}

// Singleton instance
let instance: ExtensionFetch | null = null;

export function getExtensionFetch(): ExtensionFetch {
  if (!instance) {
    instance = new ExtensionFetch();
  }
  return instance;
}
