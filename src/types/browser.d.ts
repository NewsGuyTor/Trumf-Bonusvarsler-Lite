/**
 * Shared browser type declarations for cross-browser compatibility
 */

// Augment the global scope with browser APIs
declare global {
  // eslint-disable-next-line no-var
  var browser: typeof chrome | undefined;
}

export {};
