# routes/sentry_tunnel.py — Proxy de eventos de Sentry desde el frontend.
#
# Ad blockers (uBlock Origin, Brave Shields, EasyPrivacy, etc.) bloquean por
# defecto los endpoints `*.ingest.sentry.io`. Este tunnel recibe los envelopes
# desde el browser en /sentry-tunnel y los reenvía al ingest real desde el
# server — al ser mismo origen, los blockers no lo tocan.
#
# Patrón oficial recomendado por Sentry:
#   https://docs.sentry.io/platforms/javascript/troubleshooting/#using-the-tunnel-option

import json
from urllib.parse import urlparse

import requests
from flask import Blueprint, Response, request

from ..config import SENTRY_DSN_FRONTEND


bp_sentry_tunnel = Blueprint("sentry_tunnel", __name__)


# Pre-parseamos el DSN una sola vez al import.
_INGEST_HOST = None
_PROJECT_ID = None
if SENTRY_DSN_FRONTEND:
    try:
        _dsn = urlparse(SENTRY_DSN_FRONTEND)
        _INGEST_HOST = _dsn.hostname
        _PROJECT_ID = _dsn.path.strip("/")
    except (AttributeError, ValueError):
        pass


@bp_sentry_tunnel.route("/sentry-tunnel", methods=["POST"])
def sentry_tunnel():
    if not _INGEST_HOST or not _PROJECT_ID:
        return Response("Sentry not configured", status=503)

    envelope = request.get_data()
    if not envelope:
        return Response("Empty envelope", status=400)

    # El primer line del envelope es JSON con el DSN. Validamos que coincida
    # con nuestro proyecto para que el tunnel no se use para reenviar a
    # cualquier otro proyecto de Sentry.
    try:
        header_line = envelope.split(b"\n", 1)[0]
        header = json.loads(header_line)
        envelope_dsn = header.get("dsn", "")
        envelope_project = urlparse(envelope_dsn).path.strip("/")
    except (json.JSONDecodeError, ValueError, AttributeError):
        return Response("Invalid envelope header", status=400)

    if envelope_project != _PROJECT_ID:
        return Response("Project ID mismatch", status=400)

    upstream_url = f"https://{_INGEST_HOST}/api/{_PROJECT_ID}/envelope/"
    try:
        upstream = requests.post(
            upstream_url,
            data=envelope,
            headers={"Content-Type": "application/x-sentry-envelope"},
            timeout=5,
        )
        return Response(upstream.content, status=upstream.status_code)
    except requests.RequestException:
        return Response("Upstream error", status=502)
