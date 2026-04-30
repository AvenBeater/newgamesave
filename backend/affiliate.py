# affiliate.py — Wrapper de URLs con tags de afiliado.
#
# Cómo se usa:
#   1. Te das de alta en el programa de cada tienda y te dan un ID/tag.
#   2. Reemplazas/descomentas la línea correspondiente en STORE_AFFILIATE_TAGS.
#   3. Las URLs que normaliza el backend se reescriben automáticamente.
#
# Mientras la lista esté vacía, tag_url() devuelve la URL sin tocar — cero riesgo
# de romper nada antes de tener cuentas activas.

from urllib.parse import quote


# ── Configuración ───────────────────────────────────────────────────────────
#
# Cada entrada mapea un store_id (tal como llega de ITAD en deal.shop.id) a
# una de estas formas:
#
#   1. String simple → query param a anexar (más común):
#        "humblestore": "partner=tu_partner_id"
#      Resultado: https://www.humblebundle.com/store/foo?partner=tu_partner_id
#
#   2. Tupla ("awin", merchant_id, affid) → reescribe vía deeplink de Awin:
#        "gog": ("awin", "12345", "987654")
#      Resultado: https://www.awin1.com/cread.php?awinmid=12345&awinaffid=987654&clickref=&ued=URL_ENCODED_ORIGINAL
#
# Programas relevantes para NewGame+Save:
#   - Humble Store     → directo en humblebundle.com/partners (param: partner=)
#   - Fanatical        → vía Impact Radius (param: ref=)
#   - GOG              → vía Awin (deeplink)
#   - Green Man Gaming → vía Awin (deeplink)
#   - GameBillet       → vía Awin (deeplink)
#   - IndieGala        → directo (param: ref=)
#   - Voidu            → directo (param: tap_a=)
#   - Epic Games       → no soporta tag por URL (Creator Code se aplica al checkout)
#   - Steam            → sin programa público
#
# Cuando tengas los IDs reales, descomenta y reemplaza:

STORE_AFFILIATE_TAGS = {
    # "humblestore": "partner=YOUR_HUMBLE_PARTNER_ID",
    # "fanatical":   "ref=YOUR_FANATICAL_REF",
    # "gog":         ("awin", "AWIN_GOG_MERCHANT_ID", "YOUR_AWIN_AFFID"),
    # "greenman":    ("awin", "AWIN_GMG_MERCHANT_ID", "YOUR_AWIN_AFFID"),
    # "gamebillet":  ("awin", "AWIN_GAMEBILLET_MERCHANT_ID", "YOUR_AWIN_AFFID"),
    # "indiegala":   "ref=YOUR_INDIEGALA_REF",
    # "voidu":       "tap_a=YOUR_VOIDU_REF",
}


# ── Implementación ──────────────────────────────────────────────────────────

def tag_url(store_id, url):
    """
    Reescribe url con el tag de afiliado configurado para store_id.
    Si no hay configuración, devuelve url sin cambios.
    """
    if not store_id or not url or url == "#":
        return url

    config = STORE_AFFILIATE_TAGS.get(str(store_id).lower())
    if not config:
        return url

    # Tipo 1: query param a anexar
    if isinstance(config, str):
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}{config}"

    # Tipo 2: deeplink Awin
    if isinstance(config, tuple) and len(config) >= 3 and config[0] == "awin":
        _, merchant_id, affid = config[:3]
        return (
            f"https://www.awin1.com/cread.php"
            f"?awinmid={merchant_id}&awinaffid={affid}&clickref=&ued={quote(url, safe='')}"
        )

    return url
