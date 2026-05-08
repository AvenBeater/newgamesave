# routes/atl.py — Featured deals banner.
# Fuente: Steam Storefront API `featuredcategories` (endpoint JSON publico,
# misma familia que appdetails/storesearch que ya usamos). Combina
# `specials` (deals curados por Steam) + `top_sellers` (mas vendidos del
# momento), dedupe por appid, filtra los que tengan descuento real.
# new_releases queda fuera por baja calidad de catalogo (mayormente indies
# muy chicos).

import time
import concurrent.futures
import requests
from flask import Blueprint, jsonify, request

from ..config import CURRENCY_CONFIG, STEAM_LANG, STEAM_HEADERS
from ..currency import get_exchange_rates
from ..steam_api import has_real_library_hero, get_steam_bundles
from ..itad_api import get_all_itad_prices

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
    # Cover por defecto: las imagenes que Steam devuelve en el response (con
    # hash en el URL) siempre existen para el juego, no son placeholders.
    # `library_hero.jpg` se intenta como upgrade de calidad post-HEAD check
    # (ver `_validate_and_upgrade_covers`).
    safe_cover = (
        item.get("large_capsule_image")
        or item.get("header_image")
        or f"https://cdn.akamai.steamstatic.com/steam/apps/{appid_str}/capsule_616x353.jpg"
    )

    return {
        "title":          name,
        "appid":          appid_str,
        "cover":          safe_cover,
        "coverFallback":  safe_cover,
        "store":          "Steam",
        "storeId":        "steam",
        "priceNative":    round(final_cents / 100, 2),
        "originalNative": round(original_cents / 100, 2),
        "discount":       discount,
        "currency":       currency,
        "url":            f"https://store.steampowered.com/app/{appid_str}/",
    }


def _enrich_with_best_deal(games, currency):
    """
    Por cada juego del banner busca el mejor precio cross-store/cross-country
    via ITAD (mismo flow que /api/prices). Si encuentra un deal mas barato
    que el de Steam featured, reemplaza price/store/discount/url para que el
    banner muestre lo mismo que va a ver el usuario al hacer click.

    Sin esto pasa que el banner anuncia "UNCHARTED Collection - Steam $X" pero
    al click el mejor precio resulta ser Nuuvem $Y (mas barato), generando
    inconsistencia visual.
    """
    if not games:
        return

    rates = get_exchange_rates()
    usd_rate = rates.get(
        currency,
        CURRENCY_CONFIG.get(currency, {}).get("fallback_usd_rate", 1),
    )

    def _best_for(game):
        try:
            deals = get_all_itad_prices(game["appid"], game["title"], currency, usd_rate)
            # Excluimos los deals de Steam que vienen via ITAD. Ya tenemos el
            # precio Steam autoritativo desde featuredcategories (precio
            # regional real); ITAD a veces reporta un valor distinto (caso
            # observado: BG3 en COP, featuredcategories $149k vs ITAD-Steam
            # $128k). Mirroreamos lo que hace `/api/prices`: Steam viene de
            # Steam direct, las demas tiendas via ITAD.
            non_steam = []
            for d in deals:
                sid = str(d.get("store") or "").lower()
                sname = str(d.get("storeName") or "").lower()
                if "steam" in sid or "steam" in sname:
                    continue
                non_steam.append(d)
            if not non_steam:
                return None
            return min(non_steam, key=lambda d: d.get("priceNative", float("inf")))
        except Exception:
            return None

    # Outer pool con todos los juegos en paralelo. Cada `get_all_itad_prices`
    # lanza su propio pool de 8 (los 8 paises) → 7x8 = 56 connections at peak,
    # pero requests/HTTP pool las serializa al pool size del host. Aun asi,
    # paralelismo outer reduce significativamente el wall time vs serial.
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(games)) as ex:
        futures = {ex.submit(_best_for, g): g for g in games}
        for future in concurrent.futures.as_completed(futures):
            g = futures[future]
            try:
                best = future.result()
                if not best:
                    continue
                steam_price = g.get("priceNative", float("inf"))
                best_price = best.get("priceNative", float("inf"))
                # Solo reemplazar si ITAD encuentra mas barato. Si Steam ya
                # tiene el mejor precio, dejamos el deal de Steam intacto.
                if best_price < steam_price:
                    g["priceNative"] = best_price
                    g["originalNative"] = best.get("originalNative", g["originalNative"])
                    g["discount"] = best.get("discount", g["discount"])
                    g["store"] = best.get("storeName", g["store"])
                    g["storeId"] = best.get("store", g["storeId"])
                    g["url"] = best.get("url", g["url"])
            except Exception:
                pass


def _enrich_with_bundles_count(games, currency):
    """
    Cuenta cuantos bundles de Steam contienen cada juego (independiente del
    deal que se muestre). Se renderiza como contador chico debajo del precio.
    """
    if not games:
        return
    cc = CURRENCY_CONFIG.get(currency, CURRENCY_CONFIG["COP"])["cc"]

    def _count(game):
        try:
            return len(get_steam_bundles(game["appid"], cc) or [])
        except Exception:
            return 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(games)) as ex:
        futures = {ex.submit(_count, g): g for g in games}
        for future in concurrent.futures.as_completed(futures):
            g = futures[future]
            try:
                g["bundlesCount"] = future.result()
            except Exception:
                g["bundlesCount"] = 0


def _validate_and_upgrade_covers(games):
    """
    HEAD checks paralelos a `library_hero.jpg`. Si existe como imagen real
    (no placeholder), upgrade del cover a esa version 1920x620, mas nitida
    para el banner full-width. Si no, queda con el cover safe del response
    de Steam (capsule 616x353).
    """
    if not games:
        return
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(has_real_library_hero, g["appid"]): g for g in games}
        for future in concurrent.futures.as_completed(futures):
            g = futures[future]
            try:
                if future.result():
                    g["cover"] = (
                        f"https://cdn.akamai.steamstatic.com/steam/apps/{g['appid']}/library_hero.jpg"
                    )
            except Exception:
                pass


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

    # Upgrade covers a library_hero.jpg cuando exista como imagen real, no
    # como el placeholder rojo de Steam. HEAD requests paralelos (~200-400ms
    # total para 7 juegos), cacheado los siguientes 30 min.
    _validate_and_upgrade_covers(games)

    # Cross-store best deal: el precio de Steam featured no siempre es el mas
    # barato. Comparamos via ITAD igual que en /api/prices y reemplazamos si
    # otra tienda (Nuuvem, GMG, Fanatical, etc.) tiene mejor precio. Asi el
    # banner es consistente con lo que el user ve al hacer click.
    _enrich_with_best_deal(games, currency)

    # Cantidad de bundles en Steam que contienen cada juego (se muestra como
    # contador debajo del precio, independiente del store del deal).
    _enrich_with_bundles_count(games, currency)

    _atl_cache[currency] = (now, games)
    return jsonify({"games": games[:limit]})
