# cache.py — Cachés en memoria centralizados
# Reagrupa los cachés que antes vivían sueltos en app.py.

import time


class TTLCache:
    """Caché key→value en memoria. Si ttl es None, las entradas no expiran."""

    def __init__(self, ttl=None):
        self.ttl = ttl
        self._store = {}

    def get(self, key, default=None):
        entry = self._store.get(key)
        if entry is None:
            return default
        value, ts = entry
        if self.ttl is not None and (time.time() - ts) >= self.ttl:
            self._store.pop(key, None)
            return default
        return value

    def set(self, key, value):
        self._store[key] = (value, time.time())

    def __contains__(self, key):
        return self.get(key, _MISSING) is not _MISSING

    def __getitem__(self, key):
        v = self.get(key, _MISSING)
        if v is _MISSING:
            raise KeyError(key)
        return v

    def __setitem__(self, key, value):
        self.set(key, value)


_MISSING = object()


# ── Instancias compartidas ──────────────────────────────────────────────────
# Todas las rutas y módulos backend importan desde aquí.

# Lookup ITAD por appid: {appid: {"id", "title"} or None}
itad_lookup_cache = TTLCache()

# Reviews de Steam por appid: {appid: {"score", "total", "positive"}}
reviews_cache = TTLCache()

# Metacritic por appid: {appid: {"score", "url"}}
metacritic_cache = TTLCache()

# Scrape unificado por (appid, currency): {(appid, currency): {price, reviews, metacritic, bundles}}
scrape_cache = TTLCache()

# Precios de wishlist por (appid, currency): TTL 5 min para que se refresquen ofertas
wl_price_cache = TTLCache(ttl=300)
