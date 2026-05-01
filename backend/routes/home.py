# routes/home.py — Página principal y favicons

from flask import Blueprint, Response, redirect, render_template, request

from ..config import FAVICON_SVG, SENTRY_DSN_FRONTEND


bp_home = Blueprint("home", __name__)


@bp_home.route("/")
def index():
    # CF-IPCountry lo inyecta Cloudflare cuando el proxy está activo (nube
    # naranja). Lo usamos para defaults inteligentes de idioma/moneda en la
    # primera visita. Si el proxy está off o estamos en localhost, llega
    # vacío y el JS cae al fallback de navigator.language.
    cf_country = request.headers.get("CF-IPCountry", "").strip().upper()
    return render_template(
        "index.html",
        sentry_dsn=SENTRY_DSN_FRONTEND,
        cf_country=cf_country,
    )


@bp_home.route("/favicon.svg")
def favicon_svg():
    return Response(FAVICON_SVG, mimetype="image/svg+xml")


@bp_home.route("/favicon.ico")
def favicon_ico():
    return redirect("/favicon.svg")
