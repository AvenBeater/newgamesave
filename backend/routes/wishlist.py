# routes/wishlist.py — Wishlist + precios (single + batch)

import concurrent.futures

from flask import Blueprint, jsonify, request

from ..cache import (
    itad_lookup_cache, metacritic_cache, wl_price_cache,
)
from ..config import CURRENCY_CONFIG
from ..currency import get_exchange_rates
from ..itad_api import (
    batch_lookup_appids, lookup_appid_v1,
    fetch_country_prices, fetch_bundles, normalize_itad_deal,
)
from ..steam_api import (
    resolve_steam_id, fetch_wishlist_data,
    get_steam_bundles, get_steam_price_and_mc, snap_steam_ratio,
)


bp_wishlist = Blueprint("wishlist", __name__)


def _cached_itad_lookup(appid):
    """Lookup ITAD por appid con caché (TTL=infinito en sesión)."""
    if appid in itad_lookup_cache:
        return itad_lookup_cache[appid]
    info = lookup_appid_v1(appid)
    itad_lookup_cache[appid] = info
    return info


# ── /api/wishlist ────────────────────────────────────────────────────────────

@bp_wishlist.route("/api/wishlist")
def api_wishlist():
    """Carga la wishlist pública de Steam y prioriza juegos que ITAD conoce."""
    steam_input = request.args.get("steamid", "").strip()
    currency    = request.args.get("currency", "COP")

    if not steam_input:
        return jsonify({"error": "steamid requerido"}), 400

    steam_id64, err = resolve_steam_id(steam_input)
    if err:
        return jsonify({"error": err}), 400

    print(f"[Wishlist] steam_id64={steam_id64}")

    wl_data, err = fetch_wishlist_data(steam_id64)
    if err or not wl_data:
        return jsonify({"error": err or "Wishlist vacía o privada."}), 400

    rates    = get_exchange_rates()
    usd_rate = rates.get(currency, CURRENCY_CONFIG.get(currency, {}).get("fallback_usd_rate", 1))

    all_appids = [a for a in wl_data.keys() if a.isdigit()]

    # Priorizar juegos que ITAD conoce (lookup batch)
    itad_map = batch_lookup_appids(all_appids)
    known_appids = set(itad_map.keys())
    print(f"[Wishlist] ITAD conoce {len(known_appids)}/{len(all_appids)} juegos")

    # Cachear lookups para que el endpoint /prices no los repita
    for appid_str, info in itad_map.items():
        itad_lookup_cache[appid_str] = info

    all_appids.sort(key=lambda a: 0 if a in known_appids else 1)

    games = [{
        "appid":       a,
        "name":        (wl_data.get(a, {}) or {}).get("name") or "",
        "cover":       f"https://cdn.akamai.steamstatic.com/steam/apps/{a}/library_hero.jpg",
        "coverMedium": f"https://cdn.akamai.steamstatic.com/steam/apps/{a}/capsule_616x353.jpg",
        "coverSmall":  f"https://cdn.akamai.steamstatic.com/steam/apps/{a}/header.jpg",
    } for a in all_appids]

    return jsonify({
        "games":    games,
        "total":    len(all_appids),
        "rate":     usd_rate,
        "currency": currency,
    })


# ── /api/wishlist/prices (single) ────────────────────────────────────────────

@bp_wishlist.route("/api/wishlist/prices")
def api_wishlist_prices():
    """Mejor precio + bundles + Metacritic para UN juego de la wishlist."""
    appid    = request.args.get("appid", "")
    name     = request.args.get("name", "")
    currency = request.args.get("currency", "COP")

    cache_key = (appid, currency)
    cached = wl_price_cache.get(cache_key)
    if cached is not None:
        return jsonify(cached)

    rates    = get_exchange_rates()
    usd_rate = rates.get(currency, CURRENCY_CONFIG.get(currency, {}).get("fallback_usd_rate", 1))

    itad_info = _cached_itad_lookup(appid)
    game_name = (itad_info["title"] if itad_info and itad_info.get("title") else name) or name
    itad_id   = itad_info["id"] if itad_info else None

    if not itad_id:
        result = {"appid": appid, "best": None, "name": game_name}
        wl_price_cache[cache_key] = result
        return jsonify(result)

    country_local = CURRENCY_CONFIG.get(currency, CURRENCY_CONFIG["COP"])["itad_country"]
    cc            = CURRENCY_CONFIG.get(currency, CURRENCY_CONFIG["COP"])["cc"]

    # 4 llamadas en paralelo
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        fut_prices        = ex.submit(fetch_country_prices, itad_id, country_local, currency, usd_rate, rates)
        fut_bundles       = ex.submit(fetch_bundles, itad_id, country_local, currency, rates, usd_rate)
        fut_steam_bundles = ex.submit(get_steam_bundles, appid, cc)
        fut_steam_detail  = ex.submit(get_steam_price_and_mc, appid, currency)

        all_deals             = fut_prices.result()
        itad_bundles          = fut_bundles.result()
        steam_bundles         = fut_steam_bundles.result()
        steam_real, mc_data   = fut_steam_detail.result()

    # Deduplicar deals por tienda (precio mínimo)
    seen = {}
    for deal in all_deals:
        sid = deal["store"]
        if sid not in seen or deal["priceNative"] < seen[sid]["priceNative"]:
            seen[sid] = deal
    all_prices = list(seen.values())

    for b in steam_bundles:
        b["currency"] = currency
    itad_bundles.sort(key=lambda x: x.get("priceNative", 999999))
    best_bundles = itad_bundles[:3] + steam_bundles[:3]

    if mc_data and appid not in metacritic_cache:
        metacritic_cache[appid] = {
            "appid": appid, "score": mc_data.get("score"), "url": mc_data.get("url"),
        }

    if not all_prices:
        result = {
            "appid": appid, "best": None, "name": game_name,
            "bundles": best_bundles, "mc": mc_data,
        }
        wl_price_cache[cache_key] = result
        return jsonify(result)

    # Reemplazar el precio de Steam con el real (más exacto que el de ITAD)
    def _is_steam_deal(p):
        return ("steam" in p.get("storeName", "").lower()
                or p.get("store", "").lower() in ("steam", "20"))

    steam_itad = next((p for p in all_prices if _is_steam_deal(p)), None)
    if steam_itad and steam_real and steam_real["priceNative"] > 0:
        if steam_real.get("discount", 0) == 0 and steam_itad.get("discount", 0) > 0:
            steam_real["discount"] = steam_itad["discount"]
        if steam_itad.get("storeLowRatio") and steam_real.get("originalNative"):
            steam_real["storeLowNative"] = round(
                steam_real["originalNative"] * snap_steam_ratio(steam_itad["storeLowRatio"]), 2,
            )
        for i, p in enumerate(all_prices):
            if _is_steam_deal(p):
                all_prices[i] = steam_real
                break

    # Calcular storeLowNative para los demás deals que tengan ratio
    for p in all_prices:
        if "storeLowRatio" in p and "storeLowNative" not in p and p.get("originalNative"):
            p["storeLowNative"] = round(p["originalNative"] * p["storeLowRatio"], 2)
        p.pop("storeLowRatio", None)

    best = min(all_prices, key=lambda x: x["priceNative"])

    result = {
        "appid":    appid,
        "best":     best,
        "allCount": len(all_prices),
        "name":     game_name,
        "bundles":  best_bundles,
        "mc":       mc_data,
    }
    wl_price_cache[cache_key] = result
    return jsonify(result)


# ── /api/wishlist/prices/batch ───────────────────────────────────────────────

@bp_wishlist.route("/api/wishlist/prices/batch", methods=["POST"])
def api_wishlist_prices_batch():
    """Precios para muchos appids en pocas llamadas a ITAD."""
    body     = request.get_json(force=True) or {}
    appids   = body.get("appids", [])[:200]
    currency = body.get("currency", "COP")

    if not appids:
        return jsonify([])

    rates    = get_exchange_rates()
    usd_rate = rates.get(currency, CURRENCY_CONFIG.get(currency, {}).get("fallback_usd_rate", 1))
    country  = CURRENCY_CONFIG.get(currency, CURRENCY_CONFIG["COP"])["itad_country"]

    # Paso 1: lookup batch + fallback individual para los faltantes
    itad_map = batch_lookup_appids(appids)
    missing  = [a for a in appids if a not in itad_map]

    if missing:
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
            results = ex.map(lambda a: (a, lookup_appid_v1(a)), missing)
            for appid_r, info in results:
                if info:
                    itad_map[appid_r] = info

    # Refrescar caché de lookups
    for a, info in itad_map.items():
        itad_lookup_cache[a] = info
    for a in appids:
        if a not in itad_map:
            itad_lookup_cache[a] = None

    if not itad_map:
        return jsonify([{"appid": a, "best": None, "name": ""} for a in appids])

    # Paso 2: precios batch (un solo POST con todos los itad_ids)
    itad_ids = [v["id"] for v in itad_map.values()]

    try:
        import requests
        from ..config import ITAD_API_KEY
        r = requests.post(
            f"https://api.isthereanydeal.com/games/prices/v3"
            f"?key={ITAD_API_KEY}&country={country}&capacity=5",
            json=itad_ids,
            timeout=15,
        )
        prices_payload = r.json() if r.status_code == 200 else []
    except Exception as e:
        print(f"[batch] prices error: {e}")
        prices_payload = []

    # Por itad_id → mejor deal por tienda
    price_results = {}
    for entry in prices_payload:
        itad_id = entry.get("id")
        if not itad_id:
            continue
        for deal in entry.get("deals", []):
            url_deal = deal.get("url", "#")
            if "/bundle/" in url_deal or "/sub/" in url_deal:
                continue
            d = normalize_itad_deal(deal, currency, usd_rate, rates)
            shop_id = d["store"]
            slot = price_results.setdefault(itad_id, {})
            prev = slot.get(shop_id)
            if not prev or d["priceNative"] < prev["priceNative"]:
                slot[shop_id] = d

    # Armar respuesta
    results = []
    for appid in appids:
        info    = itad_map.get(appid)
        name    = info["title"] if info else ""
        itad_id = info["id"]    if info else None

        if not itad_id or itad_id not in price_results:
            results.append({"appid": appid, "best": None, "name": name})
            continue

        deals = list(price_results[itad_id].values())
        # storeLowRatio no se usa en batch — se descarta para no inflar JSON
        for d in deals:
            d.pop("storeLowRatio", None)
        best  = min(deals, key=lambda x: x["priceNative"])
        results.append({
            "appid":    appid,
            "best":     best,
            "allCount": len(deals),
            "name":     name,
        })

    return jsonify(results)
