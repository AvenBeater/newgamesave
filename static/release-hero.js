// release-hero.js — Posicionamiento del #release-hero-bg.
//
// La imagen la setea atl-banner.js (`syncReleaseHero`) cada vez que cambia
// la slide. Aca solo nos encargamos del layout: top = #ui-subtitle,
// height = distancia hasta `.tabs`, recalculado on resize y cuando el
// slider cambia de tamano (loading vs renderizado).
//
// **Experimental**: si la prueba no pega, borrar este archivo + el div
// + el bloque CSS marcado en style.css + la funcion syncReleaseHero en
// atl-banner.js + el sync en renderAtlBanner/animateTo.

(function(){
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

  document.addEventListener("DOMContentLoaded", positionHeroBg);

  // Resize cambia el offsetTop del subtitle (clamp del logo + viewport)
  // y la posicion de las tabs. Throttle simple con rAF.
  var _resizeRaf = null;
  window.addEventListener("resize", function(){
    if (_resizeRaf) return;
    _resizeRaf = requestAnimationFrame(function(){
      _resizeRaf = null;
      positionHeroBg();
    });
  });

  // El slider ATL pasa de loading (compacto) a render (alto): empuja
  // `.tabs` hacia abajo y la altura calculada queda corta. ResizeObserver
  // re-mide cuando el banner cambia de tamano.
  if (typeof ResizeObserver !== "undefined") {
    document.addEventListener("DOMContentLoaded", function(){
      var atl = document.getElementById("atl-banner");
      if (!atl) return;
      var ro = new ResizeObserver(function(){ positionHeroBg(); });
      ro.observe(atl);
    });
  }
})();
