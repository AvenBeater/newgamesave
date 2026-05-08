// atl-banner.js — All-Time Low slider full-width estilo Steam.
// Loop infinito con clones (sin rewind al ir last->first) + auto-rotate 10s
// con pausa en hover/focus.

(function(){
  var ATL_LIMIT = 7;
  var AUTO_MS = 10000;
  var TRANSITION_MS = 450;

  var _atlGames = [];
  var _atlIdx = 0;          // indice logico 0..n-1 (lo que muestran los dots)
  var _atlPhysIdx = 1;      // posicion fisica en el track con clones (0=clone last, 1..n=reales, n+1=clone first)
  var _autoTimer = null;
  var _animating = false;
  var _atlJustSwiped = false;  // flag: el touchend disparo nav, ignorar el click que sigue

  function getCurrency(){
    return (typeof currentCurrency !== "undefined" && currentCurrency) ? currentCurrency : "COP";
  }

  async function loadAtlBanner(){
    var el = document.getElementById("atl-banner");
    if (!el) return;
    try {
      var r = await fetch("/api/atl-today?currency=" + getCurrency() + "&limit=" + ATL_LIMIT);
      if (!r.ok) { el.style.display = "none"; return; }
      var data = await r.json();
      if (data.games && data.games.length) {
        renderAtlBanner(data.games);
      } else {
        el.style.display = "none";
      }
    } catch(e) {
      el.style.display = "none";
    }
  }

  function buildSlide(g, i, tagLabel, isClone){
    // Los clones no son interactivos: misma vista pero sin click ni focus
    var attrs = isClone
      ? " aria-hidden='true' tabindex='-1'"
      : " onclick='atlSlideClick(" + i + ")' tabindex='0'";
    var html = "<div class='atl-slide" + (isClone?" atl-clone":"") + "'" + attrs + " data-idx='" + i + "'>";
    if (g.cover) {
      var fbAttr = g.coverFallback && g.coverFallback !== g.cover
        ? " data-fallback='" + esc(g.coverFallback) + "'"
        : "";
      html += "<img class='atl-slide-img' src='" + esc(g.cover) + "' alt=''"
        + fbAttr + " onerror='atlImgFallback(this)' />";
    }
    html += "<div class='atl-slide-overlay'>";
    html += "<div class='atl-slide-meta'>";
    html += "<span class='atl-slide-tag'>" + esc(tagLabel) + "</span>";
    if (g.store) html += "<span class='atl-slide-store'>" + esc(g.store) + "</span>";
    html += "</div>";
    html += "<h3 class='atl-slide-title'>" + esc(g.title) + "</h3>";
    html += "<div class='atl-slide-price-row'>";
    html += "<span class='atl-slide-price'>" + fmtPrice(g.priceNative) + " " + esc(g.currency) + "</span>";
    if (g.originalNative > g.priceNative) {
      html += "<span class='atl-slide-original'>" + fmtPrice(g.originalNative) + "</span>";
    }
    if (g.discount > 0) {
      html += "<span class='atl-slide-discount'>-" + g.discount + "%</span>";
    }
    html += "</div>";
    if (g.bundlesCount > 0) {
      var bundleLbl = (typeof t === "function" && t("bundlesLabel")) || "bundles";
      html += "<div class='atl-slide-bundles'>"
        + "<span class='pa-icon pa-icon-gift'></span> "
        + g.bundlesCount + " " + esc(bundleLbl)
        + "</div>";
    }
    var ctaLabel = (typeof t === "function" && t("atlCta")) || "Ver precios";
    html += "<button class='atl-slide-cta' type='button' onclick='event.stopPropagation();atlSlideClick(" + i + ")'>"
      + esc(ctaLabel) + " &#x2192;</button>";
    html += "</div></div>";
    return html;
  }

  function renderAtlBanner(games){
    _atlGames = games;
    _atlIdx = 0;
    _atlPhysIdx = 1;            // primera real (despues del clone prependeado)
    _animating = false;

    var el = document.getElementById("atl-banner");
    if (!el) return;
    var n = games.length;

    var headerLabel = (typeof t === "function" && t("atlTodayTitle")) || "ALL-TIME LOW HOY";
    var tagLabel    = (typeof t === "function" && t("atlTagShort"))   || "ALL-TIME LOW";

    var slidesHtml = "";
    // Clone al inicio (copia de la ultima) para wrap "prev" suave
    if (n > 1) slidesHtml += buildSlide(games[n - 1], n - 1, tagLabel, true);
    for (var i = 0; i < n; i++) {
      slidesHtml += buildSlide(games[i], i, tagLabel, false);
    }
    // Clone al final (copia de la primera) para wrap "next" suave
    if (n > 1) slidesHtml += buildSlide(games[0], 0, tagLabel, true);

    var dotsHtml = "<div class='atl-dots' role='tablist' aria-label='ATL banner pagination'>";
    for (var k = 0; k < n; k++) {
      dotsHtml += "<button type='button' class='atl-dot" + (k===0?" active":"")
        + "' onclick='atlGoTo(" + k + ")' aria-label='Slide " + (k+1) + "'></button>";
    }
    dotsHtml += "</div>";

    var navHtml = "";
    if (n > 1) {
      navHtml = "<button type='button' class='atl-nav atl-nav-prev' onclick='atlPrev()' aria-label='Previous'>&#x2039;</button>"
              + "<button type='button' class='atl-nav atl-nav-next' onclick='atlNext()' aria-label='Next'>&#x203a;</button>";
    }

    var html = "<div class='atl-header'>"
      + "<span class='pa-icon pa-icon-fire'></span>"
      + "<span class='atl-header-label'>" + esc(headerLabel) + "</span>"
      + "</div>"
      + "<div class='atl-slider'>"
      +   "<div class='atl-track' id='atl-track'>" + slidesHtml + "</div>"
      +   navHtml
      + "</div>"
      + dotsHtml;

    el.innerHTML = html;
    el.style.display = "block";

    // Posicion inicial: primera slide real (saltando el clone prependeado)
    var track = document.getElementById("atl-track");
    if (track) {
      track.style.transition = "none";
      track.style.transform = "translateX(-" + (_atlPhysIdx * 100) + "%)";
      // Force reflow para que el siguiente cambio de transform sí anime
      void track.offsetHeight;
      track.style.transition = "";
    }

    // Hover/focus pause + arranque del auto-rotate (solo si hay >1 slide)
    var slider = el.querySelector(".atl-slider");
    if (slider && n > 1) {
      slider.addEventListener("mouseenter", stopAuto);
      slider.addEventListener("mouseleave", startAuto);
      slider.addEventListener("focusin", stopAuto);
      slider.addEventListener("focusout", startAuto);
      slider.addEventListener("keydown", function(e){
        if (e.key === "ArrowLeft") { e.preventDefault(); atlPrev(); }
        else if (e.key === "ArrowRight") { e.preventDefault(); atlNext(); }
      });
      attachTouchSwipe(slider);
      startAuto();
    }
  }

  // Swipe horizontal en mobile/tablet para navegar slides. Threshold 50px y
  // movimiento mayoritariamente horizontal (descarta scroll vertical).
  // Listeners passive para no bloquear scroll del documento.
  function attachTouchSwipe(slider){
    var sx = 0, sy = 0, dx = 0, dy = 0, gesturing = false;
    var SWIPE_MIN = 50;

    slider.addEventListener("touchstart", function(e){
      if (e.touches.length !== 1) return;
      var t = e.touches[0];
      sx = t.clientX; sy = t.clientY;
      dx = 0; dy = 0;
      gesturing = false;
      stopAuto();
    }, { passive: true });

    slider.addEventListener("touchmove", function(e){
      if (e.touches.length !== 1) return;
      var t = e.touches[0];
      dx = t.clientX - sx;
      dy = t.clientY - sy;
      // Marcamos como gesto horizontal si el movimiento X domina al Y
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) gesturing = true;
    }, { passive: true });

    slider.addEventListener("touchend", function(){
      if (gesturing && Math.abs(dx) >= SWIPE_MIN) {
        if (dx > 0) atlPrev(); else atlNext();
        // El touchend dispara un click sintetico inmediato; lo ignoramos por
        // ~350ms para que el swipe no abra la pagina del juego sin querer.
        _atlJustSwiped = true;
        setTimeout(function(){ _atlJustSwiped = false; }, 350);
      }
      startAuto();
    }, { passive: true });
  }

  // ── Animacion + jump (truco del clone) ────────────────────────
  function animateTo(physIdx, logicalIdx, postCb){
    if (_animating) return;
    var track = document.getElementById("atl-track");
    if (!track) return;
    _animating = true;
    track.style.transition = "transform .45s cubic-bezier(.22,.61,.36,1)";
    _atlPhysIdx = physIdx;
    _atlIdx = logicalIdx;
    track.style.transform = "translateX(-" + (physIdx * 100) + "%)";
    updateDots();
    setTimeout(function(){
      _animating = false;
      if (postCb) postCb();
    }, TRANSITION_MS);
  }

  function jumpTo(physIdx){
    var track = document.getElementById("atl-track");
    if (!track) return;
    track.style.transition = "none";
    _atlPhysIdx = physIdx;
    track.style.transform = "translateX(-" + (physIdx * 100) + "%)";
    void track.offsetHeight;     // reflow
    track.style.transition = "";
  }

  function updateDots(){
    var dots = document.querySelectorAll("#atl-banner .atl-dot");
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle("active", i === _atlIdx);
    }
  }

  // ── Navegacion publica ────────────────────────────────────────
  window.atlNext = function(){
    if (_animating) return;
    var n = _atlGames.length;
    if (n < 2) return;
    var nextLogical = (_atlIdx + 1) % n;
    var nextPhys = _atlPhysIdx + 1;
    animateTo(nextPhys, nextLogical, function(){
      // Si caimos en el clone post-final, saltar (sin animacion) a la primera real
      if (nextPhys === n + 1) jumpTo(1);
    });
  };

  window.atlPrev = function(){
    if (_animating) return;
    var n = _atlGames.length;
    if (n < 2) return;
    var prevLogical = (_atlIdx - 1 + n) % n;
    var prevPhys = _atlPhysIdx - 1;
    animateTo(prevPhys, prevLogical, function(){
      // Si caimos en el clone pre-primera, saltar (sin animacion) a la ultima real
      if (prevPhys === 0) jumpTo(n);
    });
  };

  window.atlGoTo = function(idx){
    if (_animating) return;
    var n = _atlGames.length;
    if (!n) return;
    var target = ((idx % n) + n) % n;
    if (target === _atlIdx) return;
    // Camino mas corto via clones: si forward es mas corto, ir forward; si backward, ir backward.
    // Esto evita el "barrido largo" cuando se salta de la 4 a la 0 (1 paso forward via clone) etc.
    var forwardSteps  = (target - _atlIdx + n) % n;
    var backwardSteps = (_atlIdx - target + n) % n;
    if (forwardSteps <= backwardSteps) {
      var newPhys = _atlPhysIdx + forwardSteps;
      animateTo(newPhys, target, function(){
        if (newPhys >= n + 1) jumpTo(target + 1);
      });
    } else {
      var newPhys2 = _atlPhysIdx - backwardSteps;
      animateTo(newPhys2, target, function(){
        if (newPhys2 <= 0) jumpTo(target + 1);
      });
    }
  };

  // ── Auto-rotate ───────────────────────────────────────────────
  function startAuto(){
    var n = _atlGames.length;
    if (n < 2) return;
    stopAuto();
    _autoTimer = setTimeout(function(){
      atlNext();
      startAuto();           // proxima en 10s desde el avance
    }, AUTO_MS);
  }
  function stopAuto(){
    if (_autoTimer) { clearTimeout(_autoTimer); _autoTimer = null; }
  }

  // ── Fallback de imagen y click handlers ──────────────────────
  window.atlImgFallback = function(img){
    if (!img) return;
    var fb = img.getAttribute("data-fallback");
    if (fb && img.src !== fb) {
      img.src = fb;
      img.removeAttribute("data-fallback");
    } else {
      img.style.display = "none";
    }
  };

  window.atlSlideClick = function(i){
    if (_atlJustSwiped) return;        // Ignorar click sintetico post-swipe
    var g = _atlGames[i];
    if (!g) return;
    if (typeof switchTab === "function") switchTab("search");
    var input = document.getElementById("search-input");
    if (input) {
      input.value = g.title;
      if (typeof updateClearBtn === "function") updateClearBtn();
    }
    if (g.appid && typeof selectGame === "function") {
      selectGame(g.appid, g.title);
    } else if (typeof searchGame === "function") {
      searchGame();
    }
    setTimeout(function(){
      var sec = document.getElementById("results-section");
      var loading = document.getElementById("loading");
      var target = (sec && sec.style.display !== "none") ? sec
                 : (loading && loading.style.display !== "none") ? loading
                 : null;
      if (target) target.scrollIntoView({behavior: "smooth", block: "start"});
    }, 200);
  };

  // Hook publico
  window.reloadAtlBanner = loadAtlBanner;

  // Sincroniza el texto del loading state con el idioma actual. El servidor
  // pre-renderiza el INSERT COIN segun CF-IPCountry, pero si el usuario
  // tiene otra preferencia guardada en localStorage, helpers.js seteo
  // currentLang distinto y aca lo reflejamos en el texto del loading.
  function syncLoadingText(){
    var el = document.querySelector(".atl-loading-text-main");
    if (!el || typeof t !== "function") return;
    var localized = t("atlInsertCoin");
    if (localized && localized !== "atlInsertCoin" && el.textContent !== localized) {
      el.textContent = localized;
    }
  }

  document.addEventListener("DOMContentLoaded", function(){
    syncLoadingText();
    setTimeout(loadAtlBanner, 250);
  });
})();
