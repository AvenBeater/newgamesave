# hltb_api.py — Integración con HowLongToBeat

import re

try:
    from howlongtobeatpy import HowLongToBeat
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'howlongtobeatpy', '-q'])
    from howlongtobeatpy import HowLongToBeat

# Caché en memoria (por sesión del servidor)
_hltb_cache = {}


def _clean_name(n):
    """Limpia caracteres especiales que rompen la búsqueda en HLTB."""
    n = re.sub(r'[®™©]', '', n)
    n = re.sub(r'[\U0001F000-\U0001FFFF\U00002600-\U000027FF\U0000FE00-\U0000FEFF]', '', n)
    n = n.replace('×', 'x').replace('–', '-').replace('—', '-')
    n = re.sub(r'\s+-([A-Z])', r' \1', n)
    n = re.sub(
        r'\s*[:\-–]\s*(Director\'s Cut|Remastered|Definitive Edition|Complete Edition|GOTY|Gold Edition)$',
        '', n, flags=re.IGNORECASE,
    )
    return n.strip()


def search_hltb(name):
    """
    Busca un juego en HowLongToBeat.
    Devuelve dict con {name, main, game?, cached?, debug?, error?}.
    """
    if not name:
        return {"name": name, "main": None, "error": "name required"}

    cache_key = name.lower()
    if cache_key in _hltb_cache and _hltb_cache[cache_key] is not None:
        return {"name": name, "main": _hltb_cache[cache_key], "cached": True}

    clean = _clean_name(name)
    search_names = [clean]
    if clean.title() != clean:
        search_names.append(clean.title())
    if name != clean:
        search_names.append(name)
    for sep in [' - ', ' – ', ': ']:
        if sep in clean:
            short = clean.split(sep)[0].strip()
            if short and short not in search_names:
                search_names.append(short)
            break

    debug_log = []

    try:
        for search_name in search_names:
            results = HowLongToBeat().search(search_name)
            if not results:
                debug_log.append(f"'{search_name}' → sin resultados en HLTB")
                continue

            best = max(results, key=lambda r: r.similarity)
            debug_log.append(
                f"'{search_name}' → '{best.game_name}' "
                f"sim={best.similarity:.2f} "
                f"main={best.main_story} extra={best.main_extra} complete={best.completionist}"
            )

            if best.similarity >= 0.35:
                hours = None
                for val in [best.main_story, best.main_extra, best.completionist]:
                    if val and val > 0:
                        hours = val
                        break
                if hours:
                    _hltb_cache[cache_key] = round(hours, 1)
                    return {"name": name, "main": round(hours, 1), "game": best.game_name}
                else:
                    debug_log.append(f"'{search_name}' → encontrado pero todos los tiempos son 0 o None")
                    break
            else:
                debug_log.append(f"'{search_name}' → similitud muy baja ({best.similarity:.2f}), necesita ≥0.35")

        _hltb_cache[cache_key] = None
        return {"name": name, "main": None, "debug": debug_log}
    except Exception as e:
        debug_log.append(f"excepción: {e}")
        return {"name": name, "main": None, "debug": debug_log, "error": str(e)}
