(function () {
  "use strict";

  // Cross-browser compatibility
  const browser = globalThis.browser || globalThis.chrome;

  // Messages cache for i18n
  let messages = {};

  // Load messages for a specific language
  async function loadMessages(lang) {
    try {
      const url = browser.runtime.getURL(`_locales/${lang}/messages.json`);
      const response = await fetch(url);
      return await response.json();
    } catch {
      return {};
    }
  }

  // i18n helper with placeholder support
  function i18n(messageName, substitutions) {
    const entry = messages[messageName];
    if (!entry || !entry.message) {
      return messageName;
    }

    let msg = entry.message;

    // Handle substitutions
    if (substitutions !== undefined) {
      const subs = Array.isArray(substitutions)
        ? substitutions
        : [substitutions];
      subs.forEach((sub, index) => {
        const placeholder = `$${index + 1}`;
        msg = msg.replace(placeholder, sub);
        // Also handle named placeholders
        if (entry.placeholders) {
          for (const [name, config] of Object.entries(entry.placeholders)) {
            if (config.content === placeholder) {
              msg = msg.replace(
                new RegExp(`\\$${name.toUpperCase()}\\$`, "g"),
                sub,
              );
            }
          }
        }
      });
    }

    return msg;
  }

  // ===================
  // Ultra-early bailouts (before any async work)
  // ===================

  // Skip iframes entirely
  if (window.top !== window.self) return;

  const currentHost = window.location.hostname;
  const messageShownKey = `BonusVarsler_MessageShown_${currentHost}`;

  // Check cheap sync storage before any extension API calls
  try {
    const messageShownTime = localStorage.getItem(messageShownKey);
    if (messageShownTime) {
      const elapsed = Date.now() - parseInt(messageShownTime, 10);
      if (elapsed < 10 * 60 * 1000) return; // 10 minute cooldown
    }
  } catch {
    // Storage blocked on this site, continue anyway
  }

  // ===================
  // Configuration
  // ===================
  const CONFIG = {
    feedUrl: "https://raw.githubusercontent.com/kristofferR/BonusVarsler/main/sitelist.json",
    fallbackUrl: "https://wlp.tcb-cdn.com/trumf/notifierfeed.json",
    cacheKey: "BonusVarsler_FeedData_v4",
    cacheTimeKey: "BonusVarsler_FeedTime_v4",
    hostIndexKey: "BonusVarsler_HostIndex_v4",
    cacheDuration: 48 * 60 * 60 * 1000, // 48 hours
    messageDuration: 10 * 60 * 1000, // 10 minutes
    maxRetries: 5,
    retryDelays: [100, 500, 1000, 2000, 4000], // Exponential backoff
    adblockTimeout: 3000, // 3 seconds timeout for adblock checks
  };

  // ===================
  // Service Registry
  // ===================
  const SERVICES = {
    trumf: {
      id: "trumf",
      name: "Trumf",
      clickthroughUrl: "https://trumfnetthandel.no/cashback/{urlName}",
      reminderDomain: "trumfnetthandel.no",
      color: "#E31837",
      defaultEnabled: true,
    },
    remember: {
      id: "remember",
      name: "re:member",
      clickthroughUrl: "https://remember.no/shop/{urlName}",
      reminderDomain: "remember.no",
      color: "#00A0D2",
      defaultEnabled: false,
    },
  };

  // Domain aliases: maps redirect targets to feed domains
  // Key = domain user visits, Value = domain in feed
  const DOMAIN_ALIASES = {
    "nordicfeel.com": "nordicfeel.no",
    "www.nordicfeel.com": "www.nordicfeel.no",
    "lekmer.com": "lekmer.no",
    "www.lekmer.com": "lekmer.no",
    "lyko.com": "lyko.no",
    "www.lyko.com": "www.lyko.no",
    "storytel.com": "storytel.no",
    "www.storytel.com": "www.storytel.no",
    "beckmann-norway.com": "beckmann.no",
    "www.beckmann-norway.com": "beckmann.no",
    "nordicnest.no": "id.nordicnest.no",
    "www.nordicnest.no": "id.nordicnest.no",
    "dbjourney.com": "dbjourney.no",
    "www.dbjourney.com": "dbjourney.no",
    "bookbeat.com": "bookbeat.no",
    "www.bookbeat.com": "www.bookbeat.no",
    "www.oakley.com": "no.oakley.com",
    "www.viator.com": "www.viatorcom.no",
    "www.scandichotels.com": "www.scandichotels.no",
    "www.omio.com": "www.omio.no",
    "trip.com": "www.trip.com",
    "no.trip.com": "www.trip.com",
  };

  const hiddenSitesKey = "BonusVarsler_HiddenSites";
  const themeKey = "BonusVarsler_Theme";
  const startMinimizedKey = "BonusVarsler_StartMinimized";
  const positionKey = "BonusVarsler_Position";
  const sitePositionsKey = "BonusVarsler_SitePositions";
  const reminderShownKey = "BonusVarsler_ReminderShown";
  const languageKey = "BonusVarsler_Language";
  const enabledServicesKey = "BonusVarsler_EnabledServices";

  // Legacy v3 storage keys for migration
  const LEGACY_KEYS = {
    feedData: "BonusVarsler_FeedData_v3",
    feedTime: "BonusVarsler_FeedTime_v3",
    hostIndex: "BonusVarsler_HostIndex_v3",
  };

  // Logo icon as data URI (64px for 2x retina, displayed at 32px)
  const LOGO_ICON_URL =
    "data:image/png;base64,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";

  // SVG icons as data URIs
  const SETTINGS_ICON_URI =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    );

  // Shared CSS for notification UI
  const BASE_CSS = `
        :host {
            all: initial;
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 15px;
            line-height: 1.6;
            --bg: #fff;
            --bg-header: #f3f3f3;
            --border: #ececec;
            --text: #333;
            --text-muted: #666;
            --accent: #4D4DFF;
            --accent-hover: #3232ff;
            --shadow: rgba(0,0,0,0.3);
            --info-bg: #ccc;
            --btn-bg: #e8e8e8;
            --btn-bg-active: #4D4DFF;
            color: var(--text);
        }
        :host(.tbvl-dark) {
            --bg: #1e1e1e;
            --bg-header: #2d2d2d;
            --border: #404040;
            --text: #e0e0e0;
            --text-muted: #999;
            --accent: #8c8cff;
            --accent-hover: #7a7aff;
            --shadow: rgba(0,0,0,0.5);
            --info-bg: #555;
            --btn-bg: #404040;
            --btn-bg-active: #8c8cff;
        }
        @media (prefers-color-scheme: dark) {
            :host(.tbvl-system) {
                --bg: #1e1e1e;
                --bg-header: #2d2d2d;
                --border: #404040;
                --text: #e0e0e0;
                --text-muted: #999;
                --accent: #6b6bff;
                --accent-hover: #5252ff;
                --shadow: rgba(0,0,0,0.5);
                --info-bg: #555;
                --btn-bg: #404040;
                --btn-bg-active: #8c8cff;
            }
        }
        :host *,
        :host *::before,
        :host *::after {
            all: revert;
            box-sizing: border-box;
            font-family: 'Segoe UI', system-ui, sans-serif !important;
            font-size: inherit;
            line-height: inherit;
            letter-spacing: normal;
            word-spacing: normal;
            text-transform: none;
            text-indent: 0;
            text-shadow: none;
            text-decoration: none;
            text-align: left;
            white-space: normal;
            font-style: normal;
            font-weight: normal;
            font-variant: normal;
            color: inherit;
            background: transparent;
            border: none;
            margin: 0;
            padding: 0;
            outline: none;
            vertical-align: baseline;
            float: none;
            clear: none;
            direction: ltr;
            visibility: visible;
            opacity: 1;
            filter: none;
            transform: none;
            pointer-events: auto;
        }
        .container {
            position: fixed;
            z-index: 2147483647;
            width: 360px;
            max-width: calc(100vw - 40px);
            background: var(--bg);
            border-radius: 8px;
            box-shadow: 0 8px 24px var(--shadow);
            overflow: hidden;
            transition: top 0.3s ease, bottom 0.3s ease, left 0.3s ease, right 0.3s ease;
        }
        .container.animate-in {
            animation: slideIn 0.4s ease-out;
        }
        .container.dragging {
            transition: none;
            opacity: 0.9;
        }
        .container.snapping {
            transition: left 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                        top 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        .container.bottom-right { bottom: 20px; right: 20px; }
        .container.bottom-left { bottom: 20px; left: 20px; }
        .container.top-right { top: 20px; right: 20px; }
        .container.top-left { top: 20px; left: 20px; }
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(40px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: var(--bg-header);
            border-bottom: 1px solid var(--border);
            user-select: none;
        }
        .logo {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 18px;
            font-weight: 700;
            color: var(--text);
            letter-spacing: -0.5px;
        }
        .logo-icon {
            display: inline-block;
            width: 32px;
            height: 32px;
            flex-shrink: 0;
            object-fit: contain;
        }
        .close-btn {
            width: 22px;
            height: 22px;
            cursor: pointer;
            transition: transform 0.2s;
            position: relative;
            border: none;
            background: transparent;
            padding: 0;
        }
        .close-btn::before,
        .close-btn::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 16px;
            height: 2px;
            background: var(--text-muted);
            border-radius: 1px;
        }
        .close-btn::before {
            transform: translate(-50%, -50%) rotate(45deg);
        }
        .close-btn::after {
            transform: translate(-50%, -50%) rotate(-45deg);
        }
        .close-btn:hover {
            transform: scale(1.15);
        }
        .close-btn:hover::before,
        .close-btn:hover::after {
            background: var(--text);
        }
        .body {
            padding: 16px;
        }
    `;

  // ===================
  // Utility Functions
  // ===================

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), ms),
      ),
    ]);
  }

  // ===================
  // Browser Storage (Cross-Site Settings)
  // ===================

  async function getValue(key, defaultValue) {
    try {
      const result = await browser.storage.local.get(key);
      return result[key] !== undefined ? result[key] : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  async function setValue(key, value) {
    try {
      await browser.storage.local.set({ [key]: value });
    } catch {
      // Storage unavailable or full, fail silently
    }
  }

  // Settings cache (loaded at init, used synchronously)
  let settingsCache = {
    hiddenSites: new Set(),
    theme: "system",
    startMinimized: false,
    position: "bottom-right", // default position
    sitePositions: {}, // per-site position overrides
    enabledServices: null, // loaded from storage or defaults
  };

  // Get default enabled services from SERVICES registry
  function getDefaultEnabledServices() {
    return Object.values(SERVICES)
      .filter((s) => s.defaultEnabled)
      .map((s) => s.id);
  }

  // Migrate from v3 to v4 storage format
  async function migrateFromV3() {
    try {
      // Check if we have old v3 data
      const oldFeedData = await getValue(LEGACY_KEYS.feedData, null);
      if (!oldFeedData) return; // No migration needed

      // Clear old v3 cache keys (they're incompatible with new format)
      await browser.storage.local.remove([
        LEGACY_KEYS.feedData,
        LEGACY_KEYS.feedTime,
        LEGACY_KEYS.hostIndex,
      ]);

      // For existing users, set enabled services to just Trumf
      // to preserve their current experience
      const existingEnabled = await getValue(enabledServicesKey, null);
      if (!existingEnabled) {
        await setValue(enabledServicesKey, ["trumf"]);
      }
    } catch {
      // Migration failed, continue anyway
    }
  }

  async function loadSettings() {
    // Run migration first
    await migrateFromV3();
    const hiddenSitesArray = await getValue(hiddenSitesKey, []);
    settingsCache.hiddenSites = new Set(hiddenSitesArray);
    settingsCache.theme = await getValue(themeKey, "system");
    settingsCache.startMinimized = await getValue(startMinimizedKey, false);
    settingsCache.position = await getValue(positionKey, "bottom-right");
    settingsCache.sitePositions = await getValue(sitePositionsKey, {});

    // Load enabled services (default to services marked as defaultEnabled)
    const storedServices = await getValue(enabledServicesKey, null);
    settingsCache.enabledServices = storedServices || getDefaultEnabledServices();

    // Load language preference and messages
    const lang = await getValue(languageKey, "no");
    messages = await loadMessages(lang);
  }

  // ===================
  // Enabled Services Management
  // ===================

  function getEnabledServices() {
    return settingsCache.enabledServices || getDefaultEnabledServices();
  }

  function isServiceEnabled(serviceId) {
    return getEnabledServices().includes(serviceId);
  }

  // ===================
  // Hidden Sites Management
  // ===================

  function getHiddenSites() {
    return settingsCache.hiddenSites;
  }

  async function hideSite(host) {
    if (!settingsCache.hiddenSites.has(host)) {
      settingsCache.hiddenSites.add(host);
      await setValue(hiddenSitesKey, [...settingsCache.hiddenSites]);
    }
  }

  async function resetHiddenSites() {
    settingsCache.hiddenSites = new Set();
    await setValue(hiddenSitesKey, []);
  }

  function isSiteHidden(host) {
    return settingsCache.hiddenSites.has(host);
  }

  // ===================
  // Theme Management
  // ===================

  function getTheme() {
    return settingsCache.theme;
  }

  async function setTheme(theme) {
    settingsCache.theme = theme;
    await setValue(themeKey, theme);
  }

  // ===================
  // Start Minimized Management
  // ===================

  function getStartMinimized() {
    return settingsCache.startMinimized;
  }

  async function setStartMinimized(value) {
    settingsCache.startMinimized = value;
    await setValue(startMinimizedKey, value);
  }

  // ===================
  // Position Management
  // ===================

  function getPosition() {
    // Check for site-specific override first, then fall back to default
    return settingsCache.sitePositions[currentHost] || settingsCache.position;
  }

  function getDefaultPosition() {
    return settingsCache.position;
  }

  async function setDefaultPosition(position) {
    settingsCache.position = position;
    await setValue(positionKey, position);
  }

  async function setPositionForSite(position) {
    settingsCache.sitePositions[currentHost] = position;
    await setValue(sitePositionsKey, settingsCache.sitePositions);
  }

  // ===================
  // Early Exit Checks
  // ===================

  // Note: Session closed and message cooldown checks are done at the very top
  // of the IIFE (before any async work) for maximum performance.
  function shouldSkipNotification() {
    // Check if site is permanently hidden (requires settings cache)
    return isSiteHidden(currentHost);
  }

  // ===================
  // Feed Management (browser storage - shared across all sites)
  // ===================

  async function getCachedFeed() {
    const storedTime = await getValue(CONFIG.cacheTimeKey, null);
    if (!storedTime) {
      return null;
    }

    const elapsed = Date.now() - storedTime;
    if (elapsed >= CONFIG.cacheDuration) {
      return null;
    }

    const storedData = await getValue(CONFIG.cacheKey, null);
    return isValidFeed(storedData) ? storedData : null;
  }

  function isValidFeed(feed) {
    // Support both old format (just merchants) and new format (services + merchants)
    return (
      feed && typeof feed.merchants === "object" && feed.merchants !== null
    );
  }

  // Check if feed is in new unified format (has services and offers arrays)
  function isUnifiedFeedFormat(feed) {
    return feed && feed.services && typeof feed.services === "object";
  }

  async function cacheFeed(data) {
    try {
      await setValue(CONFIG.cacheKey, data);
      await setValue(CONFIG.cacheTimeKey, Date.now());
      // Cache host index for fast lookups
      if (data?.merchants) {
        await setValue(CONFIG.hostIndexKey, Object.keys(data.merchants));
      }
    } catch {
      // Storage full or unavailable, continue without caching
    }
  }

  async function fetchFeedFromBackground() {
    try {
      const response = await browser.runtime.sendMessage({ type: "fetchFeed" });
      return response?.feed || null;
    } catch {
      return null;
    }
  }

  async function getFeed() {
    // Try cache first
    const cached = await getCachedFeed();
    if (cached) {
      return cached;
    }

    // Skip network requests if offline
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      // Request feed from background (will try bundled fallback)
      const feed = await fetchFeedFromBackground();
      return feed;
    }

    // Request feed from background script (handles CORS)
    const feed = await fetchFeedFromBackground();
    if (feed) {
      await cacheFeed(feed);
      return feed;
    }

    return null;
  }

  // ===================
  // Quick Host Check (avoids full feed parse for non-merchants)
  // ===================

  async function isKnownMerchantHost() {
    const hostIndex = await getValue(CONFIG.hostIndexKey, null);
    if (!hostIndex) {
      // No index yet, need full check
      return null;
    }

    const hostSet = new Set(hostIndex);
    const noWww = currentHost.replace(/^www\./, "");

    // Check direct matches
    if (
      hostSet.has(currentHost) ||
      hostSet.has(noWww) ||
      hostSet.has("www." + noWww)
    ) {
      return true;
    }

    // Check domain aliases
    const aliasedHost = DOMAIN_ALIASES[currentHost];
    if (aliasedHost && hostSet.has(aliasedHost)) {
      return true;
    }

    const aliasedNoWww = DOMAIN_ALIASES[noWww];
    if (aliasedNoWww && hostSet.has(aliasedNoWww)) {
      return true;
    }

    return false;
  }

  // ===================
  // Cashback Rate Parsing & Comparison
  // ===================

  /**
   * Parse a cashback description into a comparable value
   * Handles: "5,4%", "Opptil 4,6%", "35kr", "Opptil 290kr"
   * @returns {{ value: number, type: 'percent'|'fixed', isVariable: boolean }}
   */
  function parseCashbackRate(description) {
    if (!description) return { value: 0, type: "percent", isVariable: false };

    const isVariable = description.toLowerCase().startsWith("opptil");
    const cleanDesc = description.replace(/opptil\s*/i, "").trim();

    // Check for percentage (e.g., "5,4%")
    const percentMatch = cleanDesc.match(/(\d+[,.]?\d*)\s*%/);
    if (percentMatch) {
      const value = parseFloat(percentMatch[1].replace(",", "."));
      return { value, type: "percent", isVariable };
    }

    // Check for fixed amount (e.g., "35kr", "290 kr")
    const fixedMatch = cleanDesc.match(/(\d+[,.]?\d*)\s*kr/i);
    if (fixedMatch) {
      const value = parseFloat(fixedMatch[1].replace(",", "."));
      return { value, type: "fixed", isVariable };
    }

    return { value: 0, type: "percent", isVariable: false };
  }

  /**
   * Compare two cashback rates for sorting (higher = better)
   * Rules:
   * - Percentage beats fixed amount (percentage is more valuable at scale)
   * - Higher value wins
   * - Non-variable ("5%") preferred over variable ("Opptil 5%") at same value
   * @returns -1 if a > b, 1 if b > a, 0 if equal
   */
  function compareCashbackRates(a, b) {
    // Percentage beats fixed
    if (a.type === "percent" && b.type === "fixed") return -1;
    if (a.type === "fixed" && b.type === "percent") return 1;

    // Higher value wins
    if (a.value > b.value) return -1;
    if (a.value < b.value) return 1;

    // At same value, non-variable preferred over variable
    if (!a.isVariable && b.isVariable) return -1;
    if (a.isVariable && !b.isVariable) return 1;

    return 0;
  }

  // ===================
  // Merchant Matching
  // ===================

  /**
   * Find merchant by host and return the best offer from enabled services
   * @param {Object} feed - The feed data
   * @returns {Object|null} - { merchant, offer, service } or null if not found
   */
  function findBestOffer(feed) {
    if (!feed?.merchants) {
      return null;
    }

    const merchants = feed.merchants;
    const enabledServices = getEnabledServices();
    const isUnified = isUnifiedFeedFormat(feed);

    // Helper to try all www variations of a host
    function tryHost(host) {
      // Exact match
      if (merchants[host]) {
        return merchants[host];
      }

      // Try without www.
      const noWww = host.replace(/^www\./, "");
      if (noWww !== host && merchants[noWww]) {
        return merchants[noWww];
      }

      // Try with www. prefix
      if (!host.startsWith("www.")) {
        const withWww = "www." + host;
        if (merchants[withWww]) {
          return merchants[withWww];
        }
      }

      return null;
    }

    // Try current host first
    let merchant = tryHost(currentHost);

    // Try domain alias if exists
    if (!merchant) {
      const aliasedHost = DOMAIN_ALIASES[currentHost];
      if (aliasedHost) {
        merchant = tryHost(aliasedHost);
      }
    }

    // Also try alias without/with www
    if (!merchant) {
      const noWwwHost = currentHost.replace(/^www\./, "");
      const aliasedNoWww = DOMAIN_ALIASES[noWwwHost];
      if (aliasedNoWww) {
        merchant = tryHost(aliasedNoWww);
      }
    }

    if (!merchant) {
      return null;
    }

    // Handle unified feed format (with offers array)
    if (isUnified && merchant.offers) {
      // Filter to enabled services only
      const availableOffers = merchant.offers.filter((offer) =>
        enabledServices.includes(offer.serviceId),
      );

      if (availableOffers.length === 0) {
        return null;
      }

      // Sort by rate (best first)
      availableOffers.sort((a, b) => {
        const rateA = parseCashbackRate(a.cashbackDescription);
        const rateB = parseCashbackRate(b.cashbackDescription);
        return compareCashbackRates(rateA, rateB);
      });

      const bestOffer = availableOffers[0];
      const service = SERVICES[bestOffer.serviceId] || SERVICES.trumf;

      return {
        merchant: {
          hostName: merchant.hostName,
          name: merchant.name,
        },
        offer: bestOffer,
        service: service,
        // Convenience accessors for backward compatibility
        name: merchant.name,
        urlName: bestOffer.urlName,
        cashbackDescription: bestOffer.cashbackDescription,
      };
    }

    // Handle old feed format (no offers array, Trumf-only)
    // This ensures backward compatibility during transition
    const service = SERVICES.trumf;
    if (!enabledServices.includes("trumf")) {
      return null;
    }

    return {
      merchant: {
        hostName: merchant.hostName,
        name: merchant.name,
      },
      offer: {
        serviceId: "trumf",
        urlName: merchant.urlName,
        cashbackDescription: merchant.cashbackDescription,
      },
      service: service,
      // Convenience accessors for backward compatibility
      name: merchant.name,
      urlName: merchant.urlName,
      cashbackDescription: merchant.cashbackDescription,
    };
  }

  // Legacy alias for backward compatibility
  function findMerchant(feed) {
    const result = findBestOffer(feed);
    return result
      ? {
          hostName: result.merchant.hostName,
          name: result.name,
          urlName: result.urlName,
          cashbackDescription: result.cashbackDescription,
        }
      : null;
  }

  // ===================
  // Adblock Detection
  // ===================

  // Sites with strict CSP that blocks our test URLs (causes false positives)
  const CSP_RESTRICTED_SITES = new Set([
    "fabel.no",
    "www.clickandboat.com",
    "www.elite.se",
    "www.klokkegiganten.no",
    "www.myprotein.no",
    "www.skyshowtime.com",
    "www.sportmann.no",
  ]);

  async function checkUrlBlocked(url) {
    try {
      await fetch(url, { mode: "no-cors" });
      // With no-cors, we can't read the response, but if we get here, it wasn't blocked
      return false;
    } catch {
      return true;
    }
  }

  async function checkBannerIds() {
    const bannerIds = [
      "AdHeader",
      "AdContainer",
      "AD_Top",
      "homead",
      "ad-lead",
    ];
    const container = document.createElement("div");
    container.style.cssText = "position:absolute;left:-9999px;top:-9999px;";

    bannerIds.forEach((id) => {
      const div = document.createElement("div");
      div.id = id;
      div.innerHTML = "&nbsp;";
      container.appendChild(div);
    });

    document.body.appendChild(container);

    // Give adblockers time to hide elements
    await sleep(100);

    let blocked = false;
    bannerIds.forEach((id) => {
      const elem = document.getElementById(id);
      if (!elem || elem.offsetHeight === 0 || elem.offsetParent === null) {
        blocked = true;
      }
    });

    container.remove();
    return blocked;
  }

  async function detectAdblock() {
    const adUrls = [
      "https://widgets.outbrain.com/outbrain.js",
      "https://adligature.com/",
      "https://secure.quantserve.com/quant.js",
      "https://srvtrck.com/assets/css/LineIcons.css",
    ];

    // Skip URL checks on sites with strict CSP (causes false positives)
    const skipUrlChecks = CSP_RESTRICTED_SITES.has(currentHost);

    try {
      const checks = await withTimeout(
        Promise.all([
          ...(skipUrlChecks ? [] : adUrls.map((url) => checkUrlBlocked(url))),
          checkBannerIds(),
        ]),
        CONFIG.adblockTimeout,
      );

      // If any check returns true (blocked), adblock is detected
      return checks.some((blocked) => blocked);
    } catch {
      // On timeout, assume no adblock to avoid false positives
      return false;
    }
  }

  // ===================
  // Draggable Corner Snap
  // ===================

  function makeCornerDraggable(container, handle) {
    let isDragging = false;
    let hasMoved = false;
    let startX, startY, startLeft, startTop;
    const DRAG_THRESHOLD = 5; // Minimum pixels to move before considered a drag

    function getContainerRect() {
      return container.getBoundingClientRect();
    }

    function onDragStart(e) {
      // Don't drag if clicking on buttons
      if (
        e.target.closest("button, a, .settings-btn, .minimize-btn, .close-btn")
      ) {
        return;
      }

      // When minimized, allow dragging from anywhere on container
      // When expanded, only allow dragging from header
      const isMinimized = container.classList.contains("minimized");
      if (!isMinimized && !e.target.closest(".header")) {
        return;
      }

      isDragging = true;
      hasMoved = false;

      const rect = getContainerRect();
      startLeft = rect.left;
      startTop = rect.top;

      if (e.type === "touchstart") {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      } else {
        startX = e.clientX;
        startY = e.clientY;
      }
    }

    function onDragMove(e) {
      if (!isDragging) return;

      let clientX, clientY;
      if (e.type === "touchmove") {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const deltaX = clientX - startX;
      const deltaY = clientY - startY;

      // Only start visual drag after threshold
      if (!hasMoved) {
        if (
          Math.abs(deltaX) < DRAG_THRESHOLD &&
          Math.abs(deltaY) < DRAG_THRESHOLD
        ) {
          return;
        }
        hasMoved = true;
        container.classList.add("dragging");
        // Remove position classes and use inline styles during drag
        container.classList.remove(
          "bottom-right",
          "bottom-left",
          "top-right",
          "top-left",
        );
        container.style.left = startLeft + "px";
        container.style.top = startTop + "px";
        container.style.right = "auto";
        container.style.bottom = "auto";
      }

      e.preventDefault();
      container.style.left = startLeft + deltaX + "px";
      container.style.top = startTop + deltaY + "px";
    }

    function onDragEnd() {
      if (!isDragging) return;
      isDragging = false;

      // If we didn't actually move, let click events handle it
      if (!hasMoved) {
        return;
      }

      container.classList.remove("dragging");

      // Calculate center of container
      const rect = getContainerRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Determine nearest corner
      const isRight = centerX > viewportWidth / 2;
      const isBottom = centerY > viewportHeight / 2;

      let position;
      if (isBottom && isRight) position = "bottom-right";
      else if (isBottom && !isRight) position = "bottom-left";
      else if (!isBottom && isRight) position = "top-right";
      else position = "top-left";

      // Calculate target position in pixels
      const margin = 20;
      const targetLeft = isRight ? viewportWidth - rect.width - margin : margin;
      const targetTop = isBottom
        ? viewportHeight - rect.height - margin
        : margin;

      // Animate to target position
      container.classList.add("snapping");
      container.style.left = targetLeft + "px";
      container.style.top = targetTop + "px";

      // After animation, switch to class-based positioning
      setTimeout(() => {
        container.classList.remove("snapping");
        container.style.left = "";
        container.style.top = "";
        container.style.right = "";
        container.style.bottom = "";
        container.classList.add(position);
      }, 350);

      // Save position
      setPositionForSite(position);
    }

    // Prevent click events after drag
    function onClickCapture(e) {
      if (hasMoved) {
        e.stopPropagation();
        hasMoved = false;
      }
    }

    // Mouse events - listen on container to support minimized state
    container.addEventListener("mousedown", onDragStart);
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragEnd);
    container.addEventListener("click", onClickCapture, true);

    // Touch events
    container.addEventListener("touchstart", onDragStart, { passive: true });
    document.addEventListener("touchmove", onDragMove, { passive: false });
    document.addEventListener("touchend", onDragEnd);
  }

  // ===================
  // Trumfnetthandel.no Reminder
  // ===================

  /**
   * Check if we're on a cashback portal page for any enabled service
   * @returns {{ isOnPage: boolean, service: Object|null }}
   */
  function isOnCashbackPage() {
    const pathname = window.location.pathname;
    const enabledServices = getEnabledServices();

    for (const serviceId of enabledServices) {
      const service = SERVICES[serviceId];
      if (!service?.reminderDomain) continue;

      const isServiceDomain =
        currentHost === service.reminderDomain ||
        currentHost === "www." + service.reminderDomain;

      // Check for cashback path patterns
      const isCashbackPath =
        pathname.startsWith("/cashback/") || pathname.startsWith("/shop/");

      if (isServiceDomain && isCashbackPath) {
        return { isOnPage: true, service };
      }
    }

    return { isOnPage: false, service: null };
  }

  function shouldShowReminder() {
    // Only show on cashback pages
    const { isOnPage, service } = isOnCashbackPage();
    if (!isOnPage) {
      return { show: false, service: null };
    }

    // Check if reminder was shown this session
    try {
      if (sessionStorage.getItem(reminderShownKey) === "true") {
        return { show: false, service: null };
      }
    } catch {
      // Storage blocked, continue anyway
    }

    return { show: true, service };
  }

  function createReminderNotification(service = SERVICES.trumf) {
    const shadowHost = document.createElement("div");
    shadowHost.style.cssText =
      "all:initial !important;position:fixed !important;bottom:0 !important;right:0 !important;z-index:2147483647 !important;display:block !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;";
    document.body.appendChild(shadowHost);
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });

    const styles =
      BASE_CSS +
      `
            .title {
                display: block;
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 10px;
                color: var(--accent);
            }
            .message {
                margin: 0 0 12px;
                color: var(--text);
            }
            .tip {
                font-size: 13px;
                color: var(--text-muted);
                margin: 0;
            }
        `;

    const styleEl = document.createElement("style");
    styleEl.textContent = styles;
    shadowRoot.appendChild(styleEl);

    const container = document.createElement("div");
    container.className = `container animate-in ${getPosition()}`;
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-label", i18n("ariaReminderLabel"));

    // Apply theme class
    const currentTheme = getTheme();
    shadowHost.className = `tbvl-${currentTheme}`;

    // Header
    const header = document.createElement("div");
    header.className = "header";

    const logo = document.createElement("div");
    logo.className = "logo";
    const logoIcon = document.createElement("img");
    logoIcon.className = "logo-icon";
    logoIcon.src = LOGO_ICON_URL;
    logoIcon.alt = "";
    const logoText = document.createElement("span");
    logoText.textContent = "BonusVarsler";
    logo.appendChild(logoIcon);
    logo.appendChild(logoText);

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.setAttribute("aria-label", i18n("ariaClose"));

    header.appendChild(logo);
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement("div");
    body.className = "body";

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = i18n("importantReminder");

    const message = document.createElement("p");
    message.className = "message";
    message.textContent = i18n("reminderMessage");

    const adblockWarning = document.createElement("p");
    adblockWarning.className = "message";
    adblockWarning.textContent = i18n("reminderAdblockWarning");

    const tip = document.createElement("p");
    tip.className = "tip";
    tip.textContent = i18n("reminderTip");

    body.appendChild(title);
    body.appendChild(message);
    body.appendChild(adblockWarning);
    body.appendChild(tip);

    container.appendChild(header);
    container.appendChild(body);
    shadowRoot.appendChild(container);

    // Mark reminder as shown for this session
    try {
      sessionStorage.setItem(reminderShownKey, "true");
    } catch {
      // Storage blocked on this site
    }

    // Event handlers
    function closeNotification() {
      shadowHost.remove();
    }

    function handleKeydown(e) {
      if (e.key === "Escape") {
        closeNotification();
        document.removeEventListener("keydown", handleKeydown);
      }
    }

    closeBtn.addEventListener("click", closeNotification);
    document.addEventListener("keydown", handleKeydown);

    // Make draggable to corners
    makeCornerDraggable(container, header);

    return shadowHost;
  }

  // ===================
  // Notification UI
  // ===================

  function createNotification(match) {
    const { service = SERVICES.trumf } = match;
    // Use match directly for backward compatibility (has name, urlName, cashbackDescription)
    const shadowHost = document.createElement("div");
    shadowHost.style.cssText =
      "all:initial !important;position:fixed !important;bottom:0 !important;right:0 !important;z-index:2147483647 !important;display:block !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;";
    document.body.appendChild(shadowHost);
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });

    const styles =
      BASE_CSS +
      `
            .settings-btn {
                width: 20px;
                height: 20px;
                cursor: pointer;
                opacity: 0.6;
                transition: opacity 0.2s, transform 0.2s;
                margin-right: 12px;
            }
            .settings-btn:hover {
                opacity: 1;
                transform: rotate(30deg);
            }
            :host(.tbvl-dark) .settings-btn {
                filter: invert(1);
            }
            @media (prefers-color-scheme: dark) {
                :host(.tbvl-system) .settings-btn {
                    filter: invert(1);
                }
            }

            .header-right {
                display: flex;
                align-items: center;
            }

            .body {
                padding: 16px;
            }

            .cashback {
                display: block;
                font-size: 20px;
                font-weight: 700;
                color: var(--accent);
                margin-bottom: 6px;
            }

            .subtitle {
                display: block;
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 10px;
                color: var(--text);
            }

            .reminder {
                margin: 0 0 6px;
                font-weight: 500;
                color: var(--text);
            }

            .checklist {
                list-style: decimal;
                margin: 8px 0 0 20px;
                padding: 0;
                font-size: 13px;
                color: var(--text);
            }
            .checklist li {
                display: list-item;
                margin: 6px 0;
            }

            .action-btn {
                display: block;
                margin: 16px auto 0;
                padding: 12px 24px;
                background: var(--accent);
                color: #fff;
                text-decoration: none;
                border-radius: 6px;
                font-weight: 600;
                text-align: center;
                cursor: pointer;
                transition: background 0.2s;
            }
            .action-btn:hover {
                background: var(--accent-hover);
            }

            .action-btn.adblock {
                background: #ff0000;
                animation: pulse 0.7s infinite alternate ease-in-out;
                pointer-events: none;
                cursor: default;
            }
            @keyframes pulse {
                from { transform: scale(1); }
                to { transform: scale(1.03); }
            }

            .recheck-icon {
                display: none;
                position: absolute;
                right: 8px;
                top: 50%;
                transform: translateY(-50%);
                font-size: 18px;
                cursor: pointer;
                pointer-events: auto;
                opacity: 0.8;
                transition: opacity 0.2s, transform 0.2s;
            }
            .recheck-icon:hover {
                opacity: 1;
            }
            .action-btn.adblock .recheck-icon {
                display: inline-block;
            }
            .action-btn.adblock {
                position: relative;
                padding-right: 36px;
            }
            .recheck-icon.spinning {
                animation: spin 0.8s linear infinite;
            }
            @keyframes spin {
                from { transform: translateY(-50%) rotate(0deg); }
                to { transform: translateY(-50%) rotate(360deg); }
            }

            .hide-site {
                display: block;
                margin-top: 12px;
                font-size: 11px;
                color: var(--text-muted);
                text-align: center;
                cursor: pointer;
                text-decoration: none;
                transition: color 0.2s;
            }
            .hide-site:hover {
                color: var(--text);
                text-decoration: underline;
            }

            .info-link {
                position: absolute;
                bottom: 8px;
                right: 8px;
                width: 16px;
                height: 16px;
                font-size: 9px;
                font-weight: bold;
                color: var(--text);
                background: var(--info-bg);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                text-decoration: none;
                opacity: 0.2;
                cursor: pointer;
                transition: opacity 0.2s;
            }
            .info-link:hover {
                opacity: 0.45;
            }

            .confirmation {
                text-align: center;
                padding: 8px 0;
                color: var(--text);
            }

            .settings {
                display: none;
            }
            .settings.active {
                display: block;
            }
            .content.hidden {
                display: none;
            }

            .settings-title {
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 16px;
            }
            :host(.tbvl-dark) .settings-title {
                color: #fff;
            }
            @media (prefers-color-scheme: dark) {
                :host(.tbvl-system) .settings-title {
                    color: #fff;
                }
            }

            .setting-row {
                margin-bottom: 16px;
            }

            .setting-label {
                display: block;
                font-size: 13px;
                color: var(--text-muted);
                margin-bottom: 8px;
            }

            .theme-buttons {
                display: flex;
                gap: 8px;
            }

            .theme-btn {
                flex: 1;
                padding: 8px 12px;
                background: var(--btn-bg);
                border: 1px solid var(--border);
                border-radius: 6px;
                color: var(--text);
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s;
                text-align: center;
            }
            .theme-btn:hover {
                border-color: var(--accent);
            }
            .theme-btn.active {
                background: var(--btn-bg-active);
                color: #fff;
                border-color: var(--btn-bg-active);
            }

            .position-buttons {
                flex-wrap: wrap;
                width: 80px;
            }
            .position-buttons .theme-btn {
                flex: 0 0 calc(50% - 4px);
                padding: 6px;
                font-size: 16px;
            }

            .settings-back {
                display: inline-block;
                margin-top: 12px;
                font-size: 13px;
                color: var(--accent);
                cursor: pointer;
                text-decoration: none;
            }
            .settings-back:hover {
                text-decoration: underline;
            }

            .hidden-sites-info {
                font-size: 12px;
                color: var(--text-muted);
                margin-top: 8px;
            }

            .reset-hidden {
                font-size: 12px;
                color: var(--accent);
                cursor: pointer;
                text-decoration: none;
            }
            .reset-hidden:hover {
                text-decoration: underline;
            }

            /* Toggle switch */
            .toggle-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .toggle-switch {
                position: relative;
                width: 44px;
                height: 24px;
                background: var(--btn-bg);
                border: 1px solid var(--border);
                border-radius: 12px;
                cursor: pointer;
                transition: background 0.2s, border-color 0.2s;
            }
            .toggle-switch::after {
                content: '';
                position: absolute;
                top: 2px;
                left: 2px;
                width: 18px;
                height: 18px;
                background: var(--text-muted);
                border-radius: 50%;
                transition: transform 0.2s, background 0.2s;
            }
            .toggle-switch.active {
                background: var(--btn-bg-active);
                border-color: var(--btn-bg-active);
            }
            .toggle-switch.active::after {
                transform: translateX(20px);
                background: #fff;
            }

            /* Minimize button */
            .minimize-btn {
                width: 20px;
                height: 20px;
                cursor: pointer;
                opacity: 0.6;
                transition: opacity 0.2s;
                margin-right: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .minimize-btn:hover {
                opacity: 1;
            }
            .minimize-btn::before {
                content: '';
                width: 12px;
                height: 2px;
                background: var(--text-muted);
                border-radius: 1px;
            }
            .minimize-btn:hover::before {
                background: var(--text);
            }

            /* Minimized state */
            .container {
                transition: width 0.3s ease, min-width 0.3s ease;
            }
            .body {
                max-height: 500px;
                opacity: 1;
                overflow: hidden;
                transition: max-height 0.3s ease, opacity 0.2s ease, padding 0.3s ease;
            }
            .container.minimized {
                width: auto;
                min-width: 270px;
                cursor: pointer;
            }
            .container.minimized .body {
                max-height: 0;
                opacity: 0;
                padding: 0 16px;
            }
            .container.minimized .info-link {
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease;
            }
            .info-link {
                transition: opacity 0.2s ease;
            }
            .cashback-mini {
                font-weight: 700;
                font-size: 15px;
                color: var(--accent);
                margin-left: auto;
                padding: 0 16px;
                opacity: 0;
                max-width: 0;
                overflow: hidden;
                text-align: center;
                transition: opacity 0.2s ease, max-width 0.3s ease;
            }
            .container.minimized .cashback-mini {
                opacity: 1;
                max-width: 150px;
            }
            .settings-btn,
            .minimize-btn {
                transition: opacity 0.2s ease, transform 0.2s ease;
            }
            .container.minimized .settings-btn,
            .container.minimized .minimize-btn {
                opacity: 0;
                pointer-events: none;
                width: 0;
                margin: 0;
                overflow: hidden;
            }

            @media (max-width: 700px) {
                .checklist { display: none; }
                .reminder { display: none; }
            }
        `;

    const styleEl = document.createElement("style");
    styleEl.textContent = styles;
    shadowRoot.appendChild(styleEl);

    const container = document.createElement("div");
    container.className = `container ${getPosition()}`;
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-label", i18n("ariaNotificationLabel"));

    // Apply theme class
    const currentTheme = getTheme();
    shadowHost.className = `tbvl-${currentTheme}`;

    // Apply service-specific accent color (overrides CSS defaults)
    if (service.color) {
      shadowHost.style.setProperty("--accent", service.color);
      shadowHost.style.setProperty("--btn-bg-active", service.color);
      // Calculate hover color (slightly darker)
      const hoverColor = service.color.replace(
        /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i,
        (_, r, g, b) => {
          const darken = (hex) =>
            Math.max(0, parseInt(hex, 16) - 30)
              .toString(16)
              .padStart(2, "0");
          return `#${darken(r)}${darken(g)}${darken(b)}`;
        },
      );
      shadowHost.style.setProperty("--accent-hover", hoverColor);
    }

    // Header
    const header = document.createElement("div");
    header.className = "header";

    const logo = document.createElement("div");
    logo.className = "logo";
    const logoIcon = document.createElement("img");
    logoIcon.className = "logo-icon";
    logoIcon.src = LOGO_ICON_URL;
    logoIcon.alt = "";
    const logoText = document.createElement("span");
    logoText.textContent = "BonusVarsler";
    logo.appendChild(logoIcon);
    logo.appendChild(logoText);

    const headerRight = document.createElement("div");
    headerRight.className = "header-right";

    // Cashback badge for minimized state
    const cashbackMini = document.createElement("span");
    cashbackMini.className = "cashback-mini";
    cashbackMini.textContent = match.cashbackDescription || "";

    const settingsBtn = document.createElement("img");
    settingsBtn.className = "settings-btn";
    settingsBtn.src = SETTINGS_ICON_URI;
    settingsBtn.alt = i18n("settings");

    const minimizeBtn = document.createElement("button");
    minimizeBtn.className = "minimize-btn";
    minimizeBtn.setAttribute("aria-label", i18n("ariaMinimize"));

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.setAttribute("aria-label", i18n("ariaClose"));

    headerRight.appendChild(cashbackMini);
    headerRight.appendChild(settingsBtn);
    headerRight.appendChild(minimizeBtn);
    headerRight.appendChild(closeBtn);

    header.appendChild(logo);
    header.appendChild(headerRight);

    // Body
    const body = document.createElement("div");
    body.className = "body";

    const content = document.createElement("div");
    content.className = "content";

    const cashback = document.createElement("span");
    cashback.className = "cashback";
    cashback.textContent = match.cashbackDescription || "";

    const subtitle = document.createElement("span");
    subtitle.className = "subtitle";
    subtitle.textContent = i18n("serviceBonusAt", [
      service.name,
      match.name || i18n("thisStore"),
    ]);

    const reminder = document.createElement("p");
    reminder.className = "reminder";
    reminder.textContent = i18n("rememberTo");

    const checklist = document.createElement("ol");
    checklist.className = "checklist";
    [
      i18n("disableAdblockers"),
      i18n("acceptAllCookies"),
      i18n("emptyCart"),
    ].forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      checklist.appendChild(li);
    });

    const actionBtn = document.createElement("a");
    actionBtn.className = "action-btn";
    // Build clickthrough URL from service template
    const clickthroughUrl = service.clickthroughUrl.replace(
      "{urlName}",
      match.urlName || "",
    );
    actionBtn.href = clickthroughUrl;
    actionBtn.target = "_blank";
    actionBtn.rel = "noopener noreferrer";
    actionBtn.textContent = i18n("getServiceBonus", service.name);

    const hideSiteLink = document.createElement("span");
    hideSiteLink.className = "hide-site";
    hideSiteLink.textContent = i18n("dontShowOnThisSite");

    content.appendChild(cashback);
    content.appendChild(subtitle);
    content.appendChild(reminder);
    content.appendChild(checklist);
    content.appendChild(actionBtn);
    content.appendChild(hideSiteLink);
    body.appendChild(content);

    // Settings pane
    const settings = document.createElement("div");
    settings.className = "settings";

    const settingsTitle = document.createElement("div");
    settingsTitle.className = "settings-title";
    settingsTitle.textContent = i18n("settings");

    const themeRow = document.createElement("div");
    themeRow.className = "setting-row";

    const themeLabel = document.createElement("span");
    themeLabel.className = "setting-label";
    themeLabel.textContent = i18n("appearance");

    const themeButtons = document.createElement("div");
    themeButtons.className = "theme-buttons";

    const themes = [
      { id: "light", label: i18n("themeLight") },
      { id: "dark", label: i18n("themeDark") },
      { id: "system", label: i18n("themeSystem") },
    ];

    themes.forEach((theme) => {
      const btn = document.createElement("span");
      btn.className =
        "theme-btn" + (currentTheme === theme.id ? " active" : "");
      btn.textContent = theme.label;
      btn.dataset.theme = theme.id;
      themeButtons.appendChild(btn);
    });

    themeRow.appendChild(themeLabel);
    themeRow.appendChild(themeButtons);

    // Start minimized toggle
    const minimizeRow = document.createElement("div");
    minimizeRow.className = "setting-row toggle-row";

    const minimizeLabel = document.createElement("span");
    minimizeLabel.className = "setting-label";
    minimizeLabel.style.marginBottom = "0";
    minimizeLabel.textContent = i18n("startMinimized");

    const minimizeToggle = document.createElement("span");
    minimizeToggle.className =
      "toggle-switch" + (getStartMinimized() ? " active" : "");

    minimizeRow.appendChild(minimizeLabel);
    minimizeRow.appendChild(minimizeToggle);

    // Position setting
    const positionRow = document.createElement("div");
    positionRow.className = "setting-row";

    const positionLabel = document.createElement("span");
    positionLabel.className = "setting-label";
    positionLabel.textContent = i18n("defaultPosition");

    const positionButtons = document.createElement("div");
    positionButtons.className = "theme-buttons position-buttons";

    const defaultPosition = getDefaultPosition();
    const positions = [
      { id: "top-left", label: "↖" },
      { id: "top-right", label: "↗" },
      { id: "bottom-left", label: "↙" },
      { id: "bottom-right", label: "↘" },
    ];

    positions.forEach((pos) => {
      const btn = document.createElement("span");
      btn.className =
        "theme-btn" + (defaultPosition === pos.id ? " active" : "");
      btn.textContent = pos.label;
      btn.dataset.position = pos.id;
      positionButtons.appendChild(btn);
    });

    const positionInfo = document.createElement("div");
    positionInfo.className = "hidden-sites-info";
    positionInfo.style.fontStyle = "italic";
    positionInfo.textContent = i18n("dragToOverridePosition");

    positionRow.appendChild(positionLabel);
    positionRow.appendChild(positionButtons);
    positionRow.appendChild(positionInfo);

    const hiddenSites = getHiddenSites();
    const hiddenCount = hiddenSites.size;

    // Only show hidden sites row if there are hidden sites
    let hiddenRow = null;
    let resetHidden = null;
    if (hiddenCount > 0) {
      hiddenRow = document.createElement("div");
      hiddenRow.className = "setting-row";

      const hiddenLabel = document.createElement("span");
      hiddenLabel.className = "setting-label";
      hiddenLabel.textContent = i18n("hiddenSites");

      const hiddenInfo = document.createElement("div");
      hiddenInfo.className = "hidden-sites-info";
      hiddenInfo.textContent =
        hiddenCount > 1
          ? i18n("hiddenSitesCountPlural", hiddenCount.toString())
          : i18n("hiddenSitesCount", hiddenCount.toString());

      resetHidden = document.createElement("span");
      resetHidden.className = "reset-hidden";
      resetHidden.textContent = i18n("reset");

      hiddenInfo.appendChild(document.createTextNode(" - "));
      hiddenInfo.appendChild(resetHidden);

      hiddenRow.appendChild(hiddenLabel);
      hiddenRow.appendChild(hiddenInfo);
    }

    const backLink = document.createElement("span");
    backLink.className = "settings-back";
    backLink.textContent = i18n("back");

    settings.appendChild(settingsTitle);
    settings.appendChild(themeRow);
    settings.appendChild(minimizeRow);
    settings.appendChild(positionRow);
    if (hiddenRow) {
      settings.appendChild(hiddenRow);
    }
    settings.appendChild(backLink);
    body.appendChild(settings);

    // Info link
    const infoLink = document.createElement("a");
    infoLink.className = "info-link";
    infoLink.href = "https://github.com/kristofferR/BonusVarsler";
    infoLink.target = "_blank";
    infoLink.rel = "noopener noreferrer";
    infoLink.textContent = "i";
    infoLink.title = i18n("aboutExtension");

    container.appendChild(header);
    container.appendChild(body);
    container.appendChild(infoLink);
    shadowRoot.appendChild(container);

    // Apply initial minimized state
    if (getStartMinimized()) {
      container.classList.add("minimized");
    }

    // Event handlers
    function closeNotification() {
      shadowHost.remove();
      document.removeEventListener("keydown", handleKeydown);
    }

    function handleKeydown(e) {
      if (e.key === "Escape") {
        closeNotification();
      }
    }

    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeNotification();
    });
    document.addEventListener("keydown", handleKeydown);

    // Settings toggle
    settingsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      content.classList.add("hidden");
      settings.classList.add("active");
    });

    backLink.addEventListener("click", () => {
      settings.classList.remove("active");
      content.classList.remove("hidden");
    });

    // Theme selection
    themeButtons.addEventListener("click", (e) => {
      const btn = e.target.closest(".theme-btn");
      if (!btn) return;

      const newTheme = btn.dataset.theme;
      setTheme(newTheme);
      shadowHost.className = `tbvl-${newTheme}`;

      themeButtons
        .querySelectorAll(".theme-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });

    // Start minimized toggle
    minimizeToggle.addEventListener("click", () => {
      const isActive = minimizeToggle.classList.toggle("active");
      setStartMinimized(isActive);
    });

    // Position selection (sets default for all sites)
    positionButtons.addEventListener("click", (e) => {
      const btn = e.target.closest(".theme-btn");
      if (!btn || !btn.dataset.position) return;

      const newPosition = btn.dataset.position;
      setDefaultPosition(newPosition);

      // Update button states
      positionButtons
        .querySelectorAll(".theme-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // Update container position
      container.classList.remove(
        "bottom-right",
        "bottom-left",
        "top-right",
        "top-left",
      );
      container.classList.add(newPosition);
    });

    // Reset hidden sites
    if (resetHidden) {
      resetHidden.addEventListener("click", () => {
        resetHiddenSites();
        if (hiddenRow) {
          hiddenRow.remove();
        }
      });
    }

    hideSiteLink.addEventListener("click", () => {
      hideSite(currentHost);
      shadowHost.remove();
      document.removeEventListener("keydown", handleKeydown);
    });

    actionBtn.addEventListener("click", () => {
      try {
        localStorage.setItem(messageShownKey, Date.now().toString());
      } catch {
        // Storage blocked on this site
      }
      content.innerHTML = "";
      const confirmation = document.createElement("div");
      confirmation.className = "confirmation";
      confirmation.textContent = i18n("purchaseRegistered");
      content.appendChild(confirmation);
    });

    // Minimize/expand toggle
    minimizeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      container.classList.add("minimized");
    });

    // Click header to minimize/expand
    container.addEventListener("click", (e) => {
      const clickedHeader = e.target.closest(".header");
      if (container.classList.contains("minimized")) {
        // Expand when clicking anywhere on minimized container
        container.classList.remove("minimized");
      } else if (clickedHeader) {
        // Minimize when clicking header area (buttons have stopPropagation)
        container.classList.add("minimized");
      }
    });

    // Adblock detection
    const originalHref = actionBtn.href;
    const originalText = actionBtn.textContent;

    // Create recheck icon (hidden by default)
    const recheckIcon = document.createElement("span");
    recheckIcon.className = "recheck-icon";
    recheckIcon.innerHTML = "&#x21bb;"; // ↻ refresh symbol
    recheckIcon.title = i18n("checkAdblockAgain");
    actionBtn.appendChild(recheckIcon);

    function showAdblockWarning() {
      actionBtn.classList.add("adblock");
      actionBtn.childNodes[0].textContent = i18n("adblockerDetected");
      actionBtn.removeAttribute("href");
      actionBtn.removeAttribute("target");
    }

    function restoreButton() {
      actionBtn.classList.remove("adblock");
      actionBtn.childNodes[0].textContent = originalText;
      actionBtn.href = originalHref;
      actionBtn.target = "_blank";
    }

    async function checkAndUpdateButton() {
      const isBlocked = await detectAdblock();
      if (isBlocked) {
        showAdblockWarning();
      } else {
        restoreButton();
      }
    }

    recheckIcon.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      actionBtn.childNodes[0].textContent = i18n("checkingAdblock");
      recheckIcon.classList.add("spinning");
      await checkAndUpdateButton();
      recheckIcon.classList.remove("spinning");
    });

    checkAndUpdateButton().catch(() => {
      // Silently ignore detection failures
    });

    // Make draggable to corners
    makeCornerDraggable(container, header);

    return shadowHost;
  }

  // ===================
  // Main Initialization
  // ===================

  async function init() {
    await loadSettings();

    // Check if we should show the reminder on a cashback portal page
    const reminder = shouldShowReminder();
    if (reminder.show) {
      createReminderNotification(reminder.service);
      return;
    }

    if (shouldSkipNotification()) {
      return;
    }

    // Quick check: is this host in our merchant index?
    // Returns true (might be merchant), false (not merchant), or null (no index yet)
    const mightBeMerchant = await isKnownMerchantHost();
    if (mightBeMerchant === false) {
      // Definitely not a merchant, skip feed fetch entirely
      return;
    }

    const feed = await getFeed();
    if (!feed) {
      return;
    }

    const match = findBestOffer(feed);
    if (!match?.urlName || !match?.name) {
      return;
    }

    createNotification(match);
  }

  init();
})();
