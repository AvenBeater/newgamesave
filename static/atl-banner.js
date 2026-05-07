// atl-banner.js — All-Time Low banner (juegos en precio historico minimo hoy)

(function(){
  var ATL_LIMIT = 5;

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

  function renderAtlBanner(games){
    var el = document.getElementById("atl-banner");
    if (!el) return;
    var label = (typeof t === "function" && t("atlTodayTitle")) || "ALL-TIME LOWS HOY";
    var html = "<div class='atl-banner-header'>"
      + "<span class='pa-icon pa-icon-fire'></span> "
      + "<span class='atl-banner-label'>" + esc(label) + "</span>"
      + "</div>"
      + "<div class='atl-cards'>";
    for (var i = 0; i < games.length; i++) {
      var g = games[i];
      var cover = g.cover || "";
      var disc = g.discount > 0 ? ("-" + g.discount + "%") : "";
      html += "<div class='atl-card' onclick='atlClick(" + i + ")' tabindex='0' role='button'"
        + " aria-label='" + esc(g.title) + "' data-idx='" + i + "'>";
      if (cover) {
        html += "<img class='atl-cover' src='" + esc(cover)
          + "' alt='' loading='lazy' onerror='this.style.display=\"none\"'>";
      } else {
        html += "<div class='atl-cover atl-cover-placeholder'></div>";
      }
      html += "<div class='atl-info'>";
      html += "<div class='atl-title'>" + esc(g.title) + "</div>";
      html += "<div class='atl-price-row'>";
      html += "<span class='atl-price'>" + fmtPrice(g.priceNative) + " " + esc(g.currency) + "</span>";
      if (disc) html += "<span class='atl-discount'>" + disc + "</span>";
      html += "</div>";
      html += "<div class='atl-meta'>" + esc(g.store || "") + "</div>";
      html += "</div></div>";
    }
    html += "</div>";
    window._atlGames = games;
    el.innerHTML = html;
    el.style.display = "block";

    // Keyboard support: Enter / Space dispara click
    var cards = el.querySelectorAll(".atl-card");
    for (var j = 0; j < cards.length; j++) {
      cards[j].addEventListener("keydown", function(e){
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          var idx = parseInt(this.getAttribute("data-idx"), 10);
          atlClick(idx);
        }
      });
    }
  }

  window.atlClick = function(i){
    var g = window._atlGames && window._atlGames[i];
    if (!g) return;
    if (typeof switchTab === "function") switchTab("search");
    var input = document.getElementById("search-input");
    if (input) {
      input.value = g.title;
      if (typeof updateClearBtn === "function") updateClearBtn();
    }
    // Si tenemos appid de Steam (extraido de la URL del deal), saltamos directo
    // a fetchPrices via selectGame. Si no, caemos a searchGame() que pega a
    // /api/search y toma el primer resultado.
    if (g.appid && typeof selectGame === "function") {
      selectGame(g.appid, g.title);
    } else if (typeof searchGame === "function") {
      searchGame();
    }
    // Scroll a results / loading una vez la UI cambio
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

  // Init: pequeño delay para que helpers.js setee currentCurrency desde localStorage.
  document.addEventListener("DOMContentLoaded", function(){
    setTimeout(loadAtlBanner, 250);
  });
})();
