# routes/new_release.py — Hero background experimental: keyart de un juego
# recien salido y relevante, full-bleed detras del header + ATL slider, con
# fade-out por mask-image hacia el `--bg`. Estilo Humble Bundle homepage.
#
# **Marcado para revisar/revertir**: Si la prueba no convence, este archivo
# entero + el static/release-hero.js + el bloque CSS marcados se pueden
# borrar y reverir el blueprint en routes/__init__.py.

import time
import requests
from flask import Blueprint, jsonify, request

from ..config import CURRENCY_CONFIG, STEAM_HEADERS
from ..steam_api import has_real_library_hero


bp_new_release = Blueprint("new_release", __name__)

_cache = {}             # {currency: (timestamp, payload)}
_CACHE_TTL = 60 * 60    # 1 hora — cambia poco, no hace falta hammerear Steam


@bp_new_release.route("/api/new-release-hero")
def api_new_release_hero():
    """Devuelve UN juego destacado para usar como hero background.

    Source: Steam featuredcategories. Prio:
      1. `new_releases` — recien lanzados (relevancia ya filtrada por Steam)
      2. `top_sellers` — fallback si new_releases no tiene hero valido
    Selecciona el primer item con library_hero.jpg real (no placeholder
    rojo). Cachea 1h por currency (cc varia el pricing context).
    """
    currency = request.args.get("currency", "COP")
    now = time.time()
    cached = _cache.get(currency)
    if cached and now - cached[0] < _CACHE_TTL:
        return jsonify(cached[1])

    cc = CURRENCY_CONFIG.get(currency, CURRENCY_CONFIG["COP"])["cc"]

    payload = {"game": None}
    try:
        r = requests.get(
            "https://store.steampowered.com/api/featuredcategories",
            params={"cc": cc, "l": "english"},
            headers=STEAM_HEADERS,
            timeout=10,
        )
        if r.status_code == 200:
            data = r.json() or {}
            for section_key in ("new_releases", "top_sellers"):
                section = data.get(section_key) or {}
                for item in (section.get("items") or []):
                    appid = item.get("id")
                    name = (item.get("name") or "").strip()
                    if not appid or not name:
                        continue
                    if has_real_library_hero(appid):
                        appid_s = str(appid)
                        payload = {"game": {
                            "appid": appid_s,
                            "title": name,
                            "hero": f"https://cdn.akamai.steamstatic.com/steam/apps/{appid_s}/library_hero.jpg",
                            "url":  f"https://store.steampowered.com/app/{appid_s}/",
                        }}
                        break
                if payload["game"]:
                    break
    except Exception as e:
        print(f"[new-release-hero] error: {e}")

    if payload["game"]:
        _cache[currency] = (now, payload)
    return jsonify(payload)
