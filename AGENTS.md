# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Trumf Bonusvarsler Lite is a userscript that displays notifications when users visit online stores that offer Trumf bonus (a Norwegian loyalty program). It runs in userscript managers like Violentmonkey and the iOS Userscripts app.

## Architecture

**Single-file userscript**: `Trumf-Bonusvarsler-Lite.user.js` (v2.2.0) contains all logic, organized in sections:

1. **Configuration** - URLs, cache durations, storage keys
2. **Utility Functions** - `sleep()`, `gmFetch()` (Promise wrapper for GM.xmlHttpRequest), `withTimeout()`
3. **Hidden Sites Management** - Persistent per-site dismissal
4. **Theme Management** - Light/Dark/System preference
5. **Early Exit Checks** - Skip if hidden, session-closed, or recently shown
6. **Feed Management** - Fetch with retry/backoff, caching, fallback to sitelist.json
7. **Merchant Matching** - Host matching with www/non-www variations
8. **Adblock Detection** - Multiple fetch checks + DOM banner detection with timeout
9. **Notification UI** - Shadow DOM with CSS custom properties for theming
10. **Migration** - Cleanup of old localStorage keys

**Data file**: `sitelist.json` serves as the backup merchant feed with the same structure as the primary CDN feed.

## Key Features

- **Settings pane**: Cog icon toggles between notification and settings view
- **Theme selector**: Light / Dark / System (follows OS preference via CSS custom properties)
- **Per-site hiding**: "Ikke vis på denne siden" permanently hides notifications for a site
- **Keyboard support**: ESC closes notification
- **Responsive**: Hides checklist on narrow screens (<700px)

## Key Implementation Details

- Uses `GM.xmlHttpRequest` wrapped in Promises with async/await
- Exponential backoff on retries (100ms, 500ms, 1s, 2s, 4s)
- Feed cached in localStorage for 6 hours
- Shadow DOM isolates styles from host page
- CSS custom properties (`--bg`, `--text`, `--accent`, etc.) enable theming
- Theme applied via class on shadow host: `.theme-light`, `.theme-dark`, `.theme-system`

## Storage Keys

- `TrumfBonusvarslerLite_FeedData_v2` / `_FeedTime_v2` - Cached feed
- `TrumfBonusvarslerLite_HiddenSites` - JSON array of hidden hostnames
- `TrumfBonusvarslerLite_Theme` - "light", "dark", or "system"
- `TrumfBonusvarslerLite_Closed_<host>` (sessionStorage) - Session dismissal
- `TrumfBonusvarslerLite_MessageShown_<host>` - 10-minute cooldown timestamp

## Development Notes

- Version number is in the userscript header block (line 5)
- The `@match *://*/*` pattern means the script runs on all sites
- The `@connect` directives whitelist domains for GM.xmlHttpRequest
- Update URLs point to GitHub raw files for automatic updates

## Language

The userscript UI is in Norwegian. Use Norwegian for user-facing strings.
