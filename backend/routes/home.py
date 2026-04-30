# routes/home.py — Página principal y favicons

from flask import Blueprint, Response, redirect, render_template

from ..config import FAVICON_SVG, SENTRY_DSN_FRONTEND


bp_home = Blueprint("home", __name__)


@bp_home.route("/")
def index():
    return render_template("index.html", sentry_dsn=SENTRY_DSN_FRONTEND)


@bp_home.route("/favicon.svg")
def favicon_svg():
    return Response(FAVICON_SVG, mimetype="image/svg+xml")


@bp_home.route("/favicon.ico")
def favicon_ico():
    return redirect("/favicon.svg")
