// ==UserScript==
// @name         Trumf Bonusvarsler Lite
// @description  Trumf Bonusvarsler Lite er et minimalistisk userscript (Firefox, Safari, Chrome) som gir deg varslel når du er inne på en nettbutikk som gir Trumf-bonus.
// @namespace    https://github.com/kristofferR/Trumf-Bonusvarsler-Lite
// @version      4.2.0
// @match        *://*/*
// @noframes
// @run-at       document-idle
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.registerMenuCommand
// @grant        GM_registerMenuCommand
// @connect      wlp.tcb-cdn.com
// @connect      raw.githubusercontent.com
// @homepageURL  https://github.com/kristofferR/Trumf-Bonusvarsler-Lite
// @supportURL   https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/issues
// @icon         https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/raw/main/icon.png
// @updateURL    https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/raw/main/Trumf-Bonusvarsler-Lite.user.js
// @downloadURL  https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/raw/main/Trumf-Bonusvarsler-Lite.user.js
// @license      GPL-3.0
// ==/UserScript==

(function () {
  "use strict";

  // ===================
  // Ultra-early bailouts (before any async work)
  // ===================

  // Skip iframes entirely (backup for @noframes)
  if (window.top !== window.self) return;

  const currentHost = window.location.hostname;
  const messageShownKey = `TrumfBonusvarslerLite_MessageShown_${currentHost}`;

  // Check cheap sync storage before any GM calls
  const messageShownTime = localStorage.getItem(messageShownKey);
  if (messageShownTime) {
    const elapsed = Date.now() - parseInt(messageShownTime, 10);
    if (elapsed < 10 * 60 * 1000) return; // 10 minute cooldown
  }

  // ===================
  // Configuration
  // ===================
  const CONFIG = {
    feedUrl: "https://wlp.tcb-cdn.com/trumf/notifierfeed.json",
    fallbackUrl:
      "https://raw.githubusercontent.com/kristofferR/Trumf-Bonusvarsler-Lite/main/sitelist.json",
    cacheKey: "TrumfBonusvarslerLite_FeedData_v3",
    cacheTimeKey: "TrumfBonusvarslerLite_FeedTime_v3",
    hostIndexKey: "TrumfBonusvarslerLite_HostIndex_v3",
    cacheDuration: 48 * 60 * 60 * 1000, // 48 hours
    messageDuration: 10 * 60 * 1000, // 10 minutes
    maxRetries: 5,
    retryDelays: [100, 500, 1000, 2000, 4000], // Exponential backoff
    adblockTimeout: 3000, // 3 seconds timeout for adblock checks
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

  const hiddenSitesKey = "TrumfBonusvarslerLite_HiddenSites";
  const themeKey = "TrumfBonusvarslerLite_Theme";
  const startMinimizedKey = "TrumfBonusvarslerLite_StartMinimized";
  const positionKey = "TrumfBonusvarslerLite_Position";
  const sitePositionsKey = "TrumfBonusvarslerLite_SitePositions";
  const reminderShownKey = "TrumfBonusvarslerLite_ReminderShown";

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
        .logo img {
            all: unset;
            display: block;
            max-height: 28px;
        }
        :host(.tbvl-dark) .logo img {
            filter: invert(1) hue-rotate(180deg);
        }
        @media (prefers-color-scheme: dark) {
            :host(.tbvl-system) .logo img {
                filter: invert(1) hue-rotate(180deg);
            }
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

  function gmFetch(url, options = {}) {
    // Use GM.xmlHttpRequest (GM4+) or fall back to GM_xmlhttpRequest (GM3/iOS)
    const xmlHttpRequest =
      typeof GM !== "undefined" && GM.xmlHttpRequest
        ? GM.xmlHttpRequest.bind(GM)
        : typeof GM_xmlhttpRequest !== "undefined"
          ? GM_xmlhttpRequest
          : null;

    if (!xmlHttpRequest) {
      return Promise.reject(new Error("No xmlHttpRequest API available"));
    }

    return new Promise((resolve, reject) => {
      xmlHttpRequest({
        method: options.method || "GET",
        url,
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
          ...options.headers,
        },
        onload: (response) => {
          if (response.status >= 200 && response.status < 300) {
            resolve(response);
          } else {
            reject(new Error(`HTTP ${response.status}`));
          }
        },
        onerror: (error) => reject(error),
        ontimeout: () => reject(new Error("Request timeout")),
      });
    });
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
  // GM Storage (Cross-Site Settings)
  // ===================

  async function gmGetValue(key, defaultValue) {
    try {
      // Use GM.getValue (GM4+) or fall back to GM_getValue (GM3/iOS)
      if (typeof GM !== "undefined" && GM.getValue) {
        return await GM.getValue(key, defaultValue);
      } else if (typeof GM_getValue !== "undefined") {
        return GM_getValue(key, defaultValue);
      }
      // Fallback to localStorage if no GM storage available
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  async function gmSetValue(key, value) {
    try {
      // Use GM.setValue (GM4+) or fall back to GM_setValue (GM3/iOS)
      if (typeof GM !== "undefined" && GM.setValue) {
        return await GM.setValue(key, value);
      } else if (typeof GM_setValue !== "undefined") {
        return GM_setValue(key, value);
      }
      // Fallback to localStorage if no GM storage available
      localStorage.setItem(key, JSON.stringify(value));
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
  };

  async function loadSettings() {
    const hiddenSitesArray = await gmGetValue(hiddenSitesKey, []);
    settingsCache.hiddenSites = new Set(hiddenSitesArray);
    settingsCache.theme = await gmGetValue(themeKey, "system");
    settingsCache.startMinimized = await gmGetValue(startMinimizedKey, false);
    settingsCache.position = await gmGetValue(positionKey, "bottom-right");
    settingsCache.sitePositions = await gmGetValue(sitePositionsKey, {});
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
      await gmSetValue(hiddenSitesKey, [...settingsCache.hiddenSites]);
    }
  }

  async function resetHiddenSites() {
    settingsCache.hiddenSites = new Set();
    await gmSetValue(hiddenSitesKey, []);
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
    await gmSetValue(themeKey, theme);
  }

  // ===================
  // Start Minimized Management
  // ===================

  function getStartMinimized() {
    return settingsCache.startMinimized;
  }

  async function setStartMinimized(value) {
    settingsCache.startMinimized = value;
    await gmSetValue(startMinimizedKey, value);
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
    await gmSetValue(positionKey, position);
  }

  async function setPositionForSite(position) {
    settingsCache.sitePositions[currentHost] = position;
    await gmSetValue(sitePositionsKey, settingsCache.sitePositions);
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
  // Feed Management (GM storage - shared across all sites)
  // ===================

  async function getCachedFeed() {
    const storedTime = await gmGetValue(CONFIG.cacheTimeKey, null);
    if (!storedTime) {
      return null;
    }

    const elapsed = Date.now() - storedTime;
    if (elapsed >= CONFIG.cacheDuration) {
      return null;
    }

    const storedData = await gmGetValue(CONFIG.cacheKey, null);
    return isValidFeed(storedData) ? storedData : null;
  }

  function isValidFeed(feed) {
    return (
      feed && typeof feed.merchants === "object" && feed.merchants !== null
    );
  }

  async function cacheFeed(data) {
    try {
      await gmSetValue(CONFIG.cacheKey, data);
      await gmSetValue(CONFIG.cacheTimeKey, Date.now());
      // Cache host index for fast lookups
      if (data?.merchants) {
        await gmSetValue(CONFIG.hostIndexKey, Object.keys(data.merchants));
      }
    } catch {
      // Storage full or unavailable, continue without caching
    }
  }

  async function fetchFeedWithRetry(url, retries = CONFIG.maxRetries) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await gmFetch(url);
        const feed = JSON.parse(response.responseText);
        if (isValidFeed(feed)) {
          return feed;
        }
      } catch {
        // JSON parse error or network error
      }
      if (attempt < retries - 1) {
        await sleep(CONFIG.retryDelays[attempt] || 4000);
      }
    }
    return null;
  }

  async function getFeed() {
    // Try cache first
    const cached = await getCachedFeed();
    if (cached) {
      return cached;
    }

    // Skip network requests if offline
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return null;
    }

    // Try primary feed
    let feed = await fetchFeedWithRetry(CONFIG.feedUrl);
    if (feed) {
      await cacheFeed(feed);
      return feed;
    }

    // Try fallback
    feed = await fetchFeedWithRetry(CONFIG.fallbackUrl, 2);
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
    const hostIndex = await gmGetValue(CONFIG.hostIndexKey, null);
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
  // Merchant Matching
  // ===================

  function findMerchant(feed) {
    if (!feed?.merchants) {
      return null;
    }

    const merchants = feed.merchants;

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
    if (merchant) {
      return merchant;
    }

    // Try domain alias if exists
    const aliasedHost = DOMAIN_ALIASES[currentHost];
    if (aliasedHost) {
      merchant = tryHost(aliasedHost);
      if (merchant) {
        return merchant;
      }
    }

    // Also try alias without/with www
    const noWwwHost = currentHost.replace(/^www\./, "");
    const aliasedNoWww = DOMAIN_ALIASES[noWwwHost];
    if (aliasedNoWww && aliasedNoWww !== aliasedHost) {
      merchant = tryHost(aliasedNoWww);
      if (merchant) {
        return merchant;
      }
    }

    return null;
  }

  // ===================
  // Adblock Detection
  // ===================

  // Sites with strict CSP that blocks our test URLs (causes false positives)
  const CSP_RESTRICTED_SITES = new Set([
    "fabel.no",
    "hoie.no",
    "sharkgaming.no",
    "vetzoo.no",
    "www.bookbeat.no",
    "www.ekstralys.no",
    "www.elite.se",
    "www.klokkegiganten.no",
    "www.myprotein.no",
    "www.skyshowtime.com",
    "www.sportmann.no",
    "www.strikkia.no",
    "www.vivara.no",
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

  function isOnCashbackPage() {
    const isTrumfDomain =
      currentHost === "trumfnetthandel.no" ||
      currentHost === "www.trumfnetthandel.no";
    const isCashbackPath = window.location.pathname.startsWith("/cashback/");
    return isTrumfDomain && isCashbackPath;
  }

  function shouldShowReminder() {
    // Only show on cashback pages
    if (!isOnCashbackPage()) {
      return false;
    }

    // Check if reminder was shown this session
    if (sessionStorage.getItem(reminderShownKey) === "true") {
      return false;
    }

    return true;
  }

  function createReminderNotification() {
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
    container.setAttribute("aria-label", "Trumf bonus påminnelse");

    // Apply theme class
    const currentTheme = getTheme();
    shadowHost.className = `tbvl-${currentTheme}`;

    // Header
    const header = document.createElement("div");
    header.className = "header";

    const logo = document.createElement("div");
    logo.className = "logo";
    const logoImg = document.createElement("img");
    logoImg.src =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg width="125" height="40" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_2665_50014)" fill-rule="evenodd" clip-rule="evenodd"><path d="M20 40H0V19.939C0 8.927 8.954 0 20 0s20 8.927 20 19.939v.122C40 31.073 31.046 40 20 40z" fill="#0A0066"/><path d="M15.31 25.32v-7.384h-.077c-.885 0-1.697-.613-1.865-1.507-.229-1.216.662-2.272 1.8-2.272h.142v-1.865c0-1.13.79-2.14 1.88-2.275 1.305-.162 2.413.88 2.413 2.192v1.948h1.828c.885 0 1.697.613 1.865 1.507.229 1.216-.662 2.272-1.8 2.272h-1.893v6.657c0 1.017.424 1.512 1.384 1.512.142 0 .424-.03.509-.03.96 0 1.78.815 1.78 1.832 0 .785-.509 1.424-1.102 1.657-.791.32-1.526.436-2.458.436-2.627 0-4.407-1.076-4.407-4.68z" fill="#fff"/></g><path d="M55.551 4.163l.371.763 6.307 11.11h3.34V.988H62.64v10.553l.062 1.01-.391-1.01L56.293.989h-3.565v15.046h2.926V4.967l-.103-.804zm21.157 7.894c-.68 1.175-1.422 1.69-2.761 1.69-1.794 0-2.865-.989-3.113-2.638h8.719V9.996c0-2.988-1.773-5.73-5.668-5.73-3.69 0-5.957 2.824-5.957 6.06 0 3.421 2.061 5.915 6.06 5.915 2.535 0 4.184-1.113 5.255-2.844l-2.535-1.34zM73.885 6.74c1.875 0 2.638 1.113 2.72 2.514h-5.709c.268-1.587 1.34-2.514 2.989-2.514zm15.348 6.575c-.577.247-.927.37-1.525.37-1.072 0-1.649-.556-1.649-1.813V6.966h3.174V4.493H86.06V0l-2.782 1.649v2.844h-2.659v2.473h2.618v5.256c0 2.618 1.092 4.02 3.73 4.02.969 0 1.629-.186 2.267-.537v-2.39zm10.125 0c-.578.247-.928.37-1.526.37-1.071 0-1.648-.556-1.648-1.813V6.966h3.174V4.493h-3.174V0L93.4 1.649v2.844h-2.659v2.473h2.618v5.256c0 2.618 1.092 4.02 3.73 4.02.97 0 1.629-.186 2.268-.537v-2.39zM55.716 36.646v-5.833c0-2.123.907-3.421 2.576-3.421 1.752 0 2.494 1.071 2.494 2.906v6.348h3.01v-7.193c0-1.381-.371-2.474-1.134-3.319-.763-.845-1.773-1.257-3.03-1.257-1.752 0-3.174.907-3.936 2.741V20.24h-2.989v16.406h3.01zm13.927.206c1.958 0 3.524-.969 4.245-2.618.103 1.794.907 2.618 2.742 2.618.845 0 1.566-.247 1.978-.515v-1.938a2.318 2.318 0 01-.804.165c-.762 0-1.071-.309-1.071-1.38v-3.958c0-2.947-1.917-4.349-4.782-4.349-2.556 0-4.72 1.175-5.689 3.71l2.721.783c.412-1.319 1.34-2.143 2.824-2.143 1.484 0 2.06.598 2.06 1.34 0 .35-.144.618-.432.845-.268.206-.886.412-1.834.597-2.226.433-3.36.783-4.184 1.299-.845.556-1.422 1.319-1.422 2.638 0 1.814 1.422 2.906 3.648 2.906zm1.174-2.205c-1.174 0-1.793-.392-1.793-1.237 0-.99.804-1.34 2.803-1.773 1.216-.268 1.855-.494 2.123-.824v.7c0 1.258-1.05 3.134-3.133 3.134zm12.493 1.999v-5.833c0-2.123.907-3.421 2.577-3.421 1.751 0 2.493 1.071 2.493 2.906v6.348h3.01v-7.193c0-1.381-.371-2.474-1.134-3.319-.763-.845-1.772-1.257-3.03-1.257-1.752 0-3.174.907-3.936 2.741v-2.514H80.3v11.542h3.01zm10.361-5.709c0 3.875 2.144 5.832 4.865 5.832 1.875 0 3.132-.886 3.854-2.452v2.329h2.988V20.24h-3.009v6.987c-.68-1.546-1.834-2.247-3.627-2.247-2.556 0-5.07 1.979-5.07 5.957zm5.998 3.38c-2.143 0-2.926-1.381-2.926-3.442 0-2.04.886-3.504 2.926-3.504 2.082 0 2.927 1.443 2.927 3.504 0 2.04-.845 3.442-2.927 3.442zm16.832-1.649c-.68 1.175-1.422 1.69-2.762 1.69-1.793 0-2.865-.99-3.112-2.638h8.718v-1.113c0-2.989-1.773-5.73-5.668-5.73-3.689 0-5.956 2.824-5.956 6.06 0 3.421 2.061 5.915 6.059 5.915 2.535 0 4.184-1.113 5.256-2.844l-2.535-1.34zm-2.824-5.318c1.876 0 2.638 1.113 2.721 2.515h-5.71c.268-1.587 1.34-2.515 2.989-2.515zm7.927-7.11v16.406h3.009V20.24h-3.009z" fill="#0A0066"/><path fill-rule="evenodd" clip-rule="evenodd" d="M121.689 16.262c-.347-4.93-4.087-8.47-8.218-8.47s-7.871 3.54-8.218 8.47H102.5c.356-6.261 5.132-11.219 10.971-11.219s10.615 4.958 10.971 11.219h-2.753z" fill="#4D4DFF"/><defs><clipPath id="clip0_2665_50014"><path fill="#fff" d="M0 0h40v40H0z"/></clipPath></defs></svg>',
      );
    logoImg.alt = "Trumf Netthandel";
    logo.appendChild(logoImg);

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.setAttribute("aria-label", "Lukk");

    header.appendChild(logo);
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement("div");
    body.className = "body";

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = "Viktig påminnelse!";

    const message = document.createElement("p");
    message.className = "message";
    message.textContent =
      'For å være sikker på at Trumf-bonusen registreres, må du klikke på "Få Trumf-bonus her"-knappen på denne siden.';

    const adblockWarning = document.createElement("p");
    adblockWarning.className = "message";
    adblockWarning.textContent =
      "Det er viktig at adblocker-utvidelser er helt deaktivert, ikke bare hvitelistet.";

    const tip = document.createElement("p");
    tip.className = "tip";
    tip.textContent =
      "Tips: Vent til siden laster ferdig, og trykk deretter på den store knappen som tar deg til butikken.";

    body.appendChild(title);
    body.appendChild(message);
    body.appendChild(adblockWarning);
    body.appendChild(tip);

    container.appendChild(header);
    container.appendChild(body);
    shadowRoot.appendChild(container);

    // Mark reminder as shown for this session
    sessionStorage.setItem(reminderShownKey, "true");

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

  function createNotification(merchant) {
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
            }

            .reminder {
                margin: 0 0 6px;
                font-weight: 500;
            }

            .checklist {
                list-style: decimal;
                margin: 8px 0 0 20px;
                padding: 0;
                font-size: 13px;
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
    container.setAttribute("aria-label", "Trumf bonus varsling");

    // Apply theme class
    const currentTheme = getTheme();
    shadowHost.className = `tbvl-${currentTheme}`;

    // Header
    const header = document.createElement("div");
    header.className = "header";

    const logo = document.createElement("div");
    logo.className = "logo";
    const logoImg = document.createElement("img");
    logoImg.src =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg width="125" height="40" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_2665_50014)" fill-rule="evenodd" clip-rule="evenodd"><path d="M20 40H0V19.939C0 8.927 8.954 0 20 0s20 8.927 20 19.939v.122C40 31.073 31.046 40 20 40z" fill="#0A0066"/><path d="M15.31 25.32v-7.384h-.077c-.885 0-1.697-.613-1.865-1.507-.229-1.216.662-2.272 1.8-2.272h.142v-1.865c0-1.13.79-2.14 1.88-2.275 1.305-.162 2.413.88 2.413 2.192v1.948h1.828c.885 0 1.697.613 1.865 1.507.229 1.216-.662 2.272-1.8 2.272h-1.893v6.657c0 1.017.424 1.512 1.384 1.512.142 0 .424-.03.509-.03.96 0 1.78.815 1.78 1.832 0 .785-.509 1.424-1.102 1.657-.791.32-1.526.436-2.458.436-2.627 0-4.407-1.076-4.407-4.68z" fill="#fff"/></g><path d="M55.551 4.163l.371.763 6.307 11.11h3.34V.988H62.64v10.553l.062 1.01-.391-1.01L56.293.989h-3.565v15.046h2.926V4.967l-.103-.804zm21.157 7.894c-.68 1.175-1.422 1.69-2.761 1.69-1.794 0-2.865-.989-3.113-2.638h8.719V9.996c0-2.988-1.773-5.73-5.668-5.73-3.69 0-5.957 2.824-5.957 6.06 0 3.421 2.061 5.915 6.06 5.915 2.535 0 4.184-1.113 5.255-2.844l-2.535-1.34zM73.885 6.74c1.875 0 2.638 1.113 2.72 2.514h-5.709c.268-1.587 1.34-2.514 2.989-2.514zm15.348 6.575c-.577.247-.927.37-1.525.37-1.072 0-1.649-.556-1.649-1.813V6.966h3.174V4.493H86.06V0l-2.782 1.649v2.844h-2.659v2.473h2.618v5.256c0 2.618 1.092 4.02 3.73 4.02.969 0 1.629-.186 2.267-.537v-2.39zm10.125 0c-.578.247-.928.37-1.526.37-1.071 0-1.648-.556-1.648-1.813V6.966h3.174V4.493h-3.174V0L93.4 1.649v2.844h-2.659v2.473h2.618v5.256c0 2.618 1.092 4.02 3.73 4.02.97 0 1.629-.186 2.268-.537v-2.39zM55.716 36.646v-5.833c0-2.123.907-3.421 2.576-3.421 1.752 0 2.494 1.071 2.494 2.906v6.348h3.01v-7.193c0-1.381-.371-2.474-1.134-3.319-.763-.845-1.773-1.257-3.03-1.257-1.752 0-3.174.907-3.936 2.741V20.24h-2.989v16.406h3.01zm13.927.206c1.958 0 3.524-.969 4.245-2.618.103 1.794.907 2.618 2.742 2.618.845 0 1.566-.247 1.978-.515v-1.938a2.318 2.318 0 01-.804.165c-.762 0-1.071-.309-1.071-1.38v-3.958c0-2.947-1.917-4.349-4.782-4.349-2.556 0-4.72 1.175-5.689 3.71l2.721.783c.412-1.319 1.34-2.143 2.824-2.143 1.484 0 2.06.598 2.06 1.34 0 .35-.144.618-.432.845-.268.206-.886.412-1.834.597-2.226.433-3.36.783-4.184 1.299-.845.556-1.422 1.319-1.422 2.638 0 1.814 1.422 2.906 3.648 2.906zm1.174-2.205c-1.174 0-1.793-.392-1.793-1.237 0-.99.804-1.34 2.803-1.773 1.216-.268 1.855-.494 2.123-.824v.7c0 1.258-1.05 3.134-3.133 3.134zm12.493 1.999v-5.833c0-2.123.907-3.421 2.577-3.421 1.751 0 2.493 1.071 2.493 2.906v6.348h3.01v-7.193c0-1.381-.371-2.474-1.134-3.319-.763-.845-1.772-1.257-3.03-1.257-1.752 0-3.174.907-3.936 2.741v-2.514H80.3v11.542h3.01zm10.361-5.709c0 3.875 2.144 5.832 4.865 5.832 1.875 0 3.132-.886 3.854-2.452v2.329h2.988V20.24h-3.009v6.987c-.68-1.546-1.834-2.247-3.627-2.247-2.556 0-5.07 1.979-5.07 5.957zm5.998 3.38c-2.143 0-2.926-1.381-2.926-3.442 0-2.04.886-3.504 2.926-3.504 2.082 0 2.927 1.443 2.927 3.504 0 2.04-.845 3.442-2.927 3.442zm16.832-1.649c-.68 1.175-1.422 1.69-2.762 1.69-1.793 0-2.865-.99-3.112-2.638h8.718v-1.113c0-2.989-1.773-5.73-5.668-5.73-3.689 0-5.956 2.824-5.956 6.06 0 3.421 2.061 5.915 6.059 5.915 2.535 0 4.184-1.113 5.256-2.844l-2.535-1.34zm-2.824-5.318c1.876 0 2.638 1.113 2.721 2.515h-5.71c.268-1.587 1.34-2.515 2.989-2.515zm7.927-7.11v16.406h3.009V20.24h-3.009z" fill="#0A0066"/><path fill-rule="evenodd" clip-rule="evenodd" d="M121.689 16.262c-.347-4.93-4.087-8.47-8.218-8.47s-7.871 3.54-8.218 8.47H102.5c.356-6.261 5.132-11.219 10.971-11.219s10.615 4.958 10.971 11.219h-2.753z" fill="#4D4DFF"/><defs><clipPath id="clip0_2665_50014"><path fill="#fff" d="M0 0h40v40H0z"/></clipPath></defs></svg>',
      );
    logoImg.alt = "Trumf Netthandel";
    logo.appendChild(logoImg);

    const headerRight = document.createElement("div");
    headerRight.className = "header-right";

    // Cashback badge for minimized state
    const cashbackMini = document.createElement("span");
    cashbackMini.className = "cashback-mini";
    cashbackMini.textContent = merchant.cashbackDescription || "";

    const settingsBtn = document.createElement("img");
    settingsBtn.className = "settings-btn";
    settingsBtn.src =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
      );
    settingsBtn.alt = "Innstillinger";

    const minimizeBtn = document.createElement("button");
    minimizeBtn.className = "minimize-btn";
    minimizeBtn.setAttribute("aria-label", "Minimer");

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.setAttribute("aria-label", "Lukk");

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
    cashback.textContent = merchant.cashbackDescription || "";

    const subtitle = document.createElement("span");
    subtitle.className = "subtitle";
    subtitle.textContent = `Trumf-bonus hos ${merchant.name || "denne butikken"}`;

    const reminder = document.createElement("p");
    reminder.className = "reminder";
    reminder.textContent = "Husk å:";

    const checklist = document.createElement("ol");
    checklist.className = "checklist";
    [
      "Deaktivere uBlock/AdGuard Home/Pi-Hole",
      "Akseptere alle cookies",
      "Tømme handlevognen",
    ].forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      checklist.appendChild(li);
    });

    const actionBtn = document.createElement("a");
    actionBtn.className = "action-btn";
    actionBtn.href = `https://trumfnetthandel.no/cashback/${merchant.urlName || ""}`;
    actionBtn.target = "_blank";
    actionBtn.rel = "noopener noreferrer";
    actionBtn.textContent = "Få Trumf-bonus";

    const hideSiteLink = document.createElement("span");
    hideSiteLink.className = "hide-site";
    hideSiteLink.textContent = "Ikke vis på denne siden";

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
    settingsTitle.textContent = "Innstillinger";

    const themeRow = document.createElement("div");
    themeRow.className = "setting-row";

    const themeLabel = document.createElement("span");
    themeLabel.className = "setting-label";
    themeLabel.textContent = "Utseende";

    const themeButtons = document.createElement("div");
    themeButtons.className = "theme-buttons";

    const themes = [
      { id: "light", label: "Lys" },
      { id: "dark", label: "Mørk" },
      { id: "system", label: "System" },
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
    minimizeLabel.textContent = "Start minimert";

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
    positionLabel.textContent = "Standard posisjon";

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
    positionInfo.textContent =
      "Dra varselet for å overstyre posisjonen på denne siden.";

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
      hiddenLabel.textContent = "Skjulte sider";

      const hiddenInfo = document.createElement("div");
      hiddenInfo.className = "hidden-sites-info";
      hiddenInfo.textContent = `${hiddenCount} side${hiddenCount > 1 ? "r" : ""} skjult`;

      resetHidden = document.createElement("span");
      resetHidden.className = "reset-hidden";
      resetHidden.textContent = "Nullstill";

      hiddenInfo.appendChild(document.createTextNode(" - "));
      hiddenInfo.appendChild(resetHidden);

      hiddenRow.appendChild(hiddenLabel);
      hiddenRow.appendChild(hiddenInfo);
    }

    const backLink = document.createElement("span");
    backLink.className = "settings-back";
    backLink.textContent = "← Tilbake";

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
    infoLink.href = "https://github.com/kristofferR/Trumf-Bonusvarsler-Lite";
    infoLink.target = "_blank";
    infoLink.rel = "noopener noreferrer";
    infoLink.textContent = "i";
    infoLink.title = "Om dette scriptet";

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
      localStorage.setItem(messageShownKey, Date.now().toString());
      content.innerHTML = "";
      const confirmation = document.createElement("div");
      confirmation.className = "confirmation";
      confirmation.textContent =
        "Hvis alt ble gjort riktig, skal kjøpet ha blitt registrert.";
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
    recheckIcon.title = "Sjekk på nytt";
    actionBtn.appendChild(recheckIcon);

    function showAdblockWarning() {
      actionBtn.classList.add("adblock");
      actionBtn.childNodes[0].textContent = "Adblocker funnet!";
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
      actionBtn.childNodes[0].textContent = "Sjekker...";
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

    // Check if we should show the reminder on trumfnetthandel.no
    if (shouldShowReminder()) {
      createReminderNotification();
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

    const merchant = findMerchant(feed);
    if (!merchant) {
      return;
    }

    createNotification(merchant);
  }

  // ===================
  // Userscript Menu Commands
  // ===================

  function registerMenuCommand(name, callback) {
    if (typeof GM !== "undefined" && GM.registerMenuCommand) {
      GM.registerMenuCommand(name, callback);
    } else if (typeof GM_registerMenuCommand !== "undefined") {
      GM_registerMenuCommand(name, callback);
    }
  }

  async function registerMenuCommands() {
    await loadSettings();

    const themeLabels = { light: "Lys", dark: "Mørk", system: "System" };
    const currentTheme = getTheme();

    registerMenuCommand(`Tema: ${themeLabels[currentTheme]}`, async () => {
      const themes = ["light", "dark", "system"];
      const currentIndex = themes.indexOf(getTheme());
      const nextTheme = themes[(currentIndex + 1) % themes.length];
      await setTheme(nextTheme);
      alert(
        `Tema endret til: ${themeLabels[nextTheme]}\n\nLast siden på nytt for å se endringen.`,
      );
    });

    registerMenuCommand(
      `Start minimert: ${getStartMinimized() ? "På" : "Av"}`,
      async () => {
        const newValue = !getStartMinimized();
        await setStartMinimized(newValue);
        alert(`Start minimert: ${newValue ? "På" : "Av"}`);
      },
    );

    const positionLabels = {
      "bottom-right": "Nederst til høyre ↘",
      "bottom-left": "Nederst til venstre ↙",
      "top-right": "Øverst til høyre ↗",
      "top-left": "Øverst til venstre ↖",
    };
    const defaultPosition = getDefaultPosition();
    registerMenuCommand(
      `Standard posisjon: ${positionLabels[defaultPosition]}`,
      async () => {
        const positions = [
          "bottom-right",
          "bottom-left",
          "top-right",
          "top-left",
        ];
        const currentIndex = positions.indexOf(getDefaultPosition());
        const nextPosition = positions[(currentIndex + 1) % positions.length];
        await setDefaultPosition(nextPosition);
        alert(`Standard posisjon endret til: ${positionLabels[nextPosition]}`);
      },
    );

    const hiddenCount = getHiddenSites().size;
    registerMenuCommand(`Skjulte sider (${hiddenCount})`, async () => {
      const sites = [...getHiddenSites()];
      if (sites.length === 0) {
        alert("Ingen sider er skjult.");
        return;
      }

      const list = sites.map((site, i) => `${i + 1}. ${site}`).join("\n");
      const input = prompt(
        `Skjulte sider:\n\n${list}\n\n` +
          `Skriv et tall for å fjerne en side, eller "alle" for å nullstille:`,
      );

      if (!input) return;

      if (input.toLowerCase() === "alle") {
        await resetHiddenSites();
        alert("Alle skjulte sider er fjernet.");
        return;
      }

      const index = parseInt(input, 10) - 1;
      if (index >= 0 && index < sites.length) {
        const siteToRemove = sites[index];
        settingsCache.hiddenSites.delete(siteToRemove);
        await gmSetValue(hiddenSitesKey, [...settingsCache.hiddenSites]);
        alert(`"${siteToRemove}" er fjernet fra listen.`);
      } else {
        alert("Ugyldig valg.");
      }
    });

    registerMenuCommand("Tøm feed-cache", async () => {
      await gmSetValue(CONFIG.cacheKey, null);
      await gmSetValue(CONFIG.cacheTimeKey, null);
      await gmSetValue(CONFIG.hostIndexKey, null);
      alert("Feed-cache er tømt.");
    });
  }

  registerMenuCommands();
  init();
})();
