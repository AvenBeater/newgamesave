# routes/prices.py — Búsqueda, precios de un juego, tasa de cambio

from flask import Blueprint, jsonify, request

from ..config import CURRENCY_CONFIG
from ..currency import get_exchange_rates
from ..steam_api import (
    search_steam_games, get_steam_price, get_steam_bundles, get_appdetails_full,
)
from ..itad_api import get_all_itad_prices


bp_prices = Blueprint("prices", __name__)


@bp_prices.route("/api/rate")
def api_rate():
    currency = request.args.get("currency", "COP")
    rates    = get_exchange_rates()
    rate     = rates.get(currency, CURRENCY_CONFIG.get(currency, {}).get("fallback_usd_rate", 1))
    return jsonify({"rate": rate, "currency": currency})


@bp_prices.route("/api/search")
def api_search():
    q        = request.args.get("q", "")
    lang     = request.args.get("lang", "es")
    currency = request.args.get("currency", "COP")
    if not q:
        return jsonify([])
    return jsonify(search_steam_games(q, lang, currency))


@bp_prices.route("/api/prices")
def api_prices():
    appid    = request.args.get("appid", "")
    name     = request.args.get("name", "")
    currency = request.args.get("currency", "COP")
    lang     = request.args.get("lang", "es")

    rates    = get_exchange_rates()
    usd_rate = rates.get(currency, CURRENCY_CONFIG.get(currency, {}).get("fallback_usd_rate", 1))

    all_prices = []
    steam = get_steam_price(appid, currency)
    if steam:
        all_prices.append(steam)

    if name:
        for p in get_all_itad_prices(appid, name, currency, usd_rate):
            store_name_lower = p.get("storeName", "").lower()
            store_id_lower   = p.get("store", "").lower()
            is_steam = ("steam" in store_name_lower or "steam" in store_id_lower)
            if not is_steam:
                all_prices.append(p)

    cover          = f"https://cdn.akamai.steamstatic.com/steam/apps/{appid}/library_hero.jpg" if appid else ""
    cover_fallback = f"https://cdn.akamai.steamstatic.com/steam/apps/{appid}/capsule_616x353.jpg" if appid else ""

    details = get_appdetails_full(appid, lang)
    media          = details["media"]
    game_info      = details["gameInfo"]
    localized_name = details["localizedName"] or name

    cc = CURRENCY_CONFIG.get(currency, CURRENCY_CONFIG["COP"])["cc"]
    steam_bundles = get_steam_bundles(appid, cc) if appid else []
    for b in steam_bundles:
        b["currency"] = currency

    return jsonify({
        "prices":        all_prices,
        "rate":          usd_rate,
        "cover":         cover,
        "coverFallback": cover_fallback,
        "media":         media,
        "gameInfo":      game_info,
        "currency":      currency,
        "localizedName": localized_name,
        "steamBundles":  steam_bundles,
        "mature":        details.get("mature", False),
    })
