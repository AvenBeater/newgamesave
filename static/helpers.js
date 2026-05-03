// helpers.js — Estado global, utilidades, i18n, tasa de cambio

// ── Utility onerror handlers ────────────────────────────────────
function hideImg(el){ el.style.display='none'; }
function hideCover(){
  var c=document.getElementById('bdcover');
  var p=document.getElementById('cvph');
  if(c) c.style.display='none';
  if(p) p.style.display='flex';
}

// ── State ───────────────────────────────────────────────────────
var currentRate=1, currentLang="en", currentCurrency="USD";
var currentView="grid", lastData=null, lastGameName="";
var selectedGame=null, searchTimeout=null;

// ── localStorage keys para preferencias del usuario ─────────────
var LS_LANG_KEY     = "newgamesave_lang_v1";
var LS_CURRENCY_KEY = "newgamesave_currency_v1";

// Mapping país (CF-IPCountry) → idioma + moneda. La primera visita usa
// esto si no hay localStorage. Una vez que el usuario toca cualquiera de
// los dos selectores, su elección queda guardada y la detección queda
// out (localStorage gana siempre).
var COUNTRY_DEFAULTS = {
  AR: { lang: "es", currency: "ARS" },
  BR: { lang: "pt", currency: "BRL" },
  CL: { lang: "es", currency: "CLP" },
  CO: { lang: "es", currency: "COP" },
  MX: { lang: "es", currency: "MXN" },
  US: { lang: "en", currency: "USD" },
  CA: { lang: "en", currency: "USD" },
  ES: { lang: "es", currency: "EUR" },
  FR: { lang: "fr", currency: "EUR" },
  BE: { lang: "fr", currency: "EUR" },
  PT: { lang: "pt", currency: "EUR" },
  DE: { lang: "en", currency: "EUR" },
  IT: { lang: "en", currency: "EUR" },
  NL: { lang: "en", currency: "EUR" },
  AT: { lang: "en", currency: "EUR" },
  IE: { lang: "en", currency: "EUR" },
  LU: { lang: "fr", currency: "EUR" },
  CH: { lang: "fr", currency: "EUR" },
  GR: { lang: "en", currency: "EUR" },
  FI: { lang: "en", currency: "EUR" },
};

// Si no hay país (Cloudflare proxy off, localhost) o el país no está
// listado, caemos a navigator.language. Las claves coinciden con el
// prefijo de los códigos típicos (es-AR, pt-PT, fr-CA...).
var BROWSER_LANG_DEFAULTS = {
  es: { lang: "es", currency: "COP" },
  pt: { lang: "pt", currency: "EUR" },
  fr: { lang: "fr", currency: "EUR" },
};

function _detectDefaults() {
  // 1. Cloudflare country (más específico que el browser language)
  var meta = document.querySelector('meta[name="cf-country"]');
  var country = meta ? (meta.getAttribute("content") || "").trim().toUpperCase() : "";
  if (country && COUNTRY_DEFAULTS[country]) return COUNTRY_DEFAULTS[country];

  // 2. navigator.language (fallback)
  var nav = (navigator.language || "en").toLowerCase().split("-")[0];
  if (BROWSER_LANG_DEFAULTS[nav]) return BROWSER_LANG_DEFAULTS[nav];

  // 3. Default duro: inglés + USD
  return { lang: "en", currency: "USD" };
}

function _loadPrefs() {
  // localStorage gana sobre detección. Si el usuario cambió algo antes,
  // respetamos su elección al 100%.
  var savedLang     = null;
  var savedCurrency = null;
  try {
    savedLang     = localStorage.getItem(LS_LANG_KEY);
    savedCurrency = localStorage.getItem(LS_CURRENCY_KEY);
  } catch(e) {}

  var defaults = _detectDefaults();

  // Validar que el valor guardado siga siendo soportado (por si cambian
  // las opciones disponibles en el futuro)
  var validLangs = ["es", "en", "pt", "fr"];
  var validCurrs = ["COP", "USD", "MXN", "ARS", "BRL", "CLP", "EUR"];

  currentLang     = (savedLang     && validLangs.indexOf(savedLang)     !== -1) ? savedLang     : defaults.lang;
  currentCurrency = (savedCurrency && validCurrs.indexOf(savedCurrency) !== -1) ? savedCurrency : defaults.currency;

  var langSel = document.getElementById("sel-lang");
  var curSel  = document.getElementById("sel-currency");
  if (langSel) langSel.value = currentLang;
  if (curSel)  curSel.value  = currentCurrency;

  document.documentElement.lang = currentLang;
}

// ── Helpers ─────────────────────────────────────────────────────
function t(k){ return (I18N[currentLang]||I18N.es)[k]||k; }

function fmtPrice(n){
  var c=CURR[currentCurrency]||CURR.COP;
  return c.symbol + Number(n).toLocaleString(c.locale,{minimumFractionDigits:0,maximumFractionDigits:c.dec});
}

function esc(s){
  return String(s)
    .replace(/&/g,"&amp;").replace(/'/g,"&#39;")
    .replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── i18n apply ──────────────────────────────────────────────────
function applyLang(){
  document.getElementById("ui-subtitle").textContent  = t("subtitle");
  document.getElementById("btn-search").textContent   = t("searchBtn");
  document.getElementById("search-input").placeholder = t("searchPH");
  document.getElementById("ui-loading").textContent   = t("loading");
  document.getElementById("ui-empty").textContent     = t("empty");
  document.getElementById("ui-footer").textContent    = t("footer");
  // Tabs
  document.getElementById("tab-search").innerHTML   = "&#128269; " + t("tabSearch");
  var _wlBadge = document.getElementById("wl-deal-badge");
  var _wlBadgeHTML = _wlBadge ? _wlBadge.outerHTML : '<span class="tab-badge zero" id="wl-deal-badge">0</span>';
  document.getElementById("tab-wishlist").innerHTML  = "&#10084; " + t("tabWishlist") + " " + _wlBadgeHTML;
  // Wishlist
  document.getElementById("wishlist-input").placeholder = t("wlInputPH");
  document.getElementById("btn-wishlist").innerHTML     = "&#10084; " + t("wlLoadBtn");
  document.getElementById("wl-title").textContent       = t("wlTitle");
  var wlHint = document.querySelector(".wl-hint");
  if(wlHint) wlHint.innerHTML = t("wlProfilePublic") + ' &middot; <a href="https://steamcommunity.com/my/edit/settings" target="_blank">' + t("wlConfigPrivacy") + ' &#8599;</a>';
  var wlLoadP = document.querySelector("#wl-loading p");
  if(wlLoadP) wlLoadP.textContent = t("wlLoading");
  var wlEmptyP = document.querySelector("#wl-empty p");
  if(wlEmptyP) wlEmptyP.textContent = t("wlEmpty");
  // Sort buttons
  var sortLabel = document.querySelector(".wl-sort-label");
  if(sortLabel) sortLabel.textContent = t("sortLabel");
  var perPageLabel = document.querySelectorAll(".wl-sort-label")[1];
  if(perPageLabel) perPageLabel.textContent = t("perPageLabel");
  var sd = document.getElementById("wsort-discount"); if(sd) sd.textContent = t("sortDiscount");
  var sp = document.getElementById("wsort-price");    if(sp) sp.textContent = t("sortPrice");
  var sn = document.getElementById("wsort-name");     if(sn) sn.textContent = t("sortName");
  // Duration, Reviews, MC buttons update via their own functions
  if(typeof updateDurationBtn === "function") updateDurationBtn();
  if(typeof updateReviewsBtn === "function") updateReviewsBtn();
  if(typeof updateMCBtn === "function") updateMCBtn();
  // Wishlist search
  var wlSearch = document.getElementById("wl-search");
  if(wlSearch) wlSearch.placeholder = t("wlSearchPH");
  var wlSearchClear = document.getElementById("wl-search-clear");
  if(wlSearchClear) wlSearchClear.title = t("wlSearchClear");
  // Rate badge
  document.getElementById("rate-text").textContent = t("appLoading");
  // Donate widget
  var donTitle = document.getElementById("donate-title");
  if(donTitle) donTitle.textContent = t("donateTitle");
  var donMsg = document.getElementById("donate-msg");
  if(donMsg) donMsg.textContent = t("donateMessage");
  var donBtn = document.getElementById("donate-btn-label");
  if(donBtn) donBtn.textContent = t("donateBtn");
  var donFab = document.getElementById("donate-fab");
  if(donFab) donFab.setAttribute("aria-label", t("donateTitle"));

  if(lastData) renderResults(lastData, lastGameName);
}

// ── Rate ────────────────────────────────────────────────────────
async function loadRate(){
  try{
    var ctrl=new AbortController();
    var to=setTimeout(function(){ctrl.abort();},4000);
    var r=await fetch("/api/rate?currency="+currentCurrency,{signal:ctrl.signal});
    clearTimeout(to);
    var d=await r.json();
    if(d.rate&&d.rate>0){
      currentRate=d.rate;
      document.getElementById("rate-text").textContent=
        "USD \u2192 "+currentCurrency+": "+fmtPrice(d.rate)+" \u00b7 "+t("updated");
    }
  }catch(e){
    document.getElementById("rate-text").textContent=currentCurrency+" (est.)";
  }
}

// ── Lang / Currency change ──────────────────────────────────────
function onLangChange(){
  currentLang=document.getElementById("sel-lang").value;
  try { localStorage.setItem(LS_LANG_KEY, currentLang); } catch(e) {}
  document.documentElement.lang = currentLang;
  if(selectedGame) searchInput.value = selectedGame.name;
  applyLang();
  if(selectedGame) fetchPrices(selectedGame.id, selectedGame.name);
  // Wishlist: re-render para refrescar textos i18n dentro de las cards
  // (precio/moneda no cambia, no hace falta refetch)
  if (typeof _wlGames !== 'undefined' && _wlGames.length > 0) {
    if (typeof updateSubtitle === 'function') updateSubtitle();
    if (typeof renderWishlistCards === 'function') renderWishlistCards();
    var _prog = document.getElementById('wl-progress');
    if (_prog && _prog.style.display !== 'none' && typeof updateProgress === 'function') {
      updateProgress(typeof _wlLoaded !== 'undefined' ? _wlLoaded : 0);
    }
  }
}

function onCurrencyChange(){
  currentCurrency=document.getElementById("sel-currency").value;
  try { localStorage.setItem(LS_CURRENCY_KEY, currentCurrency); } catch(e) {}
  loadRate();
  if(selectedGame) fetchPrices(selectedGame.id,selectedGame.name);
  // Wishlist: refetch — los precios están guardados en moneda nativa,
  // no se pueden convertir en cliente, hay que volver a pegarle al backend.
  if (typeof _wlGames !== 'undefined' && _wlGames.length > 0 && _wlSteamId) {
    var _wlInput = document.getElementById('wishlist-input');
    if (_wlInput && !_wlInput.value) _wlInput.value = _wlSteamId;
    if (typeof loadWishlist === 'function') loadWishlist();
  }
}

// ── UI state helpers ────────────────────────────────────────────
function showLoading(){hideAll();document.getElementById("loading").style.display="block";document.getElementById("btn-search").disabled=true;}
function showEmpty(){hideAll();document.getElementById("empty").style.display="block";}
function hideAll(){
  ["loading","results-section","empty","best-deal"].forEach(function(id){
    document.getElementById(id).style.display="none";
  });
  document.getElementById("btn-search").disabled=false;
}
function noResults(){return "<div style='grid-column:1/-1;text-align:center;color:var(--muted);padding:40px'>"+t("noResults")+"</div>";}

// ── Clear search + localStorage ─────────────────────────────────
function clearSearch(){
  document.getElementById("search-input").value="";
  document.getElementById("btn-clear").style.display="none";
  selectedGame=null; lastData=null; lastGameName="";
  cancelHltb();
  cancelReviews();
  cancelMetacritic();

  hideAll();
  document.getElementById("empty").style.display="block";
  try{ localStorage.clear(); }catch(e){}
}

function updateClearBtn(){
  var btn=document.getElementById("btn-clear");
  if(btn) btn.style.display=document.getElementById("search-input").value.length>0?"flex":"none";
}

function clearWishlistSearch(){
  document.getElementById("wishlist-input").value="";
  document.getElementById("btn-wl-clear").style.display="none";
  document.getElementById("wl-results").style.display="none";
  document.getElementById("wl-empty").style.display="";
  document.getElementById("wl-empty").querySelector("p").textContent=t("wlEmpty");
  var badge=document.getElementById("wl-deal-badge");
  if(badge){ badge.textContent=""; badge.classList.add("zero"); }
  cancelHltb();
  cancelReviews();
  cancelMetacritic();

  try{ localStorage.clear(); }catch(e){}
}

function updateWlClearBtn(){
  var btn=document.getElementById("btn-wl-clear");
  if(btn) btn.style.display=document.getElementById("wishlist-input").value.length>0?"flex":"none";
}

// ── Scroll to top ──────────────────────────────────────
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    var btn = document.getElementById('scroll-top');
    if (!btn) return;
    window.addEventListener('scroll', function() {
      btn.classList.toggle('visible', window.scrollY > 400);
    });
    btn.addEventListener('click', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
})();


// ── Donate FAB (PayPal) ────────────────────────────────────────
function toggleDonate() {
  var card = document.getElementById('donate-card');
  if (!card) return;
  var open = card.classList.toggle('open');
  card.setAttribute('aria-hidden', open ? 'false' : 'true');
}

(function() {
  document.addEventListener('click', function(e) {
    var wrap = document.querySelector('.donate-fab-wrap');
    var card = document.getElementById('donate-card');
    if (!wrap || !card || !card.classList.contains('open')) return;
    if (!wrap.contains(e.target)) {
      card.classList.remove('open');
      card.setAttribute('aria-hidden', 'true');
    }
  });
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    var card = document.getElementById('donate-card');
    if (card && card.classList.contains('open')) {
      card.classList.remove('open');
      card.setAttribute('aria-hidden', 'true');
    }
  });
})();
