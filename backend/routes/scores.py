# routes/scores.py — Reviews de Steam, Metacritic, HLTB y scrape unificado.

import concurrent.futures
import time

from flask import Blueprint, jsonify, request

from ..cache import metacritic_cache, reviews_cache, scrape_cache
from ..config import CURRENCY_CONFIG
from ..hltb_api import search_hltb
from ..steam_api import steam_get, scrape_steam_game_data


bp_scores = Blueprint("scores", __name__)


# ── Helpers internos ─────────────────────────────────────────────────────────

def _fetch_steam_reviews(appid):
    """Devuelve dict de reviews y maneja la caché. total=-1 indica error/rate-limit (no se cachea)."""
    if appid in reviews_cache:
        return reviews_cache[appid]
    try:
        r = steam_get(
            f"https://store.steampowered.com/appreviews/{appid}",
            params={"json": "1", "language": "all", "purchase_type": "all", "num_per_page": "0"},
            timeout=8,
        )
        if r.status_code == 200:
            summary  = r.json().get("query_summary", {})
            total    = summary.get("total_reviews", 0)
            positive = summary.get("total_positive", 0)
            score    = round((positive / total) * 100) if total > 0 else None
            result   = {"appid": appid, "score": score, "total": total, "positive": positive}
            reviews_cache[appid] = result
            return result
    except Exception as e:
        print(f"[reviews] Steam reviews error for {appid}: {e}")
    return {"appid": appid, "score": None, "total": -1, "positive": 0}


def _fetch_metacritic(appid):
    """Devuelve dict de Metacritic. error=True indica que no se cacheó."""
    if appid in metacritic_cache:
        return metacritic_cache[appid]
    try:
        r = steam_get(
            "https://store.steampowered.com/api/appdetails",
            params={"appids": appid, "filters": "metacritic"},
            timeout=8,
        )
        if r.status_code == 200:
            app_data = r.json().get(str(appid), {})
            if app_data.get("success"):
                mc = app_data.get("data", {}).get("metacritic", {}) or {}
                result = {"appid": appid, "score": mc.get("score"), "url": mc.get("url")}
                metacritic_cache[appid] = result
                return result
            # Sin metacritic: cachear como vacío
            result = {"appid": appid, "score": None, "url": None}
            metacritic_cache[appid] = result
            return result
    except Exception as e:
        print(f"[metacritic] Error for {appid}: {e}")
    return {"appid": appid, "score": None, "url": None, "error": True}


# ── Steam Reviews ────────────────────────────────────────────────────────────

@bp_scores.route("/api/steam-reviews")
def api_steam_reviews():
    appid = (request.args.get("appid") or "").strip()
    if not appid:
        return jsonify({"error": "appid required"}), 400
    return jsonify(_fetch_steam_reviews(appid))


@bp_scores.route("/api/steam-reviews/batch", methods=["POST"])
def api_steam_reviews_batch():
    body   = request.get_json(force=True) or {}
    appids = body.get("appids", [])[:200]
    if not appids:
        return jsonify([])
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        results = list(ex.map(_fetch_steam_reviews, appids))
    return jsonify(results)


# ── Metacritic ───────────────────────────────────────────────────────────────

@bp_scores.route("/api/metacritic")
def api_metacritic():
    appid = (request.args.get("appid") or "").strip()
    if not appid:
        return jsonify({"error": "appid required"}), 400
    return jsonify(_fetch_metacritic(appid))


@bp_scores.route("/api/metacritic/batch", methods=["POST"])
def api_metacritic_batch():
    body   = request.get_json(force=True) or {}
    appids = body.get("appids", [])[:200]
    if not appids:
        return jsonify([])
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        results = list(ex.map(_fetch_metacritic, appids))
    return jsonify(results)


# ── HowLongToBeat ────────────────────────────────────────────────────────────

@bp_scores.route("/api/hltb")
def api_hltb():
    name = (request.args.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name required"}), 400
    return jsonify(search_hltb(name))


@bp_scores.route("/api/hltb/batch", methods=["POST"])
def api_hltb_batch():
    body  = request.get_json(force=True) or {}
    games = body.get("games", [])[:200]  # [{appid, name}, ...]
    if not games:
        return jsonify([])

    def fetch_one(game):
        name  = game.get("name", "")
        appid = game.get("appid", "")
        if not name:
            return {"appid": appid, "name": name, "main": None}
        data = search_hltb(name)
        return {"appid": appid, "name": name, "main": data.get("main")}

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        results = list(ex.map(fetch_one, games))
    return jsonify(results)


# ── Steam scrape unificado (precio + reviews + metacritic + bundles) ────────

@bp_scores.route("/api/steam-data/batch", methods=["POST"])
def api_steam_data_batch():
    """Scrape unificado: precio + reviews + metacritic + bundles en 1 call por juego."""
    body     = request.get_json(force=True) or {}
    appids   = body.get("appids", [])[:200]
    currency = body.get("currency", "COP")
    if not appids:
        return jsonify([])

    cc = CURRENCY_CONFIG.get(currency, CURRENCY_CONFIG["COP"])["cc"]

    def fetch_one(appid):
        cache_key = (appid, currency)
        if cache_key in scrape_cache:
            return scrape_cache[cache_key]
        data = scrape_steam_game_data(appid, cc=cc, currency=currency)
        if not data.get("error"):
            scrape_cache[cache_key] = data
            # Cross-poblamos los cachés individuales
            rev   = data["reviews"]
            score = rev["score"]
            total = rev["total"]
            if total >= 0:
                positive = round(total * score / 100) if score and total else 0
                reviews_cache[appid] = {"appid": appid, "score": score, "total": total, "positive": positive}
            mc = data["metacritic"]
            if mc:
                metacritic_cache[appid] = {"appid": appid, "score": mc.get("score"), "url": mc.get("url")}
        return data

    CHUNK   = 25
    WORKERS = 10
    results = []
    for i in range(0, len(appids), CHUNK):
        chunk = appids[i:i + CHUNK]
        with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as ex:
            results.extend(ex.map(fetch_one, chunk))
        if i + CHUNK < len(appids):
            time.sleep(0.2)

    return jsonify(results)
