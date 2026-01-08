// ==UserScript==
// @name         Trumf Bonusvarsler Lite
// @description  Trumf Bonusvarsler Lite er et minimalistisk userscript (Firefox, Safari, Chrome) som gir deg varslel når du er inne på en nettbutikk som gir Trumf-bonus.
// @namespace    https://github.com/kristofferR/Trumf-Bonusvarsler-Lite
// @version      2.2.0
// @match        *://*/*
// @grant        GM.xmlHttpRequest
// @connect      wlp.tcb-cdn.com
// @connect      raw.githubusercontent.com
// @homepageURL  https://github.com/kristofferR/Trumf-Bonusvarsler-Lite
// @supportURL   https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/issues
// @icon         https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/raw/main/icon.png
// @updateURL    https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/raw/main/Trumf-Bonusvarsler-Lite.user.js
// @downloadURL  https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/raw/main/Trumf-Bonusvarsler-Lite.user.js
// @license      GPL-3.0
// ==/UserScript==

(function() {
    'use strict';

    // ===================
    // Configuration
    // ===================
    const CONFIG = {
        feedUrl: 'https://wlp.tcb-cdn.com/trumf/notifierfeed.json',
        fallbackUrl: 'https://raw.githubusercontent.com/kristofferR/Trumf-Bonusvarsler-Lite/main/sitelist.json',
        cacheKey: 'TrumfBonusvarslerLite_FeedData_v2',
        cacheTimeKey: 'TrumfBonusvarslerLite_FeedTime_v2',
        cacheDuration: 6 * 60 * 60 * 1000, // 6 hours
        messageDuration: 10 * 60 * 1000,   // 10 minutes
        maxRetries: 5,
        retryDelays: [100, 500, 1000, 2000, 4000], // Exponential backoff
        adblockTimeout: 3000, // 3 seconds timeout for adblock checks
    };

    const currentHost = window.location.hostname;
    const sessionClosedKey = `TrumfBonusvarslerLite_Closed_${currentHost}`;
    const messageShownKey = `TrumfBonusvarslerLite_MessageShown_${currentHost}`;
    const hiddenSitesKey = 'TrumfBonusvarslerLite_HiddenSites';
    const themeKey = 'TrumfBonusvarslerLite_Theme';

    // ===================
    // Utility Functions
    // ===================

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function gmFetch(url, options = {}) {
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                method: options.method || 'GET',
                url,
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache',
                    ...options.headers
                },
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response);
                    } else {
                        reject(new Error(`HTTP ${response.status}`));
                    }
                },
                onerror: (error) => reject(error),
                ontimeout: () => reject(new Error('Request timeout'))
            });
        });
    }

    function withTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), ms)
            )
        ]);
    }

    // ===================
    // Hidden Sites Management
    // ===================

    function getHiddenSites() {
        try {
            return JSON.parse(localStorage.getItem(hiddenSitesKey)) || [];
        } catch {
            return [];
        }
    }

    function hideSite(host) {
        const sites = getHiddenSites();
        if (!sites.includes(host)) {
            sites.push(host);
            localStorage.setItem(hiddenSitesKey, JSON.stringify(sites));
        }
    }

    function isSiteHidden(host) {
        return getHiddenSites().includes(host);
    }

    // ===================
    // Theme Management
    // ===================

    function getTheme() {
        return localStorage.getItem(themeKey) || 'system';
    }

    function setTheme(theme) {
        localStorage.setItem(themeKey, theme);
    }

    // ===================
    // Early Exit Checks
    // ===================

    function shouldSkipNotification() {
        // Check if site is permanently hidden
        if (isSiteHidden(currentHost)) {
            return true;
        }

        // Check if user closed notification this session
        if (sessionStorage.getItem(sessionClosedKey) === 'true') {
            return true;
        }

        // Check if message was shown recently (within 10 minutes)
        const messageShownTime = localStorage.getItem(messageShownKey);
        if (messageShownTime) {
            const elapsed = Date.now() - parseInt(messageShownTime, 10);
            if (elapsed < CONFIG.messageDuration) {
                return true;
            }
        }

        return false;
    }

    // ===================
    // Feed Management
    // ===================

    function getCachedFeed() {
        const storedTime = localStorage.getItem(CONFIG.cacheTimeKey);
        const storedData = localStorage.getItem(CONFIG.cacheKey);

        // Both must exist and be valid
        if (!storedTime || !storedData) {
            return null;
        }

        const elapsed = Date.now() - parseInt(storedTime, 10);
        if (elapsed >= CONFIG.cacheDuration) {
            return null;
        }

        try {
            return JSON.parse(storedData);
        } catch {
            return null;
        }
    }

    function cacheFeed(data) {
        try {
            localStorage.setItem(CONFIG.cacheKey, JSON.stringify(data));
            localStorage.setItem(CONFIG.cacheTimeKey, Date.now().toString());
        } catch {
            // Storage full or unavailable, continue without caching
        }
    }

    async function fetchFeedWithRetry(url, retries = CONFIG.maxRetries) {
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const response = await gmFetch(url);
                return JSON.parse(response.responseText);
            } catch (error) {
                if (attempt < retries - 1) {
                    await sleep(CONFIG.retryDelays[attempt] || 4000);
                }
            }
        }
        return null;
    }

    async function getFeed() {
        // Try cache first
        const cached = getCachedFeed();
        if (cached) {
            return cached;
        }

        // Try primary feed
        let feed = await fetchFeedWithRetry(CONFIG.feedUrl);
        if (feed) {
            cacheFeed(feed);
            return feed;
        }

        // Try fallback
        feed = await fetchFeedWithRetry(CONFIG.fallbackUrl, 2);
        if (feed) {
            cacheFeed(feed);
            return feed;
        }

        return null;
    }

    // ===================
    // Merchant Matching
    // ===================

    function findMerchant(feed) {
        if (!feed?.merchants) {
            return null;
        }

        const merchants = feed.merchants;

        // Exact match
        if (merchants[currentHost]) {
            return merchants[currentHost];
        }

        // Try without www.
        const noWww = currentHost.replace(/^www\./, '');
        if (noWww !== currentHost && merchants[noWww]) {
            return merchants[noWww];
        }

        // Try with www. prefix
        if (!currentHost.startsWith('www.')) {
            const withWww = 'www.' + currentHost;
            if (merchants[withWww]) {
                return merchants[withWww];
            }
        }

        return null;
    }

    // ===================
    // Adblock Detection
    // ===================

    async function checkUrlBlocked(url) {
        try {
            const response = await fetch(url, { mode: 'no-cors' });
            // With no-cors, we can't read the response, but if we get here, it wasn't blocked
            return false;
        } catch {
            return true;
        }
    }

    async function checkBannerIds() {
        const bannerIds = ['AdHeader', 'AdContainer', 'AD_Top', 'homead', 'ad-lead'];
        const container = document.createElement('div');
        container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';

        bannerIds.forEach(id => {
            const div = document.createElement('div');
            div.id = id;
            div.innerHTML = '&nbsp;';
            container.appendChild(div);
        });

        document.body.appendChild(container);

        // Give adblockers time to hide elements
        await sleep(100);

        let blocked = false;
        bannerIds.forEach(id => {
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
            'https://widgets.outbrain.com/outbrain.js',
            'https://adligature.com/',
            'https://secure.quantserve.com/quant.js',
            'https://srvtrck.com/assets/css/LineIcons.css'
        ];

        try {
            const checks = await withTimeout(
                Promise.all([
                    ...adUrls.map(url => checkUrlBlocked(url)),
                    checkBannerIds()
                ]),
                CONFIG.adblockTimeout
            );

            // If any check returns true (blocked), adblock is detected
            return checks.some(blocked => blocked);
        } catch {
            // On timeout, assume no adblock to avoid false positives
            return false;
        }
    }

    // ===================
    // Notification UI
    // ===================

    function createNotification(merchant) {
        const shadowHost = document.createElement('div');
        document.body.appendChild(shadowHost);
        const shadowRoot = shadowHost.attachShadow({ mode: 'open' });

        const styles = `
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
            :host(.theme-dark) {
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
                --btn-bg-active: #6b6bff;
            }
            @media (prefers-color-scheme: dark) {
                :host(.theme-system) {
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
                    --btn-bg-active: #6b6bff;
                }
            }
            :host * {
                box-sizing: border-box;
                font-family: inherit;
                line-height: inherit;
            }

            .container {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 999999;
                width: 360px;
                max-width: calc(100vw - 40px);
                background: var(--bg);
                border-radius: 8px;
                box-shadow: 0 8px 24px var(--shadow);
                overflow: hidden;
                animation: slideIn 0.4s ease-out;
            }

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
            }

            .logo img {
                display: block;
                max-height: 28px;
            }

            .close-btn {
                width: 22px;
                height: 22px;
                cursor: pointer;
                transition: transform 0.2s;
            }
            .close-btn:hover {
                transform: scale(1.15);
            }
            :host(.theme-dark) .close-btn {
                filter: invert(1);
            }
            @media (prefers-color-scheme: dark) {
                :host(.theme-system) .close-btn {
                    filter: invert(1);
                }
            }

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
            :host(.theme-dark) .settings-btn {
                filter: invert(1);
            }
            @media (prefers-color-scheme: dark) {
                :host(.theme-system) .settings-btn {
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
            }
            @keyframes pulse {
                from { transform: scale(1); }
                to { transform: scale(1.03); }
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

            @media (max-width: 700px) {
                .checklist { display: none; }
                .reminder { display: none; }
            }
        `;

        const styleEl = document.createElement('style');
        styleEl.textContent = styles;
        shadowRoot.appendChild(styleEl);

        const container = document.createElement('div');
        container.className = 'container';
        container.setAttribute('role', 'dialog');
        container.setAttribute('aria-label', 'Trumf bonus varsling');

        // Apply theme class
        const currentTheme = getTheme();
        shadowHost.className = `theme-${currentTheme}`;

        // Header
        const header = document.createElement('div');
        header.className = 'header';

        const logo = document.createElement('div');
        logo.className = 'logo';
        const logoImg = document.createElement('img');
        logoImg.src = 'https://trumfnetthandel.no/dest/img/Trumf/notifier/nett-handel-wrapper-logo.svg';
        logoImg.alt = 'Trumf Netthandel';
        logo.appendChild(logoImg);

        const headerRight = document.createElement('div');
        headerRight.className = 'header-right';

        const settingsBtn = document.createElement('img');
        settingsBtn.className = 'settings-btn';
        settingsBtn.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>');
        settingsBtn.alt = 'Innstillinger';

        const closeBtn = document.createElement('img');
        closeBtn.className = 'close-btn';
        closeBtn.src = 'https://trumfnetthandel.no/dest/img/Trumf/notifier/close-button-wrapper.png';
        closeBtn.alt = 'Lukk';

        headerRight.appendChild(settingsBtn);
        headerRight.appendChild(closeBtn);

        header.appendChild(logo);
        header.appendChild(headerRight);

        // Body
        const body = document.createElement('div');
        body.className = 'body';

        const content = document.createElement('div');
        content.className = 'content';

        const cashback = document.createElement('span');
        cashback.className = 'cashback';
        cashback.textContent = merchant.cashbackDescription || '';

        const subtitle = document.createElement('span');
        subtitle.className = 'subtitle';
        subtitle.textContent = `Trumf-bonus hos ${merchant.name || 'denne butikken'}`;

        const reminder = document.createElement('p');
        reminder.className = 'reminder';
        reminder.textContent = 'Husk å:';

        const checklist = document.createElement('ol');
        checklist.className = 'checklist';
        ['Deaktivere uBlock Origin', 'Deaktivere AdGuard/Pi-Hole', 'Tømme handlevognen'].forEach(text => {
            const li = document.createElement('li');
            li.textContent = text;
            checklist.appendChild(li);
        });

        const actionBtn = document.createElement('a');
        actionBtn.className = 'action-btn';
        actionBtn.href = `https://trumfnetthandel.no/cashback/${merchant.urlName || ''}`;
        actionBtn.target = '_blank';
        actionBtn.rel = 'noopener noreferrer';
        actionBtn.textContent = 'Få Trumf-bonus';

        const hideSiteLink = document.createElement('span');
        hideSiteLink.className = 'hide-site';
        hideSiteLink.textContent = 'Ikke vis på denne siden';

        content.appendChild(cashback);
        content.appendChild(subtitle);
        content.appendChild(reminder);
        content.appendChild(checklist);
        content.appendChild(actionBtn);
        content.appendChild(hideSiteLink);
        body.appendChild(content);

        // Settings pane
        const settings = document.createElement('div');
        settings.className = 'settings';

        const settingsTitle = document.createElement('div');
        settingsTitle.className = 'settings-title';
        settingsTitle.textContent = 'Innstillinger';

        const themeRow = document.createElement('div');
        themeRow.className = 'setting-row';

        const themeLabel = document.createElement('span');
        themeLabel.className = 'setting-label';
        themeLabel.textContent = 'Utseende';

        const themeButtons = document.createElement('div');
        themeButtons.className = 'theme-buttons';

        const themes = [
            { id: 'light', label: 'Lys' },
            { id: 'dark', label: 'Mørk' },
            { id: 'system', label: 'System' }
        ];

        themes.forEach(theme => {
            const btn = document.createElement('span');
            btn.className = 'theme-btn' + (currentTheme === theme.id ? ' active' : '');
            btn.textContent = theme.label;
            btn.dataset.theme = theme.id;
            themeButtons.appendChild(btn);
        });

        themeRow.appendChild(themeLabel);
        themeRow.appendChild(themeButtons);

        const hiddenRow = document.createElement('div');
        hiddenRow.className = 'setting-row';

        const hiddenLabel = document.createElement('span');
        hiddenLabel.className = 'setting-label';
        hiddenLabel.textContent = 'Skjulte sider';

        const hiddenSites = getHiddenSites();
        const hiddenInfo = document.createElement('div');
        hiddenInfo.className = 'hidden-sites-info';
        hiddenInfo.textContent = hiddenSites.length > 0
            ? `${hiddenSites.length} side${hiddenSites.length > 1 ? 'r' : ''} skjult`
            : 'Ingen sider skjult';

        const resetHidden = document.createElement('span');
        resetHidden.className = 'reset-hidden';
        resetHidden.textContent = 'Nullstill';
        resetHidden.style.display = hiddenSites.length > 0 ? 'inline' : 'none';

        hiddenRow.appendChild(hiddenLabel);
        hiddenRow.appendChild(hiddenInfo);
        if (hiddenSites.length > 0) {
            hiddenInfo.appendChild(document.createTextNode(' - '));
            hiddenInfo.appendChild(resetHidden);
        }

        const backLink = document.createElement('span');
        backLink.className = 'settings-back';
        backLink.textContent = '← Tilbake';

        settings.appendChild(settingsTitle);
        settings.appendChild(themeRow);
        settings.appendChild(hiddenRow);
        settings.appendChild(backLink);
        body.appendChild(settings);

        // Info link
        const infoLink = document.createElement('a');
        infoLink.className = 'info-link';
        infoLink.href = 'https://github.com/kristofferR/Trumf-Bonusvarsler-Lite';
        infoLink.target = '_blank';
        infoLink.rel = 'noopener noreferrer';
        infoLink.textContent = 'i';
        infoLink.title = 'Om dette scriptet';

        container.appendChild(header);
        container.appendChild(body);
        container.appendChild(infoLink);
        shadowRoot.appendChild(container);

        // Event handlers
        function closeNotification() {
            sessionStorage.setItem(sessionClosedKey, 'true');
            shadowHost.remove();
            document.removeEventListener('keydown', handleKeydown);
        }

        function handleKeydown(e) {
            if (e.key === 'Escape') {
                closeNotification();
            }
        }

        closeBtn.addEventListener('click', closeNotification);
        document.addEventListener('keydown', handleKeydown);

        // Settings toggle
        settingsBtn.addEventListener('click', () => {
            content.classList.add('hidden');
            settings.classList.add('active');
        });

        backLink.addEventListener('click', () => {
            settings.classList.remove('active');
            content.classList.remove('hidden');
        });

        // Theme selection
        themeButtons.addEventListener('click', (e) => {
            const btn = e.target.closest('.theme-btn');
            if (!btn) return;

            const newTheme = btn.dataset.theme;
            setTheme(newTheme);
            shadowHost.className = `theme-${newTheme}`;

            themeButtons.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });

        // Reset hidden sites
        resetHidden.addEventListener('click', () => {
            localStorage.removeItem(hiddenSitesKey);
            hiddenInfo.textContent = 'Ingen sider skjult';
            resetHidden.style.display = 'none';
        });

        hideSiteLink.addEventListener('click', () => {
            hideSite(currentHost);
            shadowHost.remove();
            document.removeEventListener('keydown', handleKeydown);
        });

        actionBtn.addEventListener('click', () => {
            localStorage.setItem(messageShownKey, Date.now().toString());
            content.innerHTML = '';
            const confirmation = document.createElement('div');
            confirmation.className = 'confirmation';
            confirmation.textContent = 'Hvis alt ble gjort riktig, skal kjøpet ha blitt registrert.';
            content.appendChild(confirmation);
        });

        // Adblock detection
        detectAdblock().then(isBlocked => {
            if (isBlocked) {
                actionBtn.classList.add('adblock');
                actionBtn.textContent = 'Adblocker funnet!';
                actionBtn.removeAttribute('href');
                actionBtn.removeAttribute('target');
                actionBtn.style.pointerEvents = 'none';
                actionBtn.style.cursor = 'default';
            }
        });

        return shadowHost;
    }

    // ===================
    // Migration: Clean up old localStorage keys
    // ===================

    function migrateOldStorage() {
        // One-time cleanup of old "Trump" typo keys from v1.x
        const migrated = localStorage.getItem('TrumfBonusvarslerLite_Migrated');
        if (!migrated) {
            localStorage.removeItem('TrumpBonusvarslerLiteFeedData');
            localStorage.removeItem('TrumpBonusvarslerLiteFeedTimestamp');
            localStorage.setItem('TrumfBonusvarslerLite_Migrated', '1');
        }
    }

    // ===================
    // Main Initialization
    // ===================

    async function init() {
        migrateOldStorage();

        if (shouldSkipNotification()) {
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

    init();

})();
