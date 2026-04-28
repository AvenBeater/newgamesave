# Gamewise — MIT License — Copyright (c) 2026 Albert Aguirre (AvenBeater)
# https://github.com/AvenBeater/gamewise
#
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


def open_browser():
    time.sleep(1.2)
    webbrowser.open("http://localhost:5000")


# Solo abrir el navegador en el proceso reloader principal
if os.environ.get("WERKZEUG_RUN_MAIN") != "true":
    threading.Thread(target=open_browser, daemon=True).start()


if __name__ == "__main__":
    print("\n" + "=" * 50)
    print("  \U0001f3ae  Gamewise v2.2.0")
    print("=" * 50)
    print("  Abriendo en tu navegador...")
    print("  URL: http://localhost:5000")
    print("  Presiona Ctrl+C para cerrar")
    print("=" * 50 + "\n")
    threading.Thread(target=open_browser, daemon=True).start()
    app.run(debug=False, port=5000)
