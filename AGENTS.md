# AGENTS.md

This file provides guidance to AI coding agents (Codex, etc.) when working with code in this repository.

## Project Overview

BonusVarsler Lite is a browser extension and userscript that displays notifications when users visit online stores that offer Trumf cashback bonus.

### Roadmap
1. **Current**: Release BonusVarsler Lite (for Trumf) - Trumf-only version
2. **Next**: Develop BonusVarsler (for Trumf, re:member, OBOS, SAS +++) with multi-program support
3. **Future**: Transition extension users from BonusVarsler Lite to BonusVarsler (both will coexist during transition period)

Note: The userscript is already named "BonusVarsler" (without "Lite") and will simply be updated in place when adding more services - no transition needed.

## Architecture

The project has two versions that share most code:

### Web Extension (Primary)
- `content.js` - Main content script with all notification logic
- `background.js` - Service worker for feed fetching (handles CORS)
- `options.html/js/css` - Settings page
- `manifest.json` - Extension manifest (Manifest V3)
- `_locales/*/messages.json` - i18n translations (6 languages)

### Userscript (Legacy)
- `BonusVarsler.user.js` - Self-contained single file with all logic (Norwegian only)
- Note: Userscript is named "BonusVarsler" (without "Lite") since it's easy to update when adding more services
- `Trumf-Bonusvarsler-Lite.user.js` - Copy of userscript for backwards compatibility (one-time migration to new URL)

### Data
- `sitelist.json` - Backup merchant feed (same structure as CDN feed)

## Code Organization (content.js / userscript)

1. **Configuration** - URLs, cache durations, storage keys, domain aliases
2. **i18n** - Message loading and placeholder substitution (extension only)
3. **Utility Functions** - `sleep()`, `withTimeout()`
4. **Browser Storage** - Settings cache, getValue/setValue helpers
5. **Hidden Sites Management** - Persistent per-site dismissal
6. **Theme Management** - Light/Dark/System preference
7. **Position Management** - Default + per-site position overrides
8. **Feed Management** - Fetch with caching, fallback to sitelist.json
9. **Merchant Matching** - Host matching with www/non-www variations and domain aliases
10. **Adblock Detection** - URL fetch checks + DOM banner ID detection (skips URL checks on CSP-restricted sites)
11. **Draggable Corner Snap** - Drag notification to corners with smooth animation
12. **Reminder Notification** - Shows on trumfnetthandel.no/cashback/* pages
13. **Main Notification UI** - Shadow DOM with CSS custom properties for theming

## Key Features

- **Adblock detection** with re-check button (refresh icon)
- **Settings pane**: Theme, start minimized, default position, hidden sites
- **Draggable**: Drag to any corner, position saved per-site
- **i18n**: 6 languages (no, en, sv, da, fr, es)
- **Per-site hiding**: Permanently hide notifications for specific sites
- **Minimized mode**: Collapses to header with cashback badge
- **Keyboard support**: ESC closes notification

## Key Implementation Details

- Shadow DOM isolates styles from host page
- CSS custom properties (`--bg`, `--text`, `--accent`, etc.) enable theming
- Theme applied via class on shadow host: `tbvl-light`, `tbvl-dark`, `tbvl-system`
- Feed cached in browser storage for 48 hours
- CSP-restricted sites skip URL-based adblock checks to avoid false positives

## Storage Keys (browser.storage.local)

- `BonusVarsler_FeedData_v3` / `_FeedTime_v3` / `_HostIndex_v3` - Cached feed
- `BonusVarsler_HiddenSites` - Array of hidden hostnames
- `BonusVarsler_Theme` - "light", "dark", or "system"
- `BonusVarsler_StartMinimized` - Boolean
- `BonusVarsler_Position` - Default position
- `BonusVarsler_SitePositions` - Per-site position overrides
- `BonusVarsler_Language` - Language code

## Development Notes

- Web extension version is primary; userscript is maintained for compatibility
- Userscript uses hardcoded Norwegian strings; extension uses i18n
- Both versions should be kept in sync for core functionality
- Version number in manifest.json and userscript header

## Language

The userscript UI is in Norwegian. The extension supports multiple languages via `_locales/`. Use Norwegian for the primary language.
