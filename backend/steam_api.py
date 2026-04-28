# steam_api.py — Funciones de la API de Steam (búsqueda, precios, wishlist)

import re
import requests
import concurrent.futures
from .config import CURRENCY_CONFIG, STEAM_LANG, STEAM_HEADERS
from .currency import get_exchange_rates


def steam_get(url, params=None, timeout=10):
    """Wrapper de requests.get con headers de navegador para APIs de Steam."""
    return requests.get(url, params=params, headers=STEAM_HEADERS, timeout=timeout)


# ── Búsqueda ─────────────────────────────────────────────────────────────────

def search_steam_games(query, lang="es", currency="COP"):
    cc = CURRENCY_CONFIG.get(currency, CURRENCY_CONFIG["COP"])["cc"]
    steam_lang = STEAM_LANG.get(lang, "spanish")

    endpoints = [
        f"https://store.steampowered.com/api/storesearch/?term={requests.utils.quote(query)}&l={steam_lang}&cc={cc}",
        f"https://store.steampowered.com/search/suggest?term={requests.utils.quote(query)}&l={steam_lang}&cc={cc}&category1=998&json=1",
    ]
    for url in endpoints:
        try:
            r = steam_get(url, timeout=8)
            if r.status_code != 200:
                continue
            data = r.json()
            items = data.get("items", data) if isinstance(data, dict) else data
            if not isinstance(items, list):
                continue
            items = items[:8]
            results = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                appid = str(item.get("id") or item.get("app_id") or "")
                name  = item.get("name") or item.get("title") or ""
                image = item.get("tiny_image") or item.get("logo") or ""
                price_data = item.get("price", {})
                price = None
                if isinstance(price_data, dict):
                    price = price_data.get("final", 0) / 100
                if appid and name:
                    results.append({"id": appid, "name": name, "image": image, "price": price})
            if results:
                return results
        except Exception as e:
            print(f"Steam search error ({url[:60]}): {e}")
    return []


# ── Precio de Steam ──────────────────────────────────────────────────────────

def get_steam_price_and_mc(appid, currency="COP"):
    """
    Obtiene precio + metacritic de Steam en UNA sola llamada a appdetails.
    Retorna (price_dict_or_None, metacritic_dict_or_None).
    """
    cc_list = [
        CURRENCY_CONFIG.get(currency, CURRENCY_CONFIG["COP"])["cc"],
        "US",
        "CO",
    ]
    mc_result = None
    seen = set()
    for cc in cc_list:
        if cc in seen:
            continue
        seen.add(cc)
        try:
            r = steam_get(
                "https://store.steampowered.com/api/appdetails",
                params={"appids": appid, "cc": cc, "filters": "price_overview,metacritic"},
                timeout=8,
            )
            if r.status_code != 200:
                continue
            app_data = r.json().get(str(appid), {})
            if not isinstance(app_data, dict) or not app_data.get("success"):
                continue
            data = app_data.get("data", {})
            if not isinstance(data, dict):
                continue
            # Metacritic (solo del primer intento exitoso)
            if mc_result is None:
                mc = data.get("metacritic", {})
                if mc and isinstance(mc, dict) and mc.get("score"):
                    mc_result = {"score": mc.get("score"), "url": mc.get("url")}
                else:
                    mc_result = {"score": None, "url": None}
            # Precio
            pd = data.get("price_overview", {})
            if pd and isinstance(pd, dict) and pd.get("final", 0) > 0:
                price_currency = pd.get("currency", "USD")
                price_final    = pd.get("final", 0) / 100
                price_initial  = pd.get("initial", 0) / 100
                if price_currency != currency:
                    rates = get_exchange_rates()
                    src_rate = rates.get(price_currency, 1)
                    dst_rate = rates.get(currency, CURRENCY_CONFIG.get(currency, {}).get("fallback_usd_rate", 1))
                    price_final   = (price_final / src_rate) * dst_rate
                    price_initial = (price_initial / src_rate) * dst_rate
                price = {
                    "store":          "steam",
                    "storeName":      "Steam",
                    "priceNative":    round(price_final, 2),
                    "originalNative": round(price_initial, 2),
                    "currency":       currency,
                    "discount":       pd.get("discount_percent", 0),
                    "url":            f"https://store.steampowered.com/app/{appid}",
                    "color":          "#1b2838",
                }
                return price, mc_result
        except Exception as e:
            print(f"Steam price+mc error (cc={cc}): {e}")
    return None, mc_result


def get_steam_price(appid, currency="COP"):
    """
    Obtiene el precio de Steam para un appid.
    Prueba primero en la moneda local, luego en USD como fallback.
    """
    cc_list = [
        CURRENCY_CONFIG.get(currency, CURRENCY_CONFIG["COP"])["cc"],
        "US",
        "CO",
    ]
    seen = set()
    for cc in cc_list:
        if cc in seen:
            continue
        seen.add(cc)
        try:
            r = steam_get(
                "https://store.steampowered.com/api/appdetails",
                params={"appids": appid, "cc": cc, "filters": "price_overview"},
                timeout=8,
            )
            if r.status_code != 200:
                continue
            app_data = r.json().get(str(appid), {})
            if not isinstance(app_data, dict) or not app_data.get("success"):
                continue
            data = app_data.get("data", {})
            if not isinstance(data, dict):
                continue
            pd = data.get("price_overview", {})
            if pd and isinstance(pd, dict) and pd.get("final", 0) > 0:
                price_currency = pd.get("currency", "USD")
                price_final    = pd.get("final", 0) / 100
                price_initial  = pd.get("initial", 0) / 100
                if price_currency != currency:
                    rates = get_exchange_rates()
                    src_rate = rates.get(price_currency, 1)
                    dst_rate = rates.get(currency, CURRENCY_CONFIG.get(currency, {}).get("fallback_usd_rate", 1))
                    price_final   = (price_final / src_rate) * dst_rate
                    price_initial = (price_initial / src_rate) * dst_rate
                return {
                    "store":          "steam",
                    "storeName":      "Steam",
                    "priceNative":    round(price_final, 2),
                    "originalNative": round(price_initial, 2),
                    "currency":       currency,
                    "discount":       pd.get("discount_percent", 0),
                    "url":            f"https://store.steampowered.com/app/{appid}",
                    "color":          "#1b2838",
                }
        except Exception as e:
            print(f"Steam price error (cc={cc}): {e}")
    return None


# ── Resolución de Steam ID ───────────────────────────────────────────────────

def resolve_steam_id(steam_input):
    """
    Acepta SteamID64 numérico, vanity URL (nombre) o URL completa del perfil.
    Devuelve (steam_id64_str, error_msg).
    """
    s = steam_input.strip().rstrip("/")

    for prefix in [
        "https://steamcommunity.com/profiles/",
        "http://steamcommunity.com/profiles/",
        "steamcommunity.com/profiles/",
        "https://steamcommunity.com/id/",
        "http://steamcommunity.com/id/",
        "steamcommunity.com/id/",
    ]:
        if s.lower().startswith(prefix.lower()):
            s = s[len(prefix):].strip("/").strip()
            break

    if s.isdigit() and len(s) >= 15:
        return s, None

    try:
        r = requests.get(
            "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/",
            params={"vanityurl": s},
            timeout=8,
        )
        if r.status_code == 200:
            resp = r.json().get("response", {})
            if resp.get("success") == 1:
                return resp["steamid"], None
            else:
                return None, f"No se encontró ningún perfil con el nombre '{s}'. Prueba con tu SteamID64 numérico."
    except Exception as e:
        return None, f"Error al resolver vanity URL: {e}"

    return None, f"No se pudo interpretar '{s}' como Steam ID o nombre de perfil."


# ── Wishlist ─────────────────────────────────────────────────────────────────

def fetch_wishlist_data(steam_id64):
    """
    Intenta cargar la wishlist por múltiples métodos.
    Devuelve (wl_dict, error_str).
    """
    # Método 1: IWishlistService (Steam Web API oficial)
    try:
        r = requests.get(
            "https://api.steampowered.com/IWishlistService/GetWishlist/v1/",
            params={"steamid": steam_id64},
            timeout=12,
        )
        print(f"[Wishlist] IWishlistService → {r.status_code}")
        if r.status_code == 200:
            items = r.json().get("response", {}).get("items", [])
            if items:
                return {str(item["appid"]): {"name": "", "priority": item.get("priority", 0)}
                        for item in items}, None
            return None, "Wishlist vacía o privada. En Steam: Configuración → Privacidad → Detalles del juego → Público."
        elif r.status_code == 401:
            return None, "Wishlist privada (401). En Steam: Configuración → Privacidad → Detalles del juego → Público."
    except Exception as e:
        print(f"[Wishlist] IWishlistService error: {e}")

    # Método 2: wishlistdata endpoint (fallback con headers de navegador)
    headers = {
        "User-Agent": STEAM_HEADERS["User-Agent"],
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": f"https://store.steampowered.com/wishlist/profiles/{steam_id64}/",
    }
    for url in [
        f"https://store.steampowered.com/wishlist/profiles/{steam_id64}/wishlistdata/?p=0",
        f"https://steamcommunity.com/profiles/{steam_id64}/wishlistdata/?p=0",
    ]:
        try:
            r = requests.get(url, timeout=12, headers=headers)
            print(f"[Wishlist fallback] {url} → {r.status_code}")
            if r.status_code == 200 and r.text.strip().startswith("{"):
                data = r.json()
                if isinstance(data, dict) and data:
                    return data, None
            elif r.status_code == 401:
                return None, "Wishlist privada. En Steam: Configuración → Privacidad → Detalles del juego → Público."
            elif r.status_code == 404:
                return None, "Perfil no encontrado (404). Verifica tu Steam ID."
        except Exception as e:
            print(f"[Wishlist fallback] {url} error: {e}")

    return None, (
        "No se pudo cargar la wishlist. Asegúrate de que sea pública: "
        "Steam → Configuración → Privacidad → Detalles del juego → Público."
    )


def enrich_wishlist_names(wl_dict, lang="en"):
    """Rellena nombres de juegos que vinieron sin nombre (IWishlistService)."""
    steam_lang = STEAM_LANG.get(lang, "english")
    appids = [aid for aid, info in wl_dict.items() if not info.get("name")]
    if not appids:
        return wl_dict

    def fetch_name(appid):
        try:
            r = steam_get(
                "https://store.steampowered.com/api/appdetails",
                params={"appids": appid, "filters": "basic", "l": steam_lang},
                timeout=8,
            )
            if r.status_code == 200:
                entry = r.json().get(str(appid), {})
                if isinstance(entry, dict) and entry.get("success"):
                    data = entry.get("data", {})
                    if isinstance(data, dict):
                        name = data.get("name", "")
                        if name:
                            return appid, name
        except Exception:
            pass
        return appid, f"App {appid}"

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        for appid, name in ex.map(fetch_name, appids):
            if appid in wl_dict:
                wl_dict[appid]["name"] = name

    return wl_dict


# ── Steam Bundles (scraping de la página de la tienda) ───────────────────────

def get_steam_bundles(appid, cc="CO"):
    """
    Obtiene los bundles de Steam que contienen un juego,
    parseando el HTML de la página de la tienda.
    """
    try:
        url = f"https://store.steampowered.com/app/{appid}/"
        r = requests.get(url, headers=STEAM_HEADERS, params={"cc": cc}, timeout=10)
        if r.status_code != 200:
            return []

        html = r.text
        bundles = []
        seen_ids = set()

        # Extraer bundle URLs que contienen el ID y nombre en el path:
        # /bundle/62794/Heart_Machine_Collection/?snr=...
        for m in re.finditer(r'store\.steampowered\.com/bundle/(\d+)/([^/?"\s]+)', html):
            bid = m.group(1)
            if bid in seen_ids:
                continue
            seen_ids.add(bid)

            # Nombre del bundle desde el path URL (underscores → espacios)
            title = m.group(2).replace("_", " ").strip()

            # Cantidad de items: buscar "Includes N items" cerca del addBundleToCart(bid)
            items_block = re.search(
                rf'Includes\s+(\d+)\s+items?.*?addBundleToCart\(\s*{bid}\s*\)',
                html, re.DOTALL | re.IGNORECASE
            )
            games_count = int(items_block.group(1)) if items_block else 0

            bundles.append({
                "bundleId":   bid,
                "title":      title,
                "gamesCount": games_count,
                "store":      "Steam",
                "storeName":  "Steam",
                "url":        f"https://store.steampowered.com/bundle/{bid}/",
                "color":      "#1b2838",
            })

        print(f"[Steam bundles] appid={appid}: {len(bundles)} bundles found")
        return bundles

    except Exception as e:
        print(f"[Steam bundles] error: {e}")
        return []


def scrape_steam_game_data(appid, cc="CO", currency="COP"):
    """
    Scrape UNA sola página de Steam y extraer:
    precio, descuento, reviews, metacritic y bundles.
    Reemplaza 3+ llamadas a la API con 1 solo request.
    """
    result = {
        "appid": appid,
        "price": None,
        "reviews": {"score": None, "total": -1},
        "metacritic": {"score": None, "url": None},
        "bundles": [],
        "error": False,
    }
    try:
        # birthtime=0 + mature_content=1 salta la verificación de edad
        cookies = {"birthtime": "0", "mature_content": "1", "Steam_Language": "english"}
        scrape_headers = dict(STEAM_HEADERS)
        scrape_headers["Cookie"] = "Steam_Language=english; birthtime=0; mature_content=1"
        r = requests.get(
            f"https://store.steampowered.com/app/{appid}/",
            headers=scrape_headers,
            params={"cc": cc, "l": "english"},
            cookies=cookies,
            timeout=12,
        )
        if r.status_code != 200:
            result["error"] = True
            return result

        html = r.text

        # ── Precio (del juego base, no bundles) ──
        # 1. Con descuento: buscar bundlediscount="0" (juego base, no bundle)
        base_price_m = re.search(
            r'data-price-final="(\d+)"\s+data-bundlediscount="0"\s+data-discount="(\d+)"',
            html
        )
        if not base_price_m:
            base_price_m = re.search(
                r'data-bundlediscount="0"[^>]*data-price-final="(\d+)"[^>]*data-discount="(\d+)"',
                html
            )
        if base_price_m:
            price_final = int(base_price_m.group(1)) / 100
            discount = int(base_price_m.group(2))
            if discount > 0:
                price_orig = round(price_final / (1 - discount / 100), 2)
            else:
                price_orig = price_final
        else:
            # 2. Sin descuento: game_purchase_price con data-price-final
            nodiscount_m = re.search(
                r'game_purchase_price\s+price["\s][^>]*data-price-final="(\d+)"',
                html
            )
            if nodiscount_m:
                price_final = int(nodiscount_m.group(1)) / 100
                discount = 0
                price_orig = price_final
            else:
                price_final = None
                discount = 0
                price_orig = None

        if price_final and price_final > 0:
            result["price"] = {
                "store": "steam",
                "storeName": "Steam",
                "priceNative": round(price_final, 2),
                "originalNative": round(price_orig, 2),
                "currency": currency,
                "discount": discount,
                "url": f"https://store.steampowered.com/app/{appid}",
                "color": "#1b2838",
            }
        # ── Reviews (overall, no recientes) ──
        # Buscar TODAS las coincidencias y tomar la que dice "for this game" o la de mayor total
        rev_all = re.findall(
            r'data-tooltip-html="(\d+)%\s+of\s+the\s+([\d,\.]+)\s+user\s+reviews\s+(for this game|in[^"]*)',
            html
        )
        if rev_all:
            # Preferir "for this game", si no, tomar la de mayor total
            best_rev = None
            for pct, count, context in rev_all:
                total = int(count.replace(",", "").replace(".", ""))
                if "for this game" in context:
                    best_rev = (int(pct), total)
                    break
                if best_rev is None or total > best_rev[1]:
                    best_rev = (int(pct), total)
            if best_rev:
                result["reviews"] = {"score": best_rev[0], "total": best_rev[1]}
            else:
                result["reviews"] = {"score": None, "total": 0}
        else:
            result["reviews"] = {"score": None, "total": 0}

        # ── Metacritic ──
        mc_m = re.search(
            r'game_area_metascore.*?<div[^>]*>\s*(\d+)\s*</div>',
            html, re.DOTALL
        )
        if mc_m:
            score = int(mc_m.group(1))
            mc_url_m = re.search(r'game_area_metascore.*?href="([^"]+)"', html, re.DOTALL)
            result["metacritic"] = {
                "score": score,
                "url": mc_url_m.group(1) if mc_url_m else None,
            }

        # ── Bundles ──
        seen_ids = set()
        for m in re.finditer(r'store\.steampowered\.com/bundle/(\d+)/([^/?"\s]+)', html):
            bid = m.group(1)
            if bid in seen_ids:
                continue
            seen_ids.add(bid)
            title = m.group(2).replace("_", " ").strip()
            items_block = re.search(
                rf'Includes\s+(\d+)\s+items?.*?addBundleToCart\(\s*{bid}\s*\)',
                html, re.DOTALL | re.IGNORECASE
            )
            games_count = int(items_block.group(1)) if items_block else 0
            result["bundles"].append({
                "bundleId": bid,
                "title": title,
                "gamesCount": games_count,
                "store": "Steam",
                "storeName": "Steam",
                "url": f"https://store.steampowered.com/bundle/{bid}/",
                "color": "#1b2838",
            })

    except Exception as e:
        print(f"[scrape] Error for appid {appid}: {e}")
        result["error"] = True

    return result


# ── Snap a descuentos reales de Steam ───────────────────────────────────────

# Ratios precio/base de los descuentos que de verdad usa Steam.
STEAM_DISCOUNT_RATIOS = sorted([1 - d / 100 for d in [
    5, 10, 15, 20, 25, 30, 33, 34, 35, 40, 45, 50, 55, 60, 65, 66, 67, 70, 75, 80, 85, 90, 95
]])


def snap_steam_ratio(ratio):
    """Redondea un ratio precio/base al descuento de Steam más cercano."""
    best = ratio
    best_diff = 1.0
    for r in STEAM_DISCOUNT_RATIOS:
        diff = abs(ratio - r)
        if diff < best_diff:
            best_diff = diff
            best = r
    return best


# ── appdetails completo (media + game info) ─────────────────────────────────

def get_appdetails_full(appid, lang="es"):
    """
    Pide /api/appdetails (sin filtros) y extrae media + game_info + nombre localizado.
    Devuelve siempre un dict; si falla, los campos quedan vacíos.
    """
    media          = []
    game_info      = {}
    localized_name = ""

    if not appid:
        return {"media": media, "gameInfo": game_info, "localizedName": localized_name}

    steam_lang = STEAM_LANG.get(lang, "english")
    try:
        md = steam_get(
            f"https://store.steampowered.com/api/appdetails?appids={appid}&l={steam_lang}",
            timeout=8,
        )
        if md.status_code != 200:
            return {"media": media, "gameInfo": game_info, "localizedName": localized_name}

        md_data = md.json().get(str(appid), {})
        if not (isinstance(md_data, dict) and md_data.get("success")):
            return {"media": media, "gameInfo": game_info, "localizedName": localized_name}

        d = md_data.get("data", {})
        localized_name = d.get("name", "")

        # Trailers
        for mov in (d.get("movies") or [])[:3]:
            if not isinstance(mov, dict):
                continue
            hls  = mov.get("hls_h264") or ""
            mp4  = mov.get("mp4")  if isinstance(mov.get("mp4"),  dict) else {}
            webm = mov.get("webm") if isinstance(mov.get("webm"), dict) else {}
            src = (
                hls if isinstance(hls, str) and hls.startswith("http") else ""
            ) or mp4.get("480") or mp4.get("max") or webm.get("480") or webm.get("max") or ""
            thumb = mov.get("thumbnail", "") if isinstance(mov.get("thumbnail"), str) else ""
            if src:
                vtype = "hls" if src.endswith(".m3u8") else "video"
                media.append({"type": vtype, "src": src, "thumb": thumb, "title": mov.get("name", "")})

        # Screenshots
        for ss in (d.get("screenshots") or [])[:8]:
            url_full  = ss.get("path_full", "")
            url_thumb = ss.get("path_thumbnail", url_full)
            if url_full:
                media.append({"type": "image", "src": url_full, "thumb": url_thumb})

        # Game info
        platforms = d.get("platforms") or {}
        rdate     = d.get("release_date", {})
        reviews   = d.get("metacritic") or {}
        game_info = {
            "developers":  d.get("developers", []),
            "publishers":  d.get("publishers", []),
            "genres":      [g.get("description", "") for g in (d.get("genres") or [])[:4]],
            "categories":  [c.get("description", "") for c in (d.get("categories") or [])[:5]],
            "releaseDate": rdate.get("date", "") if isinstance(rdate, dict) else "",
            "description": d.get("short_description", ""),
            "platforms":   [k.title() for k, v in platforms.items() if v],
            "metacritic":  reviews.get("score", "") if isinstance(reviews, dict) else "",
            "website":     d.get("website", "") or "",
        }
    except Exception as e:
        print(f"Steam appdetails error: {e}")

    return {"media": media, "gameInfo": game_info, "localizedName": localized_name}


def _parse_price(text):
    """Parsea un texto de precio de Steam como '$7.130', 'COP$ 7.130', '$7.13', '7,13€'."""
    if not text:
        return None
    # Quitar símbolos de moneda y letras
    cleaned = re.sub(r'[^\d.,]', '', text)
    if not cleaned:
        return None
    # Si tiene punto Y coma, el último separador es el decimal
    if '.' in cleaned and ',' in cleaned:
        if cleaned.rfind('.') > cleaned.rfind(','):
            # 1,234.56 format
            cleaned = cleaned.replace(',', '')
        else:
            # 1.234,56 format
            cleaned = cleaned.replace('.', '').replace(',', '.')
    elif ',' in cleaned:
        # Si solo tiene coma: podría ser 7,130 (miles) o 7,13 (decimal)
        parts = cleaned.split(',')
        if len(parts[-1]) == 3:
            # Miles: 7,130 → 7130
            cleaned = cleaned.replace(',', '')
        else:
            # Decimal: 7,13 → 7.13
            cleaned = cleaned.replace(',', '.')
    elif '.' in cleaned:
        # Si solo tiene punto: podría ser 7.130 (miles) o 7.13 (decimal)
        parts = cleaned.split('.')
        if len(parts[-1]) == 3 and len(parts) > 1:
            # Miles: 7.130 → 7130
            cleaned = cleaned.replace('.', '')
        # else: decimal, dejar como está
    try:
        return float(cleaned)
    except ValueError:
        return None
