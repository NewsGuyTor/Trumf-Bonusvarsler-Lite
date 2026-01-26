/**
 * i18n types
 */

export interface MessageEntry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

export type Messages = Record<string, MessageEntry>;

export interface I18nAdapter {
  /**
   * Get a localized message
   */
  getMessage(key: string, substitutions?: string | string[]): string;

  /**
   * Load messages for a specific language
   */
  loadMessages(lang: string): Promise<void>;
}
