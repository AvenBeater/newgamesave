// app.js — Inicialización

// Orden importante:
// 1. _loadPrefs() lee localStorage > CF-IPCountry > navigator.language > default,
//    setea currentLang/currentCurrency y sincroniza los <select>.
// 2. applyLang() renderiza todos los textos UI con el idioma elegido (sobrescribe
//    los hardcoded en inglés del HTML).
// 3. loadRate() pide el tipo de cambio para la moneda elegida.
_loadPrefs();
applyLang();
loadRate();
document.getElementById("empty").style.display="block";
