/**
 * Storage adapter interface
 * Abstracts browser.storage.local and GM.getValue/setValue
 */

export interface StorageAdapter {
  /**
   * Get a value from storage
   * @param key - Storage key
   * @param defaultValue - Default value if key doesn't exist
   * @returns The stored value or default
   */
  get<T>(key: string, defaultValue: T): Promise<T>;

  /**
   * Set a value in storage
   * @param key - Storage key
   * @param value - Value to store
   */
  set(key: string, value: unknown): Promise<void>;

  /**
   * Remove multiple keys from storage
   * @param keys - Array of keys to remove
   */
  remove(keys: string[]): Promise<void>;
}

/**
 * Session storage adapter interface (for localStorage)
 * Used for per-site session data that doesn't need cross-site sync
 */
export interface SessionStorageAdapter {
  /**
   * Get a session value
   */
  get(key: string): string | null;

  /**
   * Set a session value
   */
  set(key: string, value: string): void;
}
