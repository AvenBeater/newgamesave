# routes/home.py — Página principal y favicons

from flask import Blueprint, Response, redirect, render_template, request

from ..config import FAVICON_SVG, SENTRY_DSN_FRONTEND


bp_home = Blueprint("home", __name__)


# Mapeo país → idioma. Mismas reglas que `COUNTRY_DEFAULTS` en helpers.js,
# pero solo el idioma (no la moneda) — usado para SSR del texto del loading
# ATL. El JS sigue manejando localStorage + browser fallback como override.
_COUNTRY_LANG = {
    "AR": "es", "BR": "pt", "CL": "es", "CO": "es", "MX": "es",
    "US": "en", "CA": "en", "ES": "es",
    "FR": "fr", "BE": "fr", "LU": "fr", "CH": "fr",
    "PT": "pt",
    "DE": "en", "IT": "en", "NL": "en", "AT": "en", "IE": "en",
    "GR": "en", "FI": "en",
}

# Texto del "INSERT COIN" del loading state, server-rendered segun el pais
# detectado por Cloudflare. Asi el primer paint ya esta en el idioma correcto
# sin esperar JS. Si localStorage tiene otro idioma, JS lo actualiza despues.
_INSERT_COIN_LABELS = {
    "es": "INSERTE MONEDA",
    "en": "INSERT COIN",
    "pt": "INSIRA MOEDA",
    "fr": "INSÉREZ UNE PIÈCE",
}


@bp_home.route("/")
def index():
    # CF-IPCountry lo inyecta Cloudflare cuando el proxy está activo (nube
    # naranja). Lo usamos para defaults inteligentes de idioma/moneda en la
    # primera visita. Si el proxy está off o estamos en localhost, llega
    # vacío y el JS cae al fallback de navigator.language.
    cf_country = request.headers.get("CF-IPCountry", "").strip().upper()
    detected_lang = _COUNTRY_LANG.get(cf_country, "es")
    insert_coin = _INSERT_COIN_LABELS.get(detected_lang, _INSERT_COIN_LABELS["es"])
    return render_template(
        "index.html",
        sentry_dsn=SENTRY_DSN_FRONTEND,
        cf_country=cf_country,
        insert_coin=insert_coin,
    )


@bp_home.route("/favicon.svg")
def favicon_svg():
    return Response(FAVICON_SVG, mimetype="image/svg+xml")


@bp_home.route("/favicon.ico")
def favicon_ico():
    return redirect("/favicon.svg")
