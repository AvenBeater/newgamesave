# config.py — Constantes y configuración global

import os

# Carga .env si existe (solo en local; en Railway/Fly las env vars vienen del dashboard)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ── Sentry (errores en backend) ──────────────────────────────────────────────
# Init temprano: se hace antes de que Flask reciba requests.
# Si SENTRY_DSN_BACKEND no está seteado, simplemente no se inicializa (modo dev sin tracking).
try:
    import sentry_sdk
    from sentry_sdk.integrations.flask import FlaskIntegration

    _sentry_dsn = os.environ.get("SENTRY_DSN_BACKEND", "").strip()
    if _sentry_dsn:
        sentry_sdk.init(
            dsn=_sentry_dsn,
            integrations=[FlaskIntegration()],
            send_default_pii=True,
            traces_sample_rate=0.1,  # 10% de requests para performance monitoring
            release=os.environ.get("RAILWAY_GIT_COMMIT_SHA") or "dev",
            environment=os.environ.get("RAILWAY_ENVIRONMENT") or "local",
        )
except ImportError:
    pass

ITAD_API_KEY = os.environ.get("ITAD_API_KEY", "").strip()
if not ITAD_API_KEY:
    raise RuntimeError(
        "ITAD_API_KEY no configurado. Crea un archivo .env en la raíz del proyecto "
        "con la línea ITAD_API_KEY=tu_clave_aqui (ver .env.example)."
    )

# DSN público del frontend, expuesto al template para inicializar Sentry en el browser
SENTRY_DSN_FRONTEND = os.environ.get("SENTRY_DSN_FRONTEND", "").strip()

CURRENCY_CONFIG = {
    "COP": {"cc": "CO", "itad_country": "CO", "symbol": "$",    "fallback_usd_rate": 4200},
    "USD": {"cc": "US", "itad_country": "US", "symbol": "US$",  "fallback_usd_rate": 1},
    "MXN": {"cc": "MX", "itad_country": "MX", "symbol": "$",    "fallback_usd_rate": 17},
    "ARS": {"cc": "AR", "itad_country": "AR", "symbol": "$",    "fallback_usd_rate": 900},
    "BRL": {"cc": "BR", "itad_country": "BR", "symbol": "R$",   "fallback_usd_rate": 5},
    "EUR": {"cc": "DE", "itad_country": "DE", "symbol": "\u20ac", "fallback_usd_rate": 0.92},
}

STEAM_LANG = {
    "es": "spanish", "en": "english", "pt": "portuguese", "fr": "french",
}

STORE_NAMES = {
    "steam": "Steam", "humblestore": "Humble Store", "fanatical": "Fanatical",
    "gog": "GOG", "epicgames": "Epic Games", "gamebillet": "GameBillet",
    "wingamestore": "WinGameStore", "greenman": "Green Man Gaming",
    "indiegala": "IndieGala", "voidu": "Voidu",
}

STORE_COLORS = {
    "steam": "#1b2838", "humblestore": "#e8704a", "fanatical": "#e4003a",
    "gog": "#7c2d8e", "epicgames": "#2d2d2d", "gamebillet": "#0078d4",
    "wingamestore": "#2ecc71", "greenman": "#78b900",
    "indiegala": "#c0392b", "voidu": "#ff6b35",
}

LANG_LABELS = {"es": "ES", "en": "EN", "pt": "PT", "fr": "FR"}
LANG_FLAGS  = {"es": "\U0001f1ea\U0001f1f8", "en": "\U0001f1fa\U0001f1f8",
               "pt": "\U0001f1e7\U0001f1f7", "fr": "\U0001f1eb\U0001f1f7"}

# Headers que simulan un navegador real — evita 403 de Steam
STEAM_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "application/json, text/javascript, */*; q=0.01",
}

FAVICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#080c10"/>
  <rect x="8" y="20" width="48" height="26" rx="12" fill="#0d1117" stroke="#00ff87" stroke-width="2"/>
  <rect x="18" y="30" width="10" height="3" rx="1.5" fill="#00ff87"/>
  <rect x="21.5" y="26.5" width="3" height="10" rx="1.5" fill="#00ff87"/>
  <circle cx="42" cy="28" r="2.2" fill="#00ff87"/>
  <circle cx="48" cy="33" r="2.2" fill="#00ff87"/>
  <circle cx="36" cy="33" r="2.2" fill="#00ff87"/>
  <circle cx="42" cy="38" r="2.2" fill="#00ff87"/>
</svg>"""
