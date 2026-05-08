# routes/atl.py — Featured deals banner.
# Fuente: Steam Storefront API `featuredcategories` (endpoint JSON publico,
# misma familia que appdetails/storesearch que ya usamos). Combina
# `specials` (deals curados por Steam) + `top_sellers` (mas vendidos del
# momento), dedupe por appid, filtra los que tengan descuento real.
# new_releases queda fuera por baja calidad de catalogo (mayormente indies
# muy chicos).

import time
import requests
from flask import Blueprint, jsonify, request

from ..config import CURRENCY_CONFIG, STEAM_LANG, STEAM_HEADERS

# Map currency → idioma del frontend, para pasarle a Steam el `l` correcto.
_CURRENCY_TO_LANG = {
    "COP": "es", "USD": "en", "MXN": "es", "ARS": "es",
    "BRL": "pt", "CLP": "es", "EUR": "es",
}


bp_atl = Blueprint("atl", __name__)

_atl_cache = {}              # {currency: (timestamp, [games])}
_CACHE_TTL = 30 * 60         # 30 min


def _build_game(item, currency):
    appid = item.get("id")
    if not appid:
        return None

    discount = item.get("discount_percent") or 0
    if discount <= 0:
        return None  # solo juegos con descuento real

    final_cents = item.get("final_price") or 0
    original_cents = item.get("original_price") or 0
    if final_cents <= 0 or original_cents <= 0:
        return None

    name = (item.get("name") or "").strip()
    if not name:
        return None

    appid_str = str(appid)
    cover_fallback = (
        item.get("large_capsule_image")
        or item.get("header_image")
        or f"https://cdn.akamai.steamstatic.com/steam/apps/{appid_str}/capsule_616x353.jpg"
    )

    return {
        "title":          name,
        "appid":          appid_str,
        "cover":          f"https://cdn.akamai.steamstatic.com/steam/apps/{appid_str}/library_hero.jpg",
        "coverFallback":  cover_fallback,
        "store":          "Steam",
        "storeId":        "steam",
        "priceNative":    round(final_cents / 100, 2),
        "originalNative": round(original_cents / 100, 2),
        "discount":       discount,
        "currency":       currency,
        "url":            f"https://store.steampowered.com/app/{appid_str}/",
    }


@bp_atl.route("/api/atl-today")
def api_atl_today():
    currency = request.args.get("currency", "COP")
    try:
        limit = min(max(int(request.args.get("limit", 7)), 1), 20)
    except ValueError:
        limit = 7

    now = time.time()
    cached = _atl_cache.get(currency)
    if cached and now - cached[0] < _CACHE_TTL:
        return jsonify({"games": cached[1][:limit]})

    cc = CURRENCY_CONFIG.get(currency, CURRENCY_CONFIG["COP"])["cc"]
    lang_short = _CURRENCY_TO_LANG.get(currency, "en")
    steam_lang = STEAM_LANG.get(lang_short, "english")

    games = []
    seen = set()
    try:
        r = requests.get(
            "https://store.steampowered.com/api/featuredcategories",
            params={"cc": cc, "l": steam_lang},
            headers=STEAM_HEADERS,
            timeout=10,
        )
        if r.status_code == 200:
            data = r.json() or {}
            # specials primero (deals curados), top_sellers despues como fill.
            # Dedupe por appid: si un juego sale en ambas secciones, queda la
            # version de specials (suele tener mejor descuento exhibido).
            for section_key in ("specials", "top_sellers"):
                section = data.get(section_key) or {}
                for item in (section.get("items") or []):
                    appid = item.get("id")
                    if not appid or appid in seen:
                        continue
                    g = _build_game(item, currency)
                    if g:
                        games.append(g)
                        seen.add(appid)
    except Exception as e:
        print(f"[featured] fetch error: {e}")

    _atl_cache[currency] = (now, games)
    return jsonify({"games": games[:limit]})
