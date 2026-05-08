# routes/__init__.py — Registro centralizado de blueprints

from .home import bp_home
from .prices import bp_prices
from .wishlist import bp_wishlist
from .scores import bp_scores
from .sentry_tunnel import bp_sentry_tunnel
from .atl import bp_atl
from .new_release import bp_new_release


ALL_BLUEPRINTS = [bp_home, bp_prices, bp_wishlist, bp_scores, bp_sentry_tunnel, bp_atl, bp_new_release]


def register_all(app):
    """Registra todos los blueprints en la app Flask."""
    for bp in ALL_BLUEPRINTS:
        app.register_blueprint(bp)
