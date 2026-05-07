# routes/atl.py — All-Time Low banner (juegos en precio historico minimo hoy)

import time
import concurrent.futures
import requests
from flask import Blueprint, jsonify, request

from ..config import ITAD_API_KEY, CURRENCY_CONFIG
from ..currency import get_exchange_rates
from ..itad_api import _convert


bp_atl = Blueprint("atl", __name__)

_atl_cache = {}              # {currency: (timestamp, [games])}
_CACHE_TTL = 30 * 60         # 30 min


def _fetch_deals(country, with_filter=True):
    params = {
        "key": ITAD_API_KEY,
        "country": country,
        "limit": 50,
        "sort": "-cut",
    }
    if with_filter:
        params["filter"] = "N4"     # ITAD: nuevo historical low
    try:
        r = requests.get(
            "https://api.isthereanydeal.com/deals/v2",
            params=params,
            timeout=10,
        )
        if r.status_code == 200:
            return r.json().get("list", [])
    except Exception as e:
        print(f"[atl] fetch error: {e}")
    return []


def _is_atl(deal):
    """Verifica si el deal está al historical low (precio actual ≈ history low)."""
    price = deal.get("price", {}).get("amount", 0)
    hl = deal.get("historyLow") or {}
    hl_amt = hl.get("amount", 0)
    return hl_amt > 0 and abs(hl_amt - price) <= max(0.01, hl_amt * 0.01)


def _build_game(entry, currency, usd_rate, rates):
    # Solo juegos. ITAD también lista bundles, DLCs, software.
    if entry.get("type") != "game":
        return None

    deal = entry.get("deal") or {}
    price_info = deal.get("price") or {}
    regular_info = deal.get("regular") or {}
    price_amt = price_info.get("amount", 0)
    reg_amt = regular_info.get("amount", price_amt)

    if reg_amt <= 0:
        return None

    price_cur = price_info.get("currency", "USD")

    assets = entry.get("assets") or {}
    cover_fallback = (
        assets.get("banner600")
        or assets.get("banner400")
        or assets.get("banner300")
        or assets.get("boxart")
        or ""
    )

    shop = deal.get("shop") or {}

    return {
        "title":          entry.get("title", ""),
        "slug":           entry.get("slug", ""),
        "appid":          "",                # se rellena en _enrich_with_appids
        "cover":          cover_fallback,    # default a banner ITAD; reemplazado si hay appid
        "coverFallback":  cover_fallback,
        "store":          shop.get("name", ""),
        "storeId":        str(shop.get("id", "")).lower(),
        "priceNative":    round(_convert(price_amt, price_cur, currency, usd_rate, rates), 2),
        "originalNative": round(_convert(reg_amt,   price_cur, currency, usd_rate, rates), 2),
        "discount":       deal.get("cut", 0),
        "currency":       currency,
        "url":            deal.get("url", "#"),
        "isAtl":          _is_atl(deal),
    }


def _fetch_game_info(itad_id):
    """
    Lookup en ITAD para sacar Steam appid + Steam review count/score (señal de
    relevancia / popularidad). Retorna {} si falla.
    """
    try:
        r = requests.get(
            "https://api.isthereanydeal.com/games/info/v2",
            params={"key": ITAD_API_KEY, "id": itad_id},
            timeout=8,
        )
        if r.status_code != 200:
            return {}
        data = r.json() or {}
        out = {}
        appid = data.get("appid")
        if appid:
            out["appid"] = str(appid)
        # Buscar review de Steam para usar como relevancia
        for review in data.get("reviews", []) or []:
            if review.get("source") == "Steam":
                out["reviewCount"] = review.get("count", 0) or 0
                out["reviewScore"] = review.get("score", 0) or 0
                break
        return out
    except Exception:
        return {}


def _enrich_with_info(pairs):
    """
    Lookup paralelo de info de cada juego en ITAD:
    - Steam appid → cover upgrade a library_hero.jpg (1920x620, mas nitido que
      el banner600 de ITAD a ancho full-container).
    - Steam reviewCount / reviewScore → señal de relevancia (mas reviews = mas
      popular). Usado para ordenar el slider de mas a menos relevante.
    pairs = [(game_dict, itad_id), ...]
    Muta los game_dict in-place.
    """
    if not pairs:
        return
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(_fetch_game_info, gid): g for g, gid in pairs}
        for future in concurrent.futures.as_completed(futures):
            g = futures[future]
            try:
                info = future.result()
                appid = info.get("appid")
                if appid:
                    g["appid"] = appid
                    g["cover"] = (
                        f"https://cdn.akamai.steamstatic.com/steam/apps/{appid}/library_hero.jpg"
                    )
                    # coverFallback ya viene del banner ITAD; si library_hero 404ea
                    # el frontend revierte al banner ITAD via onerror.
                g["reviewCount"] = info.get("reviewCount", 0)
                g["reviewScore"] = info.get("reviewScore", 0)
            except Exception:
                pass


@bp_atl.route("/api/atl-today")
def api_atl_today():
    currency = request.args.get("currency", "COP")
    try:
        limit = min(max(int(request.args.get("limit", 10)), 1), 20)
    except ValueError:
        limit = 10

    now = time.time()
    cached = _atl_cache.get(currency)
    if cached and now - cached[0] < _CACHE_TTL:
        return jsonify({"games": cached[1][:limit]})

    cc = CURRENCY_CONFIG.get(currency, CURRENCY_CONFIG["COP"])["itad_country"]
    rates = get_exchange_rates()
    usd_rate = rates.get(
        currency,
        CURRENCY_CONFIG.get(currency, {}).get("fallback_usd_rate", 1),
    )

    items = _fetch_deals(cc, with_filter=True)
    if not items:
        items = _fetch_deals(cc, with_filter=False)

    games = []
    pairs = []
    for entry in items:
        g = _build_game(entry, currency, usd_rate, rates)
        if not g or not g["title"]:
            continue
        games.append(g)
        pairs.append((g, entry["id"]))
        if len(games) >= 20:
            break

    # Lookup paralelo: Steam appid (cover upgrade) + reviewCount (relevancia)
    _enrich_with_info(pairs)

    # Orden por relevancia: review count de Steam descendente. Juegos sin
    # reviewCount (no estan en Steam o no tienen reviews aun) caen al final.
    # Tiebreak secundario: review score, asi entre dos juegos con el mismo
    # count, gana el de mejor calificación.
    games.sort(
        key=lambda g: (g.get("reviewCount", 0), g.get("reviewScore", 0)),
        reverse=True,
    )

    # Dentro del top relevante, los que SI estan al historical low van primero.
    # Asi el slider muestra juegos populares + en ATL real, con los que solo
    # son top-discount (no-ATL) como reserva.
    atl_games = [g for g in games if g["isAtl"]]
    other_games = [g for g in games if not g["isAtl"]]
    games = atl_games + other_games

    _atl_cache[currency] = (now, games)
    return jsonify({"games": games[:limit]})
