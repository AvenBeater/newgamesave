# routes/atl.py — All-Time Low banner (juegos en precio historico minimo hoy)

import time
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

    # Permitimos price=0 (juegos gratis) pero requerimos un regular > 0 para
    # que el descuento tenga sentido.
    if reg_amt <= 0:
        return None

    price_cur = price_info.get("currency", "USD")

    assets = entry.get("assets") or {}
    cover = (
        assets.get("banner400")
        or assets.get("banner600")
        or assets.get("banner300")
        or assets.get("boxart")
        or ""
    )

    shop = deal.get("shop") or {}

    return {
        "title":          entry.get("title", ""),
        "slug":           entry.get("slug", ""),
        "cover":          cover,
        "store":          shop.get("name", ""),
        "storeId":        str(shop.get("id", "")).lower(),
        "priceNative":    round(_convert(price_amt, price_cur, currency, usd_rate, rates), 2),
        "originalNative": round(_convert(reg_amt,   price_cur, currency, usd_rate, rates), 2),
        "discount":       deal.get("cut", 0),
        "currency":       currency,
        "url":            deal.get("url", "#"),
        "isAtl":          _is_atl(deal),
    }


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
    for entry in items:
        g = _build_game(entry, currency, usd_rate, rates)
        if not g or not g["title"]:
            continue
        games.append(g)
        if len(games) >= 20:
            break

    # Preferir los que están en historical low. Si hay >=5 ATL los promovemos al
    # frente; si no, dejamos el orden por descuento.
    atl_games = [g for g in games if g["isAtl"]]
    if len(atl_games) >= 5:
        games = atl_games + [g for g in games if not g["isAtl"]]

    _atl_cache[currency] = (now, games)
    return jsonify({"games": games[:limit]})
