/**
 * Global type declarations for BonusVarsler
 */

// CSS module declarations
declare module "*.css" {
  const content: string;
  export default content;
}

// Chrome/Browser extension types
declare namespace chrome {
  namespace storage {
    interface StorageArea {
      get(keys: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    }
    const local: StorageArea;
  }

  namespace runtime {
    function getURL(path: string): string;
    function sendMessage(message: unknown): Promise<unknown>;
  }
}

// Global browser object (Firefox/Edge)
declare const browser: typeof chrome | undefined;
