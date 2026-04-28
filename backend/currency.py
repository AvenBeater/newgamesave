# currency.py — Tasas de cambio USD → otras monedas

import requests
from .config import CURRENCY_CONFIG


def get_exchange_rates():
    """Obtiene tasas de cambio desde APIs públicas, con fallback a valores fijos."""
    try:
        r = requests.get("https://api.frankfurter.app/latest?from=USD", timeout=3)
        if r.status_code == 200:
            rates = r.json().get("rates", {})
            rates["USD"] = 1.0
            return rates
    except Exception:
        pass
    try:
        r = requests.get("https://open.er-api.com/v6/latest/USD", timeout=3)
        if r.status_code == 200:
            rates = r.json().get("rates", {})
            rates["USD"] = 1.0
            return rates
    except Exception:
        pass
    return {c: cfg["fallback_usd_rate"] for c, cfg in CURRENCY_CONFIG.items()}
