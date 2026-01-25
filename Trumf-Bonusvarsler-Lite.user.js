// ==UserScript==
// @name         BonusVarsler (for Trumf)
// @description  BonusVarsler er et minimalistisk userscript (Firefox, Safari, Chrome) som varsler deg når du er inne på en nettbutikk som gir cashback eller bonus.
// @namespace    https://github.com/kristofferR/BonusVarsler
// @version      5.0
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
// @homepageURL  https://github.com/kristofferR/BonusVarsler
// @supportURL   https://github.com/kristofferR/BonusVarsler/issues
// @icon         https://github.com/kristofferR/BonusVarsler/raw/main/icon.png
// @updateURL    https://github.com/kristofferR/BonusVarsler/raw/main/BonusVarsler.user.js
// @downloadURL  https://github.com/kristofferR/BonusVarsler/raw/main/BonusVarsler.user.js
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
  const messageShownKey = `BonusVarsler_MessageShown_${currentHost}`;

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
    feedUrl: "https://raw.githubusercontent.com/kristofferR/BonusVarsler/main/sitelist.json",
    fallbackUrl: "https://wlp.tcb-cdn.com/trumf/notifierfeed.json",
    cacheKey: "BonusVarsler_FeedData_v3",
    cacheTimeKey: "BonusVarsler_FeedTime_v3",
    hostIndexKey: "BonusVarsler_HostIndex_v3",
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

  const hiddenSitesKey = "BonusVarsler_HiddenSites";
  const themeKey = "BonusVarsler_Theme";
  const startMinimizedKey = "BonusVarsler_StartMinimized";
  const positionKey = "BonusVarsler_Position";
  const sitePositionsKey = "BonusVarsler_SitePositions";
  const reminderShownKey = "BonusVarsler_ReminderShown";

  // Logo icon as data URI (64px for 2x retina, displayed at 22px)
  const LOGO_ICON_URL =
    "data:image/png;base64,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";

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
            width: 32px;
            height: 32px;
            flex-shrink: 0;
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
    infoLink.href = "https://github.com/kristofferR/BonusVarsler";
    infoLink.target = "_blank";
    infoLink.rel = "noopener noreferrer";
    infoLink.textContent = "i";
    infoLink.title = "Om BonusVarsler";

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
