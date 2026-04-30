# 🎮 NewGame+Save — Comparador de Precios

> _New Game+ para tu billetera: compara precios y ahorra antes de comprar._

Compara precios de juegos en **pesos colombianos (COP)** entre Steam y múltiples tiendas externas.

## Tiendas comparadas
- Steam (precio oficial en COP)
- Humble Store
- Fanatical  
- GOG
- Epic Games
- Green Man Gaming
- IndieGala
- GameBillet
- WinGameStore
- Y más (vía IsThereAnyDeal)

## Cómo usar

### Opción 1 — Ejecución directa
```bash
# 1. Instala dependencias (solo la primera vez)
pip install -r requirements.txt

# 2. Ejecuta la app
python app.py
```
Se abrirá automáticamente en tu navegador en http://localhost:5000

### Opción 2 — Windows (doble clic)
Ejecuta `iniciar.bat`

## Requisitos
- Python 3.8 o superior
- Conexión a internet

## Notas
- La tasa de cambio USD/COP se actualiza en tiempo real
- Los precios provienen de Steam API e IsThereAnyDeal API
- App 100% portable: no instala nada en el sistema

## Licencia

El código está bajo licencia [MIT](LICENSE). Puedes forkearlo, modificarlo y redistribuirlo, incluso comercialmente, mientras conserves el aviso de copyright.

El nombre **NewGame+Save**, el logo y la identidad visual **no** están cubiertos por la MIT — ver [COPYRIGHT.md](COPYRIGHT.md) para detalles. Si forkeas el proyecto, debes rebrandear antes de deployar públicamente.
