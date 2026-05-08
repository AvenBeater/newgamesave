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

  // Posiciona el bg empezando desde el #ui-subtitle hacia abajo y le
  // estira la altura hasta llegar al `.tabs`. Asi el bleeding pasa el
  // slider y el fade termina justo en las tabs. El logo queda intocado.
  // Recalcula on resize: el header cambia altura por el clamp() del logo
  // y el slider puede cambiar layout (loading vs render).
  function positionHeroBg(){
    var bg   = document.getElementById("release-hero-bg");
    var sub  = document.getElementById("ui-subtitle");
    var tabs = document.querySelector(".tabs");
    if (!bg || !sub) return;
    var subRect = sub.getBoundingClientRect();
    var topY = subRect.top + window.pageYOffset;
    bg.style.top = Math.max(0, topY) + "px";
    if (tabs) {
      var tabsRect = tabs.getBoundingClientRect();
      var bottomY = tabsRect.top + window.pageYOffset;
      bg.style.height = Math.max(200, bottomY - topY) + "px";
    }
  }

  async function loadReleaseHero(){
    var bg    = document.getElementById("release-hero-bg");
    var title = document.getElementById("release-hero-title");
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
          positionHeroBg();   // re-pos por si layout cambio mientras cargaba
          bg.classList.add("loaded");
          if (title) {
            title.textContent = data.game.title;
            title.classList.add("loaded");
            // El title pushea el slider: re-pos del bg al asentar el layout
            requestAnimationFrame(positionHeroBg);
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
    positionHeroBg();
    setTimeout(loadReleaseHero, 50);
  });
  // Resize cambia el offsetTop del subtitle (clamp del logo + viewport).
  // Throttle simple con rAF para no recalcular en cada pixel del resize.
  var _resizeRaf = null;
  window.addEventListener("resize", function(){
    if (_resizeRaf) return;
    _resizeRaf = requestAnimationFrame(function(){
      _resizeRaf = null;
      positionHeroBg();
    });
  });

  // El slider ATL pasa de loading (compacto) a render (alto), eso
  // empuja `.tabs` hacia abajo y la height calculada del hero queda corta.
  // ResizeObserver re-mide cuando el banner cambia de tamano.
  if (typeof ResizeObserver !== "undefined") {
    document.addEventListener("DOMContentLoaded", function(){
      var atl = document.getElementById("atl-banner");
      if (!atl) return;
      var ro = new ResizeObserver(function(){ positionHeroBg(); });
      ro.observe(atl);
    });
  }
})();
