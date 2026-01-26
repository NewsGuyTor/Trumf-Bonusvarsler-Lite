/**
 * Adblock detection
 * Detects if user has an adblocker that might interfere with tracking
 */

import type { FetchAdapter } from "../network/types.js";
import { AD_TEST_URLS, AD_BANNER_IDS, CSP_RESTRICTED_SITES, CONFIG } from "../config/constants.js";

/**
 * Check if current site has restrictive CSP
 */
export function isCspRestrictedSite(currentHost: string): boolean {
  if (CSP_RESTRICTED_SITES.has(currentHost)) return true;
  // Check for CSP meta tag which indicates restrictive policy
  return document.querySelector('meta[http-equiv="Content-Security-Policy"]') !== null;
}

/**
 * Check if a URL is blocked (for adblock detection)
 */
async function checkUrlBlocked(fetcher: FetchAdapter, url: string): Promise<boolean> {
  return fetcher.checkUrlBlocked(url);
}

/**
 * Check if banner IDs are hidden (DOM-based detection)
 */
async function checkBannerIds(): Promise<boolean> {
  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:-9999px;top:-9999px;";

  AD_BANNER_IDS.forEach((id) => {
    const div = document.createElement("div");
    div.id = id;
    div.innerHTML = "&nbsp;";
    container.appendChild(div);
  });

  document.body.appendChild(container);

  // Give adblockers time to hide elements
  await new Promise((resolve) => setTimeout(resolve, 100));

  let blocked = false;
  AD_BANNER_IDS.forEach((id) => {
    const elem = document.getElementById(id);
    if (!elem || elem.offsetHeight === 0 || elem.offsetParent === null) {
      blocked = true;
    }
  });

  container.remove();
  return blocked;
}

/**
 * Utility to race a promise against a timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms)),
  ]);
}

/**
 * Detect if adblock is enabled
 */
export async function detectAdblock(
  fetcher: FetchAdapter,
  currentHost: string
): Promise<boolean> {
  // Skip URL checks on sites with strict CSP (causes false positives)
  const skipUrlChecks = isCspRestrictedSite(currentHost);

  try {
    const checks = await withTimeout(
      Promise.all([
        ...(skipUrlChecks ? [] : AD_TEST_URLS.map((url) => checkUrlBlocked(fetcher, url))),
        checkBannerIds(),
      ]),
      CONFIG.adblockTimeout
    );

    // If any check returns true (blocked), adblock is detected
    return checks.some((blocked) => blocked);
  } catch {
    // On timeout, assume no adblock to avoid false positives
    return false;
  }
}
