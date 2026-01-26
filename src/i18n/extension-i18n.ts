/**
 * Extension i18n adapter
 * Loads messages from _locales/
 */

import type { I18nAdapter, Messages } from "./types.js";

// Cross-browser compatibility
declare const globalThis: {
  browser?: typeof chrome;
  chrome?: typeof chrome;
};

const browser = globalThis.browser || globalThis.chrome!;

export class ExtensionI18n implements I18nAdapter {
  private messages: Messages = {};

  async loadMessages(lang: string): Promise<void> {
    try {
      const url = browser.runtime.getURL(`_locales/${lang}/messages.json`);
      const response = await fetch(url);
      this.messages = await response.json();
    } catch {
      this.messages = {};
    }
  }

  getMessage(key: string, substitutions?: string | string[]): string {
    const entry = this.messages[key];
    if (!entry || !entry.message) {
      return key;
    }

    let msg = entry.message;

    // Handle substitutions
    if (substitutions !== undefined) {
      const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
      subs.forEach((sub, index) => {
        const placeholder = `$${index + 1}`;
        msg = msg.replace(placeholder, sub);
        // Also handle named placeholders
        if (entry.placeholders) {
          for (const [name, config] of Object.entries(entry.placeholders)) {
            if (config.content === placeholder) {
              msg = msg.replace(new RegExp(`\\$${name.toUpperCase()}\\$`, "g"), sub);
            }
          }
        }
      });
    }

    return msg;
  }
}

// Singleton instance
let instance: ExtensionI18n | null = null;

export function getExtensionI18n(): ExtensionI18n {
  if (!instance) {
    instance = new ExtensionI18n();
  }
  return instance;
}
