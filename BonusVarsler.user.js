// ==UserScript==
// @name         BonusVarsler
// @description  Varsler deg når du er inne på en nettbutikk som gir cashback-bonus gjennom Trumf, re:member og andre tjenester.
// @namespace    https://github.com/kristofferR/BonusVarsler
// @version      6.0.0
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
    feedUrl:
      "https://raw.githubusercontent.com/kristofferR/BonusVarsler/main/sitelist.json",
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

  // Service registry - keep in sync with data/services.json
  const SERVICES = {
    trumf: {
      id: "trumf",
      name: "Trumf",
      clickthroughUrl: "https://trumfnetthandel.no/cashback/{urlName}",
      reminderDomain: "trumfnetthandel.no",
      color: "#4D4DFF",
      defaultEnabled: true,
    },
    remember: {
      id: "remember",
      name: "re:member",
      clickthroughUrl: "https://www.remember.no/reward/rabatt/{urlName}",
      reminderDomain: "remember.no",
      color: "#f28d00",
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
  const enabledServicesKey = "BonusVarsler_EnabledServices";
  const versionKey = "BonusVarsler_Version";
  const CURRENT_VERSION = "6.0";

  // Logo icon as data URI (64px for 2x retina, displayed at 32px)
  const LOGO_ICON_URL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAARIUlEQVR42t2aCYydV3WAv/Nvb5nx7B6P7fEaYxwnbR1sYkBAS0kCFW0oJISlUDVFaWgjgiqqkpYWEkHbULVIQEspQiqFtmqBICSKgBZUqRQUIA0hOLEx2OOM7fHs8/b377dSz5V+zdhjezwOCH/S1e+Z9/zenHPPOfcsV25/teGnTKVc5bDjctBx2O04jIlQQsgxLBjDqSjkB2nKd4HTXGU8fgoEZW7xPO7zfW53PRwRkAqUHRABR8D1wHXBGAhzMCFkGSQJT9aX+MdWiw8DKetE7rzL8BPkL/yABzwPnAqUBKIc8i7kOZhcBQZwHHBcVYLfC/09UK7oz90QmjWo1fhGs8F9wA+4QuQ1dxh+AnwwCPh91wMMpAlkqe5onqnwUAiPAREwQByDoBbRuwGqPbBxDAaHIcthYQ6Wlvj+/AyvASZYI/Isx4Db/ICvei6ACp7EKrgxqISAoBiWKWA5AliFOC4MDUP/EOzYrT+fOwsz03wcuHdtCrjd8Czx6aDEm0V0t5NEn1bwQmgD+OoGWVa4gQiIWFeoqulLAggYAQHiCKobYPM47N4LUQzTU3QnJ9gPnPppKuCk77PLFOZOnqMY+8ggiSCKVJAkhrQNYVq4QskBtwqeD0FJY0CpDF4vSAoAYaSK2rQF9lwP/QNw9jScmeQO4PNcArntJYarSLU8QNP1cKzw5NbcBcCoMqIQOi3oLkEztJaRAwYrfPF/chTHBd+HgWGo9uoK+sBJwQBRpEraeR3svRHqNThxnD8A/pqLIC+62XCV8AaGSfwAjApamLMB40NUh1YDlhYg7KpySjCD4dPk5iu5kf8FaixnXOAwwh0ivCESRDwY6oUNG6GnD/wSIKoEgJ174OcPQr0BTz3Bu4C/ZBXkFbcarhJNP6BXBPIVQS5Pod2ERh1qi/q6n5tP5AkPAAusATFyszh8JHK42fVheBT6B6EyrNYA6lLbr4NfeD7UluDYU9wJPMIFcGD9pCmPui69cL7waQyNJZg+C4tzkCV8BhDgHhV+zXwHOBwk5novZnJ2Cs6egsY5yARA48QzJ+DI92BoBMa387naItufFQWEXf7EdTgMYPLlwmcJNOswOw1RF/KYw8DruTocA3YEGQ92WnDmGViaUoVjoFyGiR/Bse/D+DbYez1PX3UFLJxjzHV4n+MAFMKLqNk3GzA/C0nEJCC6e5fH7h3SO7ZZHC7NQ35qXpDFMDMF9SUNvhgIDJw8DvMzsGWcHi/go6xAXvoCwzo4ElS4wQ9AZFm0150/B1GHE8CeyxOat3se73YcNqnoalV5xmeyJvcB86zC05Nm3PXldFCBLdugbwDEgTCETVvhppthdhaOHWEcOItFXrjfcIX8UmmQ/ypVwKa4YIk6UJuGWpMQqHAJxvvYUhrguOPRIwICIIBFAHusvhv481V342n2uQFHhzbA0DhUekEEwlBzhOv2wcSPeQx4/rpdQKp8UhxYaaRZCp02NDqQRuziEmzbyLbyAGcdhx6M3XF96jJg0O/xS/yZCB9ldY4FOffUOmqBGg+06Dp3Wo/eSpVDpybYuy4FtEJuEGGH64LI8pw+DjUJiSPeCUxzCTyfCXUfFbjb0uBZDaDiQRLq70wO9v2/m+e8ltX5RJ7xrYV5aDVtBlrSxOvMKT0VNo7ykXUpoBLwkONqdiYUO5TneganCYvAB7kE4yO8x3FwVXh1ne3PhYO3wA0vgxtfDgdfDmM7VABjAAHP5xEuQpBxq8mhswhxbH8nmoNkGfT1c9u6FCAV7nCtAgAEcEQ/vN2GJOY3uAxcl4codp4dN8DOG7RH0FqCVg3cAJ57CLbuhtAqwXEhzfgtVqfjZ/xDM4Swo3WHCTQDXZzTemF6mruvSAFRhxsdAbfYfRAQq4A0IQS+wiVIpxltzkOnDs15TWk374LmIpgONgao0M0u7NgPQblwN8/jPi5CHnN/nkJoq0yxSdrCrK0pBvg9AC+OWRPicadot8ZqQEtWEXWBLOOvuAwOvIy39fZDMACE4JWgEwEGhOWYNnhDMDAK9SmQMjgOh7g4rSTjqVaDG/oHiooy7Gjl6bocutKe4KtsrW6xscABDMQxH+Mi3PIqbvN8PudU2VC2Pb/YgOlqT0AEEAqs3+eZWl2cQ4nLQ3I+lCR8PIqgVAVEk7NOS132+DF2eKwRKXMAAXFQpLCAOAHgLKtw66/ykF/iPQLkIYRF6WubIIXMULiYxgnduUBAADFcAq073ICPJ7GNHQJ+DrU29FWhHHDYY+14IiAogpqXDWpPXmTn/9D3eQ8GciswZSjpEajK6IJRhS5XRBW6bajNqqtgwKTQniBp5OwBnuHC1IvSHHC1LE+aID3guNzksAYWW7gGi9iHBkTNBp0Ld2cPHGLUdfmAMUX31/WhNgkTj8HRR2H+uD3vy9YiKHBTmHwa0riwmCwCx8EbHOJUTz8DrILJmcht7wFVfFErBOzxZmqshSHN94ulAVF3zfOZ5AIMDvFJrPCg7538LszPg+PZTG1RP2v7fhjdAXGIUoYzT8LMWegdUAHIIZ4B8dT6xOc7wF4uQNrilEHbc1ifSm0nWoRNHmtAPLUA/TC7AMdagOMRshJ9/VdMDggEFThzFObmoNpX+H0FMCE8cwRKA/oakf6hC/NFsUUEQQ9EKfQMgLjgOTwnNRwCHmMF0qatQdsehag12AZsr8NaSMk1P9dV+Kk2L30PnxX8/AG2YYpUt9GE2UmobABVZrEo63ua0xC4RWDctFMbqM0F6BmB618K254HTqZWYPuF7+TCuI4qQDG67Fwi81gDnkPD+jGY5R9Y1VHWZlYgwjBWQEoQT0OWolhfl2XWor4ugtKFsZ1Q6dHvHRwDDGzeB/NnIBCwcehWVqLuNuJU1e2wGGwXOqbmsTZC9WVdjhUgzzW76hvgRlYQx8TqtyqMUliQumWBD8VkyD7j0LoEEHdtLhBoIDVYhOFV3G+H5xV5iqIKaDWZdlgjeX7+OCvLNBj5PodYQZ5y0hQuQDCg8cJ0AVNE/CK2QFyHrIja+iyWFaCwJGuVnVWqzVHPVwsoQhe0W5Cm/HDtCuhy1M70FHusCBAEuOPXUWU5YZYSa+zQMnfTDuiExSxg2QqgXofWIpR6rdAsF75SgoXTkCUoGtgeZwXpWba7Gh9AUMRaVQRhhyfWrgCfr2aZ7oDJrT+1IOxqe7p/iLtZQVznfXYnidowsg0271Fz7jYhaoEJi90OgKkjkKcaLIvd15+7DZg+YdNba1lZyr+xglKZu3v71DqhcCnj2+FMm285rBHT4TN5BnFcBMNOorV2pQIjIzzA+bw/Swo3iDswsA12HISte2HTLhjaB66rr1PWfv6PvgGNOSj1qODlHm18nvwmSFRYhrXGv2EFfpn7S2VwveVj97StbgYsyv7dhivAlMo6oi6VwQA9vbDv56BWg2NPcyPwFBT0Z9zUN8LjjmsVUZg8xs4BZ07B3GkVFAFC7Q1s6AG3F/IWtNp6REoZRQuwB4APQMFUnUMjw3y3d1SrQCyep7t/7gzfBF7scAXkGV9KE4i6VhC0HT1zDoY3wsZRPsX5fK8+z4vTZLnvmy6Yjpr14Cj0jVjLsq2sUgWiTPsGUa6JlAkKBSYJ/1MIX1Dt51MlLYMVU5Ts3fb/r78FcLkCsrYcw+NeRLXreZqU4MImzQQ2Nxt8G/gxyzkNPGQydgocoIjw5DauAEc7sxwxHrukKIdXoEpME74M3MIKFiJ+bXAj95eq+rcBGGv+caizCuBOANm3w3CFzHk+I/0D0NsPCKQp7HoObN8Nk6cAEC7CzBGeV4YXkVPKYSpJ+BowBzB3hpd7vXxMHPYIILLsKJ5JU+4BvsgFcPow5cHlpi9iT5hpmJni88AdAPKcrYYr5NWuzxfKFRga0S8z6DG3//la8j4zwePAQdbBU19CelwOulWGsy6NruFJoM0q9G7l0dIAh/0AxCmm044DYVfb442aDkdUAeOGdXDaM4z3j0LfoH5hFMHW7bD/gMaE6Sk+C9zFT4DZ43wiGOStnnd+ipmn2hSdnebrULiNwzrIMg7lrmZV3bYdQpT0vs6JYzC2BTZu4nUIj/AsM3WSj1U38tagdH7aa3JoNex0OuaOqzkdnkki5qIQmnUNMAL4Hpye0MHklnHYOMprHW2WPCt06nxjeIx7gzKIYBM0S6B3E+amIezwEFCHApd14IicSGuM40KWYy3AngqOHo1ZBtt2AQGjZDzY7XBUc4T1E9V4lbgcD8psRyDVErc4OEr2Gs4MdDqcBl4NsG4F9A86w0FJOsBgDqRLQEmLExHo64fcqCnWFjRf2LIVejYAhtd5Hnd3OzwJTHAFdDvcXCrxH+Ve3uG4kMS6issZICUIl3QT6nVIIzYDKSuQl6x9PH7QGB5LEk1pwzZ0Z/XL/WHwS1oTjG6GNAdB0+bBEdi2E/qHodXU1DmJSdsdPthp80ngKBfDsK+vn990Xd7hVKiWRIWLupAmy7NL42OF18CXRuaFwKNcAHnl2u4IvT7P+Nck0S+NIy1muk1MNKeK90d0grOhH/rHIBCAYnI0NApjW3USlMawtGRLWy2xF/KcCYFzCCIOYwK7RRgSgXJFraxR0yMttbsORfs8c6G7CI2aWl8SGr0ftApy1+XfFX4wjnhv2FFf08xNLaDdgLAJ8SIgEIyAX1aT7xtQi0hT65sxZJ7+rlLV49MPAClG41BgjH5PswZRqCtNVnSlxLa7GxrtF/RWCmlqbge+uO7b4hsG+Gy5zJ1Tk7YJKWBcEHu+xiVMEoJUkawD0Zx5nFHpme/y3DjW3erdAL7GAAQ9NVpzsHAGvCo42lIrZgJF81IVnqrQxrCcQNvmtVkVvrag781ScxPwxLqvy49s4nt9AxyYPAlJAgIgulzblnZcBAEjYDyNE9qNNP9Sm5c3NuswMAi9bUylingbgETfawSyEEVYwXKBRYr8xgTgxtCYhVbLjr4T8DKeAG7iMnFZhSx3ymO7WBroY/vkSfWpPDtf+3FHZ21hR/+AzJibgSmUR9zUfN2Fu9odCVoNJEkh6RSfVSpD7oHkXBCxq1wC11E36TShZQPc/LRak5eC45t7gd9hDcgb32K4AHvHx/mh68IzJzWJ8APAUKCzNr2ZtaixIEvyPwXezwUoV/htceTvokgCI5or9PZBqWQrSr9wAbFS216fdYUi8MZNaNsA6Bkwmfl74G1cAfLWewwreMXIJr5iDEyegDk7TxeWk3vQnNH0srsAqWP+G/hFLkHgm19G5EGEl0SRIACOCu66UHFBKoX565Xa5feGfAOUTI0uHwAeZh3IPfcaKLh/ZJQPxTFMnlQTs3d/EZY/uy0Vfn4WXJcECFgjrmS3gLwB5DaEbcSAESh8XSkZgBRjvm0MXzCh+RQwC+vHK/yaD28c4+1te+syrBXCr0CnNPber+8b0sTs5sr4mi6LkzlEMiplp0cENzdZhJEaUOdZQt70JgPwrs3jPByGMHUawjpgfd6giP13JtCYgaVzeibnbv5m4J/5GcWbOYszvouHs1yFj8JCeDi/pm7V9dZ3MwTXNf+kwv/s4rkuf+x7MH2maHIagOKJAHkA3bqafn0JPM+cBd7CzzheuMitcz1gWFFHs3wkFS1Bo6Z5tucZsrbZwzWAt9TE9WtQ6b1A9mV0RV3d9fYipC7kmbkNCLkGcNptHq8vAUazMiyCJilRRxOdVgMSIEvzh4H/5BrBSSPzocVZODeppW3gqeCeq/fsF+ag2cA2HMwTwB9xDSF7hnKAL0fIK3sCCPrs/CyFKKLotGQmBkpcY8iu0RzLo8bIYQOWYphpjDkK7OcaRLYPZVDw6wZ5L8iNCLmY/Ik8z98H/DvXKP8HI9+T+ac9dXMAAAAASUVORK5CYII=";

  // Logo icon for re:member (orange hue)
  const LOGO_ICON_REMEMBER_URL =
    "data:image/png;base64,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";

  // Shared CSS for notification UI
  const BASE_CSS = `
        :host {
            all: initial;
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 15px;
            line-height: 1.6;
            --bg: #fff;
            --bg-transparent: rgba(255, 255, 255, 0.97);
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
            --bg-transparent: rgba(30, 30, 30, 0.97);
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
                --bg-transparent: rgba(30, 30, 30, 0.97);
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

  async function gmDeleteValue(key) {
    try {
      // Use GM.deleteValue (GM4+) or fall back to GM_deleteValue (GM3/iOS)
      if (typeof GM !== "undefined" && GM.deleteValue) {
        return await GM.deleteValue(key);
      } else if (typeof GM_deleteValue !== "undefined") {
        return GM_deleteValue(key);
      }
      // Fallback to localStorage if no GM storage available
      localStorage.removeItem(key);
    } catch {
      // Storage unavailable, fail silently
    }
  }

  // Settings cache (loaded at init, used synchronously)
  let settingsCache = {
    hiddenSites: new Set(),
    theme: "system",
    startMinimized: false,
    position: "bottom-right", // default position
    sitePositions: {}, // per-site position overrides
    enabledServices: null, // loaded at init
  };

  // Get default enabled services from SERVICES registry
  function getDefaultEnabledServices() {
    return Object.values(SERVICES)
      .filter((s) => s.defaultEnabled)
      .map((s) => s.id);
  }

  // Run version-based migrations
  async function runMigrations() {
    try {
      const storedVersion = await gmGetValue(versionKey, null);

      // Version 6.0 migration: Clear all cache to fix multi-service issues
      if (storedVersion !== CURRENT_VERSION) {
        // Clear all settings for a clean slate
        await gmDeleteValue(hiddenSitesKey);
        await gmDeleteValue(themeKey);
        await gmDeleteValue(startMinimizedKey);
        await gmDeleteValue(positionKey);
        await gmDeleteValue(sitePositionsKey);
        await gmDeleteValue(enabledServicesKey);
        await gmDeleteValue(CONFIG.cacheKey);
        await gmDeleteValue(CONFIG.cacheTimeKey);
        await gmDeleteValue(CONFIG.hostIndexKey);
        await gmDeleteValue(reminderShownKey);

        // Set version to prevent re-running migration
        await gmSetValue(versionKey, CURRENT_VERSION);

        console.log("[BonusVarsler] Migrated to version", CURRENT_VERSION);
      }
    } catch {
      // Migration failed, continue anyway
    }
  }

  async function loadSettings() {
    // Run migrations first
    await runMigrations();

    const hiddenSitesArray = await gmGetValue(hiddenSitesKey, []);
    settingsCache.hiddenSites = new Set(hiddenSitesArray);
    settingsCache.theme = await gmGetValue(themeKey, "system");
    settingsCache.startMinimized = await gmGetValue(startMinimizedKey, false);
    settingsCache.position = await gmGetValue(positionKey, "bottom-right");
    settingsCache.sitePositions = await gmGetValue(sitePositionsKey, {});
    // Load enabled services, default to Trumf-only for existing users
    let enabledServices = await gmGetValue(enabledServicesKey, null);
    if (!enabledServices) {
      enabledServices = getDefaultEnabledServices();
    }
    settingsCache.enabledServices = enabledServices;
  }

  function getEnabledServices() {
    return settingsCache.enabledServices || getDefaultEnabledServices();
  }

  function isServiceEnabled(serviceId) {
    return getEnabledServices().includes(serviceId);
  }

  async function setEnabledServices(services) {
    settingsCache.enabledServices = services;
    await gmSetValue(enabledServicesKey, services);
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

  /**
   * Find the best offer for the current host from the feed
   * @param {object} feed - The merchant feed data
   * @returns {{ merchant: object, offer: object, service: object } | null}
   */
  function findBestOffer(feed) {
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

    // Handle new unified format with offers array
    if (merchant.offers && Array.isArray(merchant.offers)) {
      const enabledServices = getEnabledServices();

      // Filter offers to enabled services only
      const eligibleOffers = merchant.offers.filter((offer) =>
        enabledServices.includes(offer.serviceId),
      );

      if (eligibleOffers.length === 0) {
        return null;
      }

      // Sort by rate (best first)
      eligibleOffers.sort((a, b) =>
        compareCashbackRates(b.cashbackDescription, a.cashbackDescription),
      );

      const bestOffer = eligibleOffers[0];
      const service =
        SERVICES[bestOffer.serviceId] || feed.services?.[bestOffer.serviceId];

      if (!service) {
        return null;
      }

      return {
        merchant,
        offer: bestOffer,
        service,
      };
    }

    // Handle old Trumf-only format for backwards compatibility
    if (!isServiceEnabled("trumf")) {
      return null;
    }

    const service = SERVICES.trumf;
    return {
      merchant,
      offer: {
        serviceId: "trumf",
        urlName: merchant.urlName,
        cashbackDescription: merchant.cashbackDescription,
      },
      service,
    };
  }

  // ===================
  // Rate Parsing and Comparison
  // ===================

  /**
   * Parse a cashback rate description into a comparable object
   * @param {string} description - e.g. "5,4%", "Opptil 4,6%", "35kr"
   * @returns {{ value: number, type: 'percent'|'fixed', isVariable: boolean }}
   */
  function parseCashbackRate(description) {
    if (!description) {
      return { value: 0, type: "percent", isVariable: false };
    }

    const normalized = description.toLowerCase().trim();
    // Match numeric ranges like "10-15", "10 - 15", "10–15", "10%-15%"
    const rangePattern = /\d+%?\s*[-–]\s*\d+%?/;
    const isVariable =
      normalized.startsWith("opptil") ||
      normalized.startsWith("opp til") ||
      normalized.startsWith("up to") ||
      rangePattern.test(normalized);

    // Match percentage: "5,4%", "5.4%", "Opptil 4,6%"
    const percentMatch = normalized.match(/([\d,\.]+)\s*%/);
    if (percentMatch) {
      const value = parseFloat(percentMatch[1].replace(",", "."));
      return { value, type: "percent", isVariable };
    }

    // Match fixed amount: "35kr", "35 kr", "35 NOK"
    const fixedMatch = normalized.match(/([\d,\.]+)\s*(kr|nok)/i);
    if (fixedMatch) {
      const value = parseFloat(fixedMatch[1].replace(",", "."));
      return { value, type: "fixed", isVariable };
    }

    return { value: 0, type: "percent", isVariable: false };
  }

  /**
   * Compare two cashback rates
   * @param {string} a - First cashback description
   * @param {string} b - Second cashback description
   * @param {number} [avgPurchaseAmount=500] - Average purchase for comparing percent vs fixed
   * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
   */
  function compareCashbackRates(a, b, avgPurchaseAmount = 500) {
    const rateA = parseCashbackRate(a);
    const rateB = parseCashbackRate(b);

    // When types differ, compare monetary equivalents
    if (rateA.type !== rateB.type) {
      const monetaryA =
        rateA.type === "percent"
          ? (rateA.value / 100) * avgPurchaseAmount
          : rateA.value;
      const monetaryB =
        rateB.type === "percent"
          ? (rateB.value / 100) * avgPurchaseAmount
          : rateB.value;

      if (monetaryA > monetaryB) return 1;
      if (monetaryA < monetaryB) return -1;
      // If equal, prefer percentage
      if (rateA.type === "percent") return 1;
      return -1;
    }

    // Same type: higher value wins
    if (rateA.value !== rateB.value) {
      return rateA.value > rateB.value ? 1 : -1;
    }

    // Non-variable preferred over variable (at same value)
    if (rateA.isVariable !== rateB.isVariable) {
      return rateA.isVariable ? -1 : 1;
    }

    return 0;
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
  // Cashback Page Reminder
  // ===================

  /**
   * Check if we're on a cashback portal page for any enabled service
   * @returns {{ isOnPage: boolean, service: object | null }}
   */
  function isOnCashbackPage() {
    const enabledServices = getEnabledServices();

    for (const serviceId of enabledServices) {
      const service = SERVICES[serviceId];
      if (!service || !service.reminderDomain) continue;

      const domain = service.reminderDomain;
      const isServiceDomain =
        currentHost === domain || currentHost === `www.${domain}`;

      if (isServiceDomain) {
        // Check for cashback path (varies by service)
        const path = window.location.pathname;
        if (
          path.startsWith("/cashback/") ||
          path.startsWith("/shop/") ||
          path.startsWith("/butikk/") ||
          path.startsWith("/reward/")
        ) {
          return { isOnPage: true, service };
        }
      }
    }

    return { isOnPage: false, service: null };
  }

  /**
   * Check if we should show the reminder notification
   * @returns {{ show: boolean, service: object | null }}
   */
  function shouldShowReminder() {
    const { isOnPage, service } = isOnCashbackPage();

    // Only show on cashback pages
    if (!isOnPage) {
      return { show: false, service: null };
    }

    // Check if reminder was shown this session
    if (sessionStorage.getItem(reminderShownKey) === "true") {
      return { show: false, service: null };
    }

    return { show: true, service };
  }

  function createReminderNotification(service) {
    const serviceName = service?.name || "Trumf";
    const serviceColor = service?.color || SERVICES.trumf.color;

    const shadowHost = document.createElement("div");
    shadowHost.style.cssText =
      "all:initial !important;position:fixed !important;bottom:0 !important;right:0 !important;z-index:2147483647 !important;display:block !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;";
    document.body.appendChild(shadowHost);
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });

    const styles =
      BASE_CSS +
      `
            :host {
                --accent: ${serviceColor};
                --accent-hover: ${serviceColor};
            }
            .header-right {
                display: flex;
                align-items: center;
            }
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
            .reminder-mini {
                font-weight: 700;
                font-size: 16px;
                color: var(--accent);
                margin-left: auto;
                padding: 0 16px;
                opacity: 0;
                max-width: 0;
                overflow: hidden;
                text-align: center;
                transition: opacity 0.2s ease, max-width 0.3s ease;
            }
            .container.minimized .reminder-mini {
                opacity: 1;
                max-width: 50px;
            }
            .minimize-btn {
                transition: opacity 0.2s ease, transform 0.2s ease;
            }
            .container.minimized .minimize-btn {
                opacity: 0;
                pointer-events: none;
                width: 0;
                margin: 0;
                overflow: hidden;
            }
        `;

    const styleEl = document.createElement("style");
    styleEl.textContent = styles;
    shadowRoot.appendChild(styleEl);

    const container = document.createElement("div");
    container.className = `container animate-in ${getPosition()}`;
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-label", `${serviceName} bonus påminnelse`);

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
    logoIcon.src =
      service.id === "remember" ? LOGO_ICON_REMEMBER_URL : LOGO_ICON_URL;
    logoIcon.alt = "";
    const logoText = document.createElement("span");
    logoText.textContent = "BonusVarsler";
    logo.appendChild(logoIcon);
    logo.appendChild(logoText);

    const headerRight = document.createElement("div");
    headerRight.className = "header-right";

    // Reminder badge for minimized state
    const reminderMini = document.createElement("span");
    reminderMini.className = "reminder-mini";
    reminderMini.textContent = "!";

    const minimizeBtn = document.createElement("button");
    minimizeBtn.className = "minimize-btn";
    minimizeBtn.setAttribute("aria-label", "Minimer");

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.setAttribute("aria-label", "Lukk");

    headerRight.appendChild(reminderMini);
    headerRight.appendChild(minimizeBtn);
    headerRight.appendChild(closeBtn);

    header.appendChild(logo);
    header.appendChild(headerRight);

    // Body
    const body = document.createElement("div");
    body.className = "body";

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = "Viktig påminnelse!";

    const message = document.createElement("p");
    message.className = "message";
    message.textContent =
      "For å være sikker på at bonusen registreres, må du logge inn og klikke på knappen som tar deg til butikken.";

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

    // Minimize/expand toggle
    minimizeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      container.classList.add("minimized");
    });

    // Click header to expand when minimized
    container.addEventListener("click", (e) => {
      if (container.classList.contains("minimized")) {
        if (!e.target.closest(".close-btn")) {
          container.classList.remove("minimized");
        }
      }
    });

    // Make draggable to corners
    makeCornerDraggable(container, header);

    return shadowHost;
  }

  // ===================
  // Notification UI
  // ===================

  function createNotification(match) {
    const { merchant, offer, service } = match;
    const serviceName = service.name;
    const serviceColor = service.color;
    const cashbackDescription = offer.cashbackDescription || "";
    const urlName = offer.urlName || "";
    const clickthroughUrl = service.clickthroughUrl.replace(
      "{urlName}",
      urlName,
    );

    const shadowHost = document.createElement("div");
    shadowHost.style.cssText =
      "all:initial !important;position:fixed !important;bottom:0 !important;right:0 !important;z-index:2147483647 !important;display:block !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;";
    document.body.appendChild(shadowHost);
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });

    const styles =
      BASE_CSS +
      `
            :host {
                --accent: ${serviceColor};
                --accent-hover: ${serviceColor};
            }
      ` +
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

            .cashback.has-details {
                cursor: pointer;
                position: relative;
            }

            .cashback-tooltip {
                display: none;
                position: fixed;
                width: 320px;
                max-height: 70vh;
                overflow-y: auto;
                padding: 12px;
                background: var(--bg-transparent, rgba(30, 30, 30, 0.97));
                border: 1px solid var(--border);
                border-radius: 10px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                font-size: 13px;
                font-weight: 400;
                color: var(--text);
                z-index: 10;
                white-space: normal;
                line-height: 1.4;
            }

            .cashback.has-details:hover .cashback-tooltip,
            .cashback.has-details.tooltip-visible .cashback-tooltip {
                display: block;
            }

            .cashback-tooltip-item {
                display: flex;
                gap: 8px;
                margin-bottom: 8px;
            }
            .cashback-tooltip-item:last-child {
                margin-bottom: 0;
            }

            .cashback-tooltip-value {
                font-weight: 600;
                color: var(--accent);
                white-space: nowrap;
                min-width: 45px;
            }

            .cashback-tooltip-desc {
                flex: 1;
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
    container.setAttribute("aria-label", `${serviceName} bonus varsling`);

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
    logoIcon.src =
      service.id === "remember" ? LOGO_ICON_REMEMBER_URL : LOGO_ICON_URL;
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
    cashbackMini.textContent = cashbackDescription;

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
    cashback.textContent = cashbackDescription;

    const subtitle = document.createElement("span");
    subtitle.className = "subtitle";
    subtitle.textContent = `${serviceName}-bonus hos ${merchant.name || "denne butikken"}`;

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
    actionBtn.href = clickthroughUrl;
    actionBtn.target = "_blank";
    actionBtn.rel = "noopener noreferrer";
    actionBtn.textContent = `Få ${serviceName}-bonus`;

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

    // Check if we should show the reminder on a cashback portal page
    const { show: showReminder, service: reminderService } =
      shouldShowReminder();
    if (showReminder) {
      createReminderNotification(reminderService);
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
    if (!match) {
      return;
    }

    createNotification(match);
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

    // Service toggle commands
    const enabledServices = getEnabledServices();
    for (const serviceId of Object.keys(SERVICES)) {
      const service = SERVICES[serviceId];
      const isEnabled = enabledServices.includes(serviceId);
      registerMenuCommand(
        `${service.name}: ${isEnabled ? "På ✓" : "Av"}`,
        async () => {
          const current = getEnabledServices();
          let newServices;

          if (current.includes(serviceId)) {
            // Disabling - prevent disabling all services
            if (current.length === 1) {
              alert("Du må ha minst én tjeneste aktivert.");
              return;
            }
            newServices = current.filter((id) => id !== serviceId);
          } else {
            // Enabling
            newServices = [...current, serviceId];
          }

          await setEnabledServices(newServices);
          alert(
            `${service.name}: ${newServices.includes(serviceId) ? "På" : "Av"}\n\nLast siden på nytt for å se endringen.`,
          );
        },
      );
    }

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
