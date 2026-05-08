// release-hero.js — Pinta el library_hero de un juego destacado
// (recien salido + relevante) en el #release-hero-bg. Fondo decorativo,
// no clickeable.
//
// **Experimental**: si la prueba no pega, borrar este archivo + el div
// + el bloque CSS marcado en style.css.

(function(){
  function getCurrency(){
    return (typeof currentCurrency !== "undefined" && currentCurrency)
      ? currentCurrency : "COP";
  }

  function escHtml(s){
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
                    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  async function loadReleaseHero(){
    var bg    = document.getElementById("release-hero-bg");
    var label = document.getElementById("release-hero-label");
    if (!bg) return;
    try {
      var r = await fetch("/api/new-release-hero?currency=" + getCurrency());
      if (!r.ok) return;
      var data = await r.json();
      if (data.game && data.game.hero) {
        // Preload primero, despues set + fade-in. Asi evitamos el "flash"
        // de un bg negro -> imagen pop.
        var img = new Image();
        img.onload = function(){
          bg.style.backgroundImage = "url('" + data.game.hero + "')";
          bg.classList.add("loaded");
          if (label) {
            label.innerHTML = "<span class='rh-tag'>NEW</span>" + escHtml(data.game.title);
            label.classList.add("loaded");
          }
        };
        img.src = data.game.hero;
      }
    } catch(e) {}
  }

  // Currency change → re-pegar (otro pais puede tener distinto top seller).
  // No es critico, pero alinea con el comportamiento del banner ATL.
  window.reloadReleaseHero = loadReleaseHero;

  document.addEventListener("DOMContentLoaded", function(){
    setTimeout(loadReleaseHero, 50);
  });
})();
