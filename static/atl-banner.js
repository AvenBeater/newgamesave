// atl-banner.js — All-Time Low slider (1 juego a la vez, full-width, navegacion con flechas)

(function(){
  var ATL_LIMIT = 5;
  var _atlIdx = 0;
  var _atlGames = [];

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

  function buildSlide(g, i, tagLabel){
    var html = "<div class='atl-slide' onclick='atlSlideClick(" + i + ")' data-idx='" + i + "'>";
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
    var ctaLabel = (typeof t === "function" && t("atlCta")) || "Ver precios";
    html += "<button class='atl-slide-cta' type='button' onclick='event.stopPropagation();atlSlideClick(" + i + ")'>"
      + esc(ctaLabel) + " &#x2192;</button>";
    html += "</div></div>";
    return html;
  }

  function renderAtlBanner(games){
    _atlGames = games;
    _atlIdx = 0;
    var el = document.getElementById("atl-banner");
    if (!el) return;

    var headerLabel = (typeof t === "function" && t("atlTodayTitle")) || "ALL-TIME LOW HOY";
    var tagLabel = (typeof t === "function" && t("atlTagShort")) || "ALL-TIME LOW";

    var slidesHtml = "";
    for (var i = 0; i < games.length; i++) {
      slidesHtml += buildSlide(games[i], i, tagLabel);
    }

    var dotsHtml = "<div class='atl-dots' role='tablist' aria-label='ATL banner pagination'>";
    for (var k = 0; k < games.length; k++) {
      dotsHtml += "<button type='button' class='atl-dot" + (k===0?" active":"")
        + "' onclick='atlGoTo(" + k + ")' aria-label='Slide " + (k+1) + "'></button>";
    }
    dotsHtml += "</div>";

    var html = "<div class='atl-header'>"
      + "<span class='pa-icon pa-icon-fire'></span>"
      + "<span class='atl-header-label'>" + esc(headerLabel) + "</span>"
      + "</div>"
      + "<div class='atl-slider'>"
      +   "<div class='atl-track' id='atl-track'>" + slidesHtml + "</div>"
      +   "<button type='button' class='atl-nav atl-nav-prev' onclick='atlPrev()' aria-label='Previous'>&#x2039;</button>"
      +   "<button type='button' class='atl-nav atl-nav-next' onclick='atlNext()' aria-label='Next'>&#x203a;</button>"
      +   dotsHtml
      + "</div>";

    el.innerHTML = html;
    el.style.display = "block";

    // Teclado: flechas izq/der cuando el banner tiene foco interno
    el.addEventListener("keydown", function(e){
      if (e.key === "ArrowLeft") { e.preventDefault(); atlPrev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); atlNext(); }
    });
  }

  // ── Navegacion ───────────────────────────────────────────────
  window.atlGoTo = function(idx){
    if (!_atlGames.length) return;
    var n = _atlGames.length;
    _atlIdx = ((idx % n) + n) % n;
    var track = document.getElementById("atl-track");
    if (track) track.style.transform = "translateX(-" + (_atlIdx * 100) + "%)";
    var dots = document.querySelectorAll("#atl-banner .atl-dot");
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle("active", i === _atlIdx);
    }
  };
  window.atlPrev = function(){ atlGoTo(_atlIdx - 1); };
  window.atlNext = function(){ atlGoTo(_atlIdx + 1); };

  // Fallback de imagen: library_hero -> ITAD banner -> hide
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

  // Click → setear input + dispara busqueda directa (skip autocomplete)
  window.atlSlideClick = function(i){
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

  // Hook publico para refetch al cambiar currency / lang
  window.reloadAtlBanner = loadAtlBanner;

  document.addEventListener("DOMContentLoaded", function(){
    setTimeout(loadAtlBanner, 250);
  });
})();
