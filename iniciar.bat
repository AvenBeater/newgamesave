@echo off
chcp 65001 >nul
title Gamewise

echo ============================================
echo   🎮  Gamewise v2.2
echo ============================================
echo.
echo  Tu navegador se abrira automaticamente.
echo  Para cerrar la app presiona Ctrl+C aqui.
echo.
echo ============================================

cd /d "%~dp0"

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python no encontrado.
    echo Descarga Python desde https://www.python.org
    pause
    exit /b 1
)

pip install -r requirements.txt -q --disable-pip-version-check

python app.py
pause
