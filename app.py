# NewGame+Save — MIT License — Copyright (c) 2026 Albert Aguirre (AvenBeater)
# https://github.com/AvenBeater/newgamesave
#
# v2.4.0 - CLP currency, smart locale defaults + persistence, wishlist
#          list view, 10 nuevas tiendas + fix de colores por tienda
# v2.3.1 - Fix: cambio de idioma/moneda actualiza tarjetas de wishlist
# v2.3.0 - Rebrand Gamewise → NewGame+Save (newgamesave.com)
# v2.2.0 - Rebrand GameDeals → Gamewise + PayPal donate widget + AdSense slot
# v2.1.0 - Refactor: rutas en blueprints (backend/routes/) + cachés centralizados
# v2.0.0 - Refactor inicial en módulos
# v1.2.0 - Multi-idioma (ES/EN/PT/FR) + Multi-moneda (COP/USD/MXN/ARS/BRL/EUR)
# v1.1.0 - Fix esc() regex + suggestions via window._sugg index
# v1.0.0 - Release inicial

import os
import threading
import time
import webbrowser

from flask import Flask

from backend.routes import register_all


def create_app():
    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0  # sin caché de estáticos en desarrollo
    register_all(app)
    return app


app = create_app()


def _open_browser():
    time.sleep(1.2)
    webbrowser.open("http://localhost:5000")


# Local dev path: `python app.py` arranca el server de Flask y abre el browser.
# En producción (Railway/cualquier WSGI server), gunicorn importa `app:app`
# directamente y este bloque no corre — el browser-open quedaría vacío en un
# servidor sin display, así que mantenerlo dentro del __main__ guard.
if __name__ == "__main__":
    print("\n" + "=" * 50)
    print("  \U0001f3ae  NewGame+Save v2.4.0")
    print("=" * 50)
    print("  Abriendo en tu navegador...")
    print("  URL: http://localhost:5000")
    print("  Presiona Ctrl+C para cerrar")
    print("=" * 50 + "\n")
    threading.Thread(target=_open_browser, daemon=True).start()
    app.run(debug=False, port=5000)
