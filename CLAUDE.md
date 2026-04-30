# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NewGame+Save is a game price comparison web app. It compares prices across Steam and multiple external stores (via IsThereAnyDeal API), displays them in the user's local currency, and includes Steam wishlist import and HowLongToBeat integration. The UI is in Spanish by default with i18n support for EN/PT/FR.

## Running the App

```bash
# Install dependencies (Python venv already exists at ./venv)
pip install -r requirements.txt

# Run (auto-opens browser at http://localhost:5000)
python app.py
```

On Windows, double-click `iniciar.bat` which handles dependency install + launch.

## Architecture

**Single-file Flask backend** (`app.py`) — no database, no ORM, all state is in-memory caches. The app runs as a local desktop tool, not a deployed service.

**Frontend** is vanilla JS (no framework, no build step) served as static files:
- `templates/index.html` — Jinja2 template with two tab panes: Search and Wishlist
- `static/app.js` — search flow, price rendering, media panel (screenshots/videos via HLS.js)
- `static/wishlist.js` — wishlist loading, paginated card grid, HLTB badge integration, localStorage caching
- `static/i18n.js` — translation strings (`I18N` dict) and currency formatting config (`CURR` dict)
- `static/style.css` — dark theme, CSS custom properties in `:root`

## Key Data Flow

1. **Search**: Frontend → `/api/search` → Steam storesearch API → autocomplete suggestions
2. **Prices**: Frontend → `/api/prices` → parallel calls to Steam appdetails + ITAD prices/v3 (querying 8 countries concurrently via ThreadPoolExecutor) → deduplicates by store, keeps cheapest
3. **Wishlist**: Frontend → `/api/wishlist` (loads full wishlist via IWishlistService) → then individual `/api/wishlist/prices` calls per game (batched 4 at a time client-side) → ITAD lookup + prices across multiple countries
4. **HLTB**: Frontend → `/api/hltb` → howlongtobeatpy search with name cleaning/fallback logic → cached in-memory on backend + localStorage on frontend

## External APIs

- **Steam Store API** — game search, app details, price lookup, wishlist. Uses browser-like `User-Agent` headers to avoid 403s (`STEAM_HEADERS` / `steam_get()`)
- **IsThereAnyDeal (ITAD)** — cross-store price comparison. API key is in `ITAD_API_KEY`. Endpoints: `/games/lookup/v1`, `/games/lookup/v2`, `/games/prices/v3`, `/games/bundles/v2`
- **Exchange rates** — frankfurter.app (primary), open.er-api.com (fallback), hardcoded fallbacks in `CURRENCY_CONFIG`
- **HowLongToBeat** — via `howlongtobeatpy` Python library, with fuzzy name matching (similarity threshold 0.35)

## Multi-Currency / Multi-Language

Six currencies configured in `CURRENCY_CONFIG` (COP, USD, MXN, ARS, BRL, EUR) — each maps to a Steam country code and ITAD country. Four UI languages in `STEAM_LANG` and `I18N`. Currency conversion happens server-side; the frontend just displays `priceNative` values.

## Caching Strategy

- Backend: `_hltb_cache` dict (in-memory, per-process, never expires)
- Frontend: wishlist data cached in `localStorage` with 30-min TTL (`newgamesave_wishlist_v2`), HLTB results cached permanently (`newgamesave_hltb_v1`), Steam ID persisted for auto-reload (`newgamesave_steamid`). Legacy `gamewise_*` keys are migrated/cleaned automatically on first load.
