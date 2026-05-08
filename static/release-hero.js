// release-hero.js — Posicionamiento del #release-hero-bg.
//
// La imagen la setea atl-banner.js (`syncReleaseHero`) cada vez que cambia
// la slide. Aca solo nos encargamos del top: alineado al #ui-subtitle. La
// height vive en CSS (fija). Recalcula on resize porque el header cambia
// altura con el clamp() del logo + viewport width.
//
// **Experimental**: si la prueba no pega, borrar este archivo + el div
// + el bloque CSS marcado en style.css + la funcion syncReleaseHero en
// atl-banner.js + el sync en renderAtlBanner/animateTo.

(function(){
  function positionHeroBg(){
    var bg  = document.getElementById("release-hero-bg");
    var sub = document.getElementById("ui-subtitle");
    if (!bg || !sub) return;
    var rect = sub.getBoundingClientRect();
    // Math.round → top entero, evita renders sub-pixel raros y queda
    // alineado a las lineas del grid pseudo de body::before.
    var topY = Math.round(rect.top + window.pageYOffset);
    bg.style.top = Math.max(0, topY) + "px";
  }

  document.addEventListener("DOMContentLoaded", positionHeroBg);

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
})();
