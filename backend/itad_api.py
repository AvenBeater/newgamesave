# itad_api.py — Funciones de la API de IsThereAnyDeal

import requests
import concurrent.futures
from datetime import datetime, timezone

from .config import (
    ITAD_API_KEY, STORE_NAMES, STORE_COLORS,
    LANG_LABELS, LANG_FLAGS,
)
from .affiliate import tag_url


# ── Conversión de moneda + normalización de deals ───────────────────────────

def _convert(amount, src_cur, dst_cur, usd_rate, rates):
    """Convierte amount de src_cur a dst_cur usando USD como pivote."""
    if src_cur == dst_cur:
        return amount
    if src_cur == "USD":
        return amount * usd_rate
    src_rate = rates.get(src_cur, 1) or 1
    return (amount / src_rate) * usd_rate


def normalize_itad_deal(deal, currency, usd_rate, rates, lang_code=None):
    """
    Convierte un deal de ITAD al formato unificado del frontend.
    El caller filtra bundles/sub-IDs si lo necesita (no se hace aquí).
    """
    shop      = deal.get("shop", {})
    shop_id   = str(shop.get("id", "")).lower()
    shop_name = shop.get("name", shop_id)
    url       = deal.get("url", "#")

    price_info = deal.get("price", {})
    price_amt  = price_info.get("amount", 0)
    price_cur  = price_info.get("currency", "USD")
    reg_amt    = deal.get("regular", {}).get("amount", price_amt)
    discount   = deal.get("cut", 0)

    native = _convert(price_amt, price_cur, currency, usd_rate, rates)
    orig   = _convert(reg_amt,   price_cur, currency, usd_rate, rates)

    out = {
        "store":          shop_id,
        "storeName":      STORE_NAMES.get(shop_id, shop_name),
        "priceNative":    round(native, 2),
        "originalNative": round(orig,   2),
        "currency":       currency,
        "discount":       discount,
        "url":            tag_url(shop_id, url),
        "color":          STORE_COLORS.get(shop_id, "#555e6e"),
    }

    if lang_code:
        out["lang"]      = lang_code
        out["langLabel"] = LANG_LABELS[lang_code]
        out["langFlag"]  = LANG_FLAGS[lang_code]

    store_low_info = deal.get("storeLow", {})
    store_low_amt  = store_low_info.get("amount", 0) if store_low_info else 0
    if store_low_amt > 0 and reg_amt > 0:
        out["storeLowRatio"] = round(store_low_amt / reg_amt, 4)

    return out


def _is_bundle_or_sub(url):
    return "/bundle/" in url or "/sub/" in url


# ── Lookup de juegos en ITAD ────────────────────────────────────────────────

def lookup_appid_v1(appid):
    """Lookup individual por Steam appid. Retorna {"id", "title"} o None."""
    try:
        r = requests.get(
            "https://api.isthereanydeal.com/games/lookup/v1",
            params={"key": ITAD_API_KEY, "appid": appid},
            timeout=8,
        )
        if r.status_code == 200:
            data = r.json()
            if data.get("found") and data.get("game"):
                g = data["game"]
                return {"id": g.get("id"), "title": g.get("title", "")}
    except Exception as e:
        print(f"ITAD lookup error: {e}")
    return None


def get_itad_game_id(appid):
    """Devuelve solo el game_id de ITAD (compat con código antiguo)."""
    info = lookup_appid_v1(appid)
    return info["id"] if info else None


def batch_lookup_appids(appids):
    """
    Lookup en bulk por lista de Steam appids.
    Retorna {appid_str: {"id", "title"}} solo para los encontrados.
    """
    itad_map = {}
    digit_appids = [str(a) for a in appids if str(a).isdigit()]
    if not digit_appids:
        return itad_map
    try:
        r = requests.post(
            f"https://api.isthereanydeal.com/games/lookup/v2?key={ITAD_API_KEY}",
            json=[{"appid": int(a)} for a in digit_appids],
            timeout=15,
        )
        if r.status_code == 200:
            for entry in r.json():
                steam_appid = str(entry.get("appid", ""))
                game        = entry.get("game") or {}
                if game.get("id"):
                    itad_map[steam_appid] = {"id": game["id"], "title": game.get("title", "")}
    except Exception as e:
        print(f"[batch] ITAD lookup v2 error: {e}")
    return itad_map


# ── Fetch de precios y bundles ──────────────────────────────────────────────

def fetch_country_prices(itad_id, country, currency, usd_rate, rates,
                         capacity=5, lang_code=None, filter_all_bundles=True):
    """
    Pide precios de un país a ITAD para un solo itad_id y los normaliza.
    filter_all_bundles=True salta /bundle/ y /sub/ en cualquier tienda;
    si es False, solo filtra bundles de Steam.
    """
    deals = []
    try:
        r = requests.post(
            f"https://api.isthereanydeal.com/games/prices/v3"
            f"?key={ITAD_API_KEY}&country={country}&capacity={capacity}",
            json=[itad_id],
            timeout=10,
        )
        if r.status_code != 200:
            return deals
        for entry in r.json():
            for deal in entry.get("deals", []):
                url_deal = deal.get("url", "#")
                shop_id  = str(deal.get("shop", {}).get("id", "")).lower()
                if filter_all_bundles:
                    if _is_bundle_or_sub(url_deal):
                        continue
                else:
                    if shop_id == "steam" and _is_bundle_or_sub(url_deal):
                        continue
                deals.append(normalize_itad_deal(deal, currency, usd_rate, rates, lang_code=lang_code))
    except Exception as e:
        print(f"[prices] ITAD country={country} error: {e}")
    return deals


def fetch_bundles(itad_id, country, currency, rates, usd_rate, limit=3):
    """Bundles activos en ITAD para un juego, ordenados por precio."""
    best_bundles = []
    try:
        rb = requests.get(
            "https://api.isthereanydeal.com/games/bundles/v2",
            params={"key": ITAD_API_KEY, "id": itad_id, "country": country},
            timeout=8,
        )
        if rb.status_code == 200:
            for bundle in rb.json():
                expiry = bundle.get("expiry")
                if expiry:
                    try:
                        exp_dt = datetime.fromisoformat(expiry.replace('Z', '+00:00'))
                        if exp_dt < datetime.now(timezone.utc):
                            continue
                    except Exception:
                        pass
                tier_price = None
                for tier in bundle.get("tiers", []):
                    p   = tier.get("price", {})
                    amt = p.get("amount", 0)
                    cur = p.get("currency", "USD")
                    native_price = _convert(amt, cur, currency, usd_rate, rates)
                    if tier_price is None or native_price < tier_price["priceNative"]:
                        tier_price = {
                            "priceNative": round(native_price, 2),
                            "currency":    currency,
                            "gamesInTier": len(tier.get("games", [])),
                        }
                if not tier_price:
                    continue
                page = bundle.get("page", {})
                best_bundles.append({
                    "title":       bundle.get("title", ""),
                    "store":       page.get("name", ""),
                    "storeName":   page.get("name", ""),
                    "url":         bundle.get("url", "#"),
                    "detailsUrl":  bundle.get("details", ""),
                    "priceNative": tier_price["priceNative"],
                    "currency":    currency,
                    "gamesCount":  bundle.get("counts", {}).get("games", 0),
                    "expiry":      expiry,
                })
            best_bundles = sorted(best_bundles, key=lambda x: x["priceNative"])[:limit]
    except Exception as e:
        print(f"[bundles] error: {e}")
    return best_bundles


# ── Multi-país: 1 juego, varios países en paralelo (usado en /api/prices) ──

def get_all_itad_prices(appid, fallback_name, currency, usd_rate):
    """
    Busca precios en ITAD por steamAppId consultando varios países en paralelo
    y devuelve la mejor oferta única por tienda.
    """
    game_id = get_itad_game_id(appid)
    if not game_id:
        print(f"ITAD: no game_id for appid {appid}")
        return []

    from .currency import get_exchange_rates
    rates = get_exchange_rates()

    country_langs = {
        "CO": "es", "US": "en", "BR": "pt", "FR": "fr",
        "MX": "es", "AR": "es", "DE": "en", "GB": "en",
    }

    all_deals = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        futures = {
            ex.submit(
                fetch_country_prices, game_id, country, currency, usd_rate, rates,
                20, lang, False,  # capacity=20, lang_code=lang, filter_all_bundles=False
            ): country
            for country, lang in country_langs.items()
        }
        for future in concurrent.futures.as_completed(futures):
            try:
                all_deals.extend(future.result())
            except Exception as e:
                print(f"Future error: {e}")

    # Deduplicar por tienda, quedándose con el deal más barato
    seen_stores = {}
    for deal in all_deals:
        sid = deal["store"]
        if sid not in seen_stores or deal["priceNative"] < seen_stores[sid]["priceNative"]:
            seen_stores[sid] = deal

    result = list(seen_stores.values())
    print(f"ITAD total unique deals: {len(result)}")
    return result
