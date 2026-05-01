// wishlist.js — Carga de wishlist, cards, paginación, ordenamiento

// ── Estado ──────────────────────────────────────────────────────
var _wlGames     = [];
var _wlPrices    = {};
var _wlSortMode  = 'discount';
var _wlLoaded    = 0;
var _wlTotal     = 0;
var _wlSteamId   = '';
var _wlAllLoaded = false;
// _wlHltb, _wlHltbReady, _wlHltbTotal, _wlHltbLoaded definidas en wishlist-hltb.js

// Paginación
var _wlPage    = 1;
var _wlPerPage = 20;

// Búsqueda en wishlist
var _wlSearchQuery = '';

// Vista (grid/list) — persiste en localStorage
var _wlView = 'grid';
var LS_WL_VIEW_KEY = 'newgamesave_wl_view_v1';
(function _restoreWlView() {
  try {
    var saved = localStorage.getItem(LS_WL_VIEW_KEY);
    if (saved === 'grid' || saved === 'list') _wlView = saved;
  } catch(e) {}
})();

function setWlView(v) {
  if (v !== 'grid' && v !== 'list') return;
  _wlView = v;
  try { localStorage.setItem(LS_WL_VIEW_KEY, v); } catch(e) {}

  var grid = document.getElementById('wl-grid');
  if (grid) grid.classList.toggle('view-list', v === 'list');

  var btnGrid = document.getElementById('wl-btn-grid');
  var btnList = document.getElementById('wl-btn-list');
  if (btnGrid) btnGrid.classList.toggle('active', v === 'grid');
  if (btnList) btnList.classList.toggle('active', v === 'list');
}

// Sincronizar UI con el valor restaurado de localStorage en el momento
// que el DOM esté listo (el script va al final del body, pero los handlers
// de DOMContentLoaded son la forma estándar de garantizarlo).
(function _syncWlViewOnLoad() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setWlView(_wlView); });
  } else {
    setWlView(_wlView);
  }
})();


// ── Tab switcher ────────────────────────────────────────────────
function switchTab(tab) {
  document.getElementById('pane-search').style.display   = tab === 'search'   ? '' : 'none';
  document.getElementById('pane-wishlist').style.display = tab === 'wishlist' ? '' : 'none';
  document.getElementById('tab-search').classList.toggle('active',   tab === 'search');
  document.getElementById('tab-wishlist').classList.toggle('active', tab === 'wishlist');
}


// ── Caché wishlist en localStorage ──────────────────────────────
var WL_CACHE_KEY = 'newgamesave_wishlist_v2';
(function() {
  // Migración Gamewise → NewGame+Save: rescata steamid, limpia el resto
  try {
    var oldId = localStorage.getItem('gamewise_steamid');
    if (oldId && !localStorage.getItem('newgamesave_steamid')) {
      localStorage.setItem('newgamesave_steamid', oldId);
    }
  } catch(e) {}
  [
    'gamewise_steamid', 'gamewise_wishlist_v1', 'gamewise_wishlist_v2',
    'gamewise_hltb_v1', 'gamewise_metacritic_v1', 'gamewise_reviews_v1',
  ].forEach(function(k) { try { localStorage.removeItem(k); } catch(e) {} });
})();
var WL_CACHE_TTL = 30 * 60 * 1000;

function _saveWishlistCache() {
  try {
    var entry = {
      ts:       Date.now(),
      steamId:  _wlSteamId,
      currency: document.getElementById('sel-currency').value,
      games:    _wlGames,
      prices:   _wlPrices,
    };
    localStorage.setItem(WL_CACHE_KEY, JSON.stringify(entry));
  } catch(e) { console.warn('WL cache save error:', e); }
}

function _loadWishlistCache(steamId, currency) {
  try {
    var raw = localStorage.getItem(WL_CACHE_KEY);
    if (!raw) return null;
    var entry = JSON.parse(raw);
    if (entry.steamId !== steamId) return null;
    if (entry.currency !== currency) return null;
    if (Date.now() - entry.ts > WL_CACHE_TTL) return null;
    return entry;
  } catch(e) { return null; }
}


// ── Cargar wishlist ─────────────────────────────────────────────
function loadWishlist() {
  var steamId  = (document.getElementById('wishlist-input').value || '').trim();
  var currency = document.getElementById('sel-currency').value;
  var lang     = document.getElementById('sel-lang').value;

  if (!steamId) { document.getElementById('wishlist-input').focus(); return; }

  try {
    var prevId = localStorage.getItem('newgamesave_steamid');
    if (prevId && prevId !== steamId) {
      localStorage.removeItem(WL_CACHE_KEY);
    }
    localStorage.setItem('newgamesave_steamid', steamId);
  } catch(e) {}

  _wlSteamId   = steamId;
  _wlGames     = [];
  _wlPrices    = {};
  _wlLoaded    = 0;
  _wlPage      = 1;
  _wlAllLoaded = false;
  _wlHltb       = {};
  _wlHltbReady  = false;
  _wlHltbTotal  = 0;
  _wlHltbLoaded = 0;
  _hltbQueue    = [];
  _hltbRunning  = 0;
  _hltbStarted  = false;
  _wlReviews       = {};
  _wlReviewsReady  = false;
  _wlReviewsTotal  = 0;
  _wlReviewsLoaded = 0;
  _revQueue        = [];
  _revRunning      = 0;
  _wlMC       = {};
  _wlMCReady  = false;
  _wlMCTotal  = 0;
  _wlMCLoaded = 0;
  _mcQueue    = [];
  _mcRunning  = 0;

  document.getElementById('wl-empty').style.display       = 'none';
  document.getElementById('wl-results').style.display     = 'none';
  document.getElementById('wl-search-wrap').style.display = 'none';
  document.getElementById('btn-wishlist').disabled         = true;
  _wlSearchQuery = '';
  var si = document.getElementById('wl-search');
  if (si) si.value = '';

  // Intentar restaurar desde caché
  var cached = _loadWishlistCache(steamId, currency);
  if (cached && cached.games && cached.games.length) {
    document.getElementById('btn-wishlist').disabled = false;
    _wlGames     = cached.games;
    _wlPrices    = cached.prices || {};
    _wlTotal     = _wlGames.length;
    _wlLoaded    = _wlGames.length;
    _wlAllLoaded = true;

    var hltbCache = _hltbLoadCache();
    _wlGames.forEach(function(g) {
      if (g.name && g.name.toLowerCase() in hltbCache) {
        _wlHltb[g.appid] = hltbCache[g.name.toLowerCase()];
        _wlHltbTotal++;
        _wlHltbLoaded++;
      }
    });
    var hltbPending = _wlGames.filter(function(g) { return g.name && !_wlHltb.hasOwnProperty(g.appid); });
    if (hltbPending.length === 0 && _wlHltbTotal > 0) {
      _wlHltbReady = true;
    }

    var revCache = _revLoadCache();
    _wlGames.forEach(function(g) {
      if (g.appid in revCache) {
        _wlReviews[g.appid] = revCache[g.appid];
        _wlReviewsTotal++;
        _wlReviewsLoaded++;
      }
    });
    var revPending = _wlGames.filter(function(g) { return !_wlReviews.hasOwnProperty(g.appid); });
    if (revPending.length === 0 && _wlReviewsTotal > 0) {
      _wlReviewsReady = true;
    }

    var mcCache = _mcLoadCache();
    _wlGames.forEach(function(g) {
      if (g.appid in mcCache) {
        _wlMC[g.appid] = mcCache[g.appid];
        _wlMCTotal++;
        _wlMCLoaded++;
      }
    });
    var mcPending = _wlGames.filter(function(g) { return !_wlMC.hasOwnProperty(g.appid); });
    if (mcPending.length === 0 && _wlMCTotal > 0) {
      _wlMCReady = true;
    }

    document.getElementById('wl-results').style.display = '';
    document.getElementById('wl-search-wrap').style.display = '';
    document.getElementById('wl-progress').style.display = 'none';
    updateSubtitle();
    renderWishlistCards();

    revPending.forEach(function(g) { enqueueReview(g); });
    if (revPending.length === 0) updateReviewsBtn();
    mcPending.forEach(function(g) { enqueueMetacritic(g); });
    if (mcPending.length === 0) updateMCBtn();
    // HLTB
    if (_wlHltbReady) {
      updateDurationBtn();
    } else {
      _checkStartHltb();
    }
    return;
  }

  // Sin caché: fetch normal
  document.getElementById('wl-loading').style.display  = 'flex';

  fetch('/api/wishlist?steamid=' + encodeURIComponent(steamId) +
        '&currency=' + currency + '&lang=' + lang)
    .then(function(r){ return r.json(); })
    .then(function(data) {
      document.getElementById('wl-loading').style.display = 'none';
      document.getElementById('btn-wishlist').disabled    = false;

      if (data.error) {
        document.getElementById('wl-empty').style.display = '';
        document.getElementById('wl-empty').querySelector('p').textContent = '\u26a0\ufe0f ' + data.error;
        return;
      }

      _wlGames = data.games || [];
      _wlTotal = data.total || _wlGames.length;

      if (!_wlGames.length) {
        document.getElementById('wl-empty').style.display = '';
        document.getElementById('wl-empty').querySelector('p').textContent = t('wlEmptyOrPrivate');
        return;
      }

      document.getElementById('wl-results').style.display = '';
      document.getElementById('wl-search-wrap').style.display = '';
      updateSubtitle();
      renderWishlistCards();

      document.getElementById('wl-progress').style.display = '';
      updateProgress(0);
      renderSkeletons(Math.min(_wlGames.length, 20));
      loadWishlistPrices(currency);
    })
    .catch(function(e) {
      document.getElementById('wl-loading').style.display = 'none';
      document.getElementById('btn-wishlist').disabled    = false;
      document.getElementById('wl-empty').style.display   = '';
      document.getElementById('wl-empty').querySelector('p').textContent = '\u26a0\ufe0f ' + t('wlConnError') + e.message;
    });
}


// ── Subtítulo ───────────────────────────────────────────────────
function updateSubtitle() {
  var el = document.getElementById('wl-subtitle');
  if (!el) return;
  var total      = _wlGames.length;
  var conPrecio  = _wlGames.filter(function(g){ var p = _wlPrices[g.appid]; return p && p.best; }).length;

  if (!_wlAllLoaded) {
    var sfxT = _wlTotal > total ? ' (' + t('wlOf') + ' ' + _wlTotal + ' ' + t('wlInWishlist') + ')' : '';
    el.textContent = total + ' ' + t('wlGames') + sfxT + '  \u00b7  ' + conPrecio + ' ' + t('wlWithPrice');
  } else {
    var sfxF = _wlTotal > total ? ' (' + t('wlOf') + ' ' + _wlTotal + ' ' + t('wlInWishlist') + ')' : '';
    el.textContent = conPrecio + ' ' + t('wlGames') + ' ' + t('wlWithPrice') + sfxF;
  }

  // Update deal counter badge on tab
  var dealCount = _wlGames.filter(function(g) {
    var p = _wlPrices[g.appid];
    return p && p.best && p.best.discount > 0;
  }).length;
  var badge = document.getElementById('wl-deal-badge');
  if (badge) {
    badge.textContent = dealCount;
    badge.classList.toggle('zero', dealCount === 0);
  }
}


// ── Carga de precios en dos fases ────────────────────────────────

function loadWishlistPrices(currency) {
  var allAppids = _wlGames.map(function(g) { return g.appid; });
  var BATCH_SIZE = 150;
  var batches = [];
  for (var i = 0; i < allAppids.length; i += BATCH_SIZE) {
    batches.push(allAppids.slice(i, i + BATCH_SIZE));
  }

  var batchesDone = 0;

  // Fase 1: batch de precios ITAD (rápido)
  batches.forEach(function(appidBatch) {
    fetch('/api/wishlist/prices/batch', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ appids: appidBatch, currency: currency })
    })
    .then(function(r) { return r.json(); })
    .then(function(results) {
      results.forEach(function(result) {
        _wlPrices[result.appid] = result;
        var g = _wlGames.find(function(x) { return x.appid === result.appid; });
        if (g && result.name && !g.name) {
          g.name = result.name;
          var nameEl = document.getElementById('wlname-' + result.appid);
          if (nameEl) nameEl.textContent = result.name;
          var ph = document.getElementById('wlcover-placeholder-' + result.appid);
          if (ph) ph.textContent = result.name.charAt(0).toUpperCase();
        }
        _wlLoaded++;
      });
      updateProgress(_wlLoaded);
      updateSubtitle();
      renderWishlistCards();

      batchesDone++;
      if (batchesDone >= batches.length) {
        // Fase 1 completa → iniciar fase 2 (enriquecimiento)
        _enrichWishlistPrices(currency);
      }
    })
    .catch(function() {
      appidBatch.forEach(function(appid) {
        if (!_wlPrices[appid]) {
          _wlPrices[appid] = { appid: appid, best: null };
          _wlLoaded++;
        }
      });
      updateProgress(_wlLoaded);
      batchesDone++;
      if (batchesDone >= batches.length) {
        _enrichWishlistPrices(currency);
      }
    });
  });
}

// Fase 2: Scrape unificado de Steam (precio + reviews + MC + bundles en 1 call)
function _enrichWishlistPrices(currency) {
  var allAppids = _wlGames.filter(function(g) {
    var p = _wlPrices[g.appid];
    return p && p.best;
  }).map(function(g) { return g.appid; });

  if (!allAppids.length) {
    _wlAllLoaded = true;
    document.getElementById('wl-progress').style.display = 'none';
    updateSubtitle();
    _saveWishlistCache();
    renderWishlistCards();
    _onEnrichDone();
    return;
  }

  // La barra de precios sigue visible durante el enriquecimiento

  var CHUNK = 25;
  var chunks = [];
  for (var i = 0; i < allAppids.length; i += CHUNK) {
    chunks.push(allAppids.slice(i, i + CHUNK));
  }

  var chunksDone = 0;
  var totalProcessed = 0;

  function processChunk(idx) {
    if (idx >= chunks.length) return;
    var chunk = chunks[idx];

    fetch('/api/steam-data/batch', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ appids: chunk, currency: currency })
    })
    .then(function(r) { return r.json(); })
    .then(function(results) {
      var revCache = _revLoadCache();
      var mcCache = _mcLoadCache();
      var revCacheChanged = false;
      var mcCacheChanged = false;

      results.forEach(function(data) {
        var appid = data.appid;
        var isError = data.error;

        // Precio: solo reemplazar si Steam es más barato que ITAD
        var existing = _wlPrices[appid];
        if (existing && existing.best) {
          if (data.price && data.price.priceNative < existing.best.priceNative) {
            existing.best = data.price;
          }
          if (data.bundles && data.bundles.length) {
            existing.bundles = data.bundles;
          }
          _wlPrices[appid] = existing;
          updateWishlistCard(appid);
        }

        // Reviews
        if (!isError) {
          var revData = (data.reviews && data.reviews.score !== null)
            ? { score: data.reviews.score, total: data.reviews.total } : null;
          if (!_wlReviews.hasOwnProperty(appid)) {
            _wlReviewsTotal++;
          }
          _wlReviews[appid] = revData;
          _wlReviewsLoaded++;
          revCache[appid] = revData;
          revCacheChanged = true;
          updateReviewsBadge(appid);
        }

        // Metacritic
        if (!isError) {
          var mcData = (data.metacritic && data.metacritic.score !== null)
            ? { score: data.metacritic.score, url: data.metacritic.url } : null;
          if (!_wlMC.hasOwnProperty(appid)) {
            _wlMCTotal++;
          }
          _wlMC[appid] = mcData;
          _wlMCLoaded++;
          mcCache[appid] = mcData;
          mcCacheChanged = true;
        }

        totalProcessed++;
      });

      if (revCacheChanged) _revSaveCache(revCache);
      if (mcCacheChanged) _mcSaveCache(mcCache);

      // Actualizar progreso en la barra de precios
      updateReviewsBtn();
      updateMCBtn();

      chunksDone++;
      if (chunksDone >= chunks.length) {
        _wlAllLoaded = true;
        document.getElementById('wl-progress').style.display = 'none';
        updateSubtitle();
        _saveWishlistCache();
        renderWishlistCards();
        _onEnrichDone();
      } else {
        processChunk(idx + 1);
      }
    })
    .catch(function() {
      chunksDone++;
      if (chunksDone >= chunks.length) {
        _wlAllLoaded = true;
        document.getElementById('wl-progress').style.display = 'none';
        _saveWishlistCache();
        _onEnrichDone();
      } else {
        processChunk(idx + 1);
      }
    });
  }

  processChunk(0);
}

// Después del scrape unificado: marcar reviews + MC como ready, arrancar HLTB
function _onEnrichDone() {
  if (!_wlReviewsReady && _wlReviewsTotal > 0 && _wlReviewsLoaded >= _wlReviewsTotal) {
    _wlReviewsReady = true;
    updateReviewsBtn();
    renderWishlistCards();
  }
  if (!_wlMCReady && _wlMCTotal > 0 && _wlMCLoaded >= _wlMCTotal) {
    _wlMCReady = true;
    updateMCBtn();
  }
  _checkStartHltb();
}

var _hltbStarted = false;

function _checkStartHltb() {
  if (_hltbStarted) return;
  if (!_wlReviewsReady || !_wlMCReady) return;
  _hltbStarted = true;
  _loadHltbData();
}

function _loadHltbData() {
  var games = _wlGames.filter(function(g) { return g.name; });
  games.forEach(function(g) {
    enqueueHltb(g);
  });
  // Solo mostrar barra si hay datos pendientes por cargar
  if (!_wlHltbReady) {
    var hltbProg = document.getElementById('wl-duration-progress');
    if (hltbProg) hltbProg.style.display = '';
  }
}

function updateProgress(n) {
  var total = _wlGames.length;
  var pct   = total > 0 ? Math.round((n / total) * 100) : 0;
  document.getElementById('wl-progress-fill').style.width = pct + '%';
  document.getElementById('wl-progress-text').textContent = t('wlLoadingPrices') + ' ' + n + ' / ' + total;
}


// ── Ordenado ────────────────────────────────────────────────────
function getSortedGames() {
  var withPrice    = [];
  var pending      = [];
  var withoutPrice = [];

  var query = _wlSearchQuery.toLowerCase();
  _wlGames.forEach(function(g) {
    if (query && g.name && g.name.toLowerCase().indexOf(query) === -1) return;
    var p = _wlPrices[g.appid];
    if (p === undefined)       pending.push(g);
    else if (p && p.best)      withPrice.push(g);
    else                       withoutPrice.push(g);
  });

  if (_wlSortMode === 'discount') {
    withPrice.sort(function(a, b) {
      return _wlPrices[b.appid].best.discount - _wlPrices[a.appid].best.discount;
    });
  } else if (_wlSortMode === 'price') {
    withPrice.sort(function(a, b) {
      return _wlPrices[a.appid].best.priceNative - _wlPrices[b.appid].best.priceNative;
    });
  } else if (_wlSortMode === 'duration-asc' || _wlSortMode === 'duration-desc') {
    var dir = _wlSortMode === 'duration-asc' ? 1 : -1;
    withPrice.sort(function(a, b) {
      var ha = _wlHltb[a.appid] || 99999;
      var hb = _wlHltb[b.appid] || 99999;
      return dir * (ha - hb);
    });
  } else if (_wlSortMode === 'reviews-desc' || _wlSortMode === 'reviews-asc') {
    var dir = _wlSortMode === 'reviews-desc' ? -1 : 1;
    withPrice.sort(function(a, b) {
      var ra = (_wlReviews[a.appid] && _wlReviews[a.appid].score) || -1;
      var rb = (_wlReviews[b.appid] && _wlReviews[b.appid].score) || -1;
      return dir * (ra - rb);
    });
  } else if (_wlSortMode === 'mc-desc' || _wlSortMode === 'mc-asc') {
    var dir = _wlSortMode === 'mc-desc' ? -1 : 1;
    withPrice.sort(function(a, b) {
      var ma = (_wlMC[a.appid] && _wlMC[a.appid].score) || -1;
      var mb = (_wlMC[b.appid] && _wlMC[b.appid].score) || -1;
      return dir * (ma - mb);
    });
  } else {
    withPrice.sort(function(a, b){ return a.name.localeCompare(b.name); });
    pending.sort(function(a, b){ return a.name.localeCompare(b.name); });
  }

  if (_wlAllLoaded) return withPrice;
  return withPrice.concat(pending);
}

function sortWishlist(mode) {
  if (mode === 'duration') {
    if (!_wlHltbReady) return;
    if (_wlSortMode === 'duration-asc') {
      mode = 'duration-desc';
    } else {
      mode = 'duration-asc';
    }
  }
  if (mode === 'reviews') {
    if (!_wlReviewsReady) return;
    if (_wlSortMode === 'reviews-desc') {
      mode = 'reviews-asc';
    } else {
      mode = 'reviews-desc';
    }
  }
  if (mode === 'metacritic') {
    if (!_wlMCReady) return;
    if (_wlSortMode === 'mc-desc') {
      mode = 'mc-asc';
    } else {
      mode = 'mc-desc';
    }
  }

  _wlSortMode  = mode;
  _wlPage      = 1;

  var isDuration = (mode === 'duration-asc' || mode === 'duration-desc');
  var isReviews  = (mode === 'reviews-desc' || mode === 'reviews-asc');
  var isMC       = (mode === 'mc-desc' || mode === 'mc-asc');

  ['discount','price','name'].forEach(function(m) {
    var btn = document.getElementById('wsort-' + m);
    if (btn) btn.classList.toggle('active', m === mode);
  });
  var durBtn = document.getElementById('wsort-duration');
  if (durBtn) {
    durBtn.classList.toggle('active', isDuration);
    durBtn.textContent = isDuration
      ? (mode === 'duration-asc' ? t('sortDurationAsc') : t('sortDurationDesc'))
      : t('sortDuration');
    durBtn.disabled = false;
  }
  var revBtn = document.getElementById('wsort-reviews');
  if (revBtn) {
    revBtn.classList.toggle('active', isReviews);
    revBtn.textContent = isReviews
      ? (mode === 'reviews-desc' ? t('sortReviewsBest') : t('sortReviewsWorst'))
      : t('sortSteamReviews');
    revBtn.disabled = false;
  }
  var mcBtn = document.getElementById('wsort-metacritic');
  if (mcBtn) {
    mcBtn.classList.toggle('active', isMC);
    mcBtn.textContent = isMC
      ? (mode === 'mc-desc' ? t('sortMCBest') : t('sortMCWorst'))
      : t('sortMC');
    mcBtn.disabled = false;
  }
  renderWishlistCards();
}


function renderSkeletons(count) {
  var grid = document.getElementById('wl-grid');
  grid.innerHTML = '';
  for (var i = 0; i < count; i++) {
    var skel = document.createElement('div');
    skel.className = 'wl-skeleton';
    skel.style.animationDelay = Math.min(i * 30, 300) + 'ms';
    skel.innerHTML = '<div class="wl-skeleton-cover"></div><div class="wl-skeleton-body"><div class="wl-skeleton-line medium"></div><div class="wl-skeleton-line short"></div><div class="wl-skeleton-line price"></div></div>';
    grid.appendChild(skel);
  }
}

// ── Render con paginación ───────────────────────────────────────
function renderWishlistCards() {
  var grid   = document.getElementById('wl-grid');
  var sorted = getSortedGames();
  var total  = sorted.length;
  var start  = (_wlPage - 1) * _wlPerPage;
  var end    = Math.min(start + _wlPerPage, total);
  var page   = sorted.slice(start, end);

  grid.innerHTML = '';
  page.forEach(function(game, i) {
    grid.appendChild(buildWishlistCard(game, i));
  });

  renderPagination(total);
}


// ── Paginación ──────────────────────────────────────────────────
function renderPagination(totalGames) {
  var container  = document.getElementById('wl-pagination');
  var totalPages = Math.ceil(totalGames / _wlPerPage);

  if (totalPages <= 1) { container.style.display = 'none'; return; }

  container.style.display = 'flex';
  container.innerHTML = '';

  var prev = document.createElement('button');
  prev.className = 'wl-page-btn' + (_wlPage === 1 ? ' disabled' : '');
  prev.textContent = t('pagePrev');
  prev.disabled = _wlPage === 1;
  prev.onclick = function() { goToPage(_wlPage - 1); };
  container.appendChild(prev);

  getPageNumbers(_wlPage, totalPages).forEach(function(p) {
    if (p === '...') {
      var dots = document.createElement('span');
      dots.className = 'wl-page-dots';
      dots.textContent = '\u2026';
      container.appendChild(dots);
    } else {
      var btn = document.createElement('button');
      btn.className = 'wl-page-btn' + (p === _wlPage ? ' active' : '');
      btn.textContent = p;
      btn.onclick = (function(pg){ return function(){ goToPage(pg); }; })(p);
      container.appendChild(btn);
    }
  });

  var nxt = document.createElement('button');
  nxt.className = 'wl-page-btn' + (_wlPage === totalPages ? ' disabled' : '');
  nxt.textContent = t('pageNext');
  nxt.disabled = _wlPage === totalPages;
  nxt.onclick = function() { goToPage(_wlPage + 1); };
  container.appendChild(nxt);
}

function getPageNumbers(current, total) {
  if (total <= 7) {
    var arr = []; for (var i = 1; i <= total; i++) arr.push(i); return arr;
  }
  var set = {};
  [1, total, current, current - 1, current + 1].forEach(function(p) {
    if (p >= 1 && p <= total) set[p] = true;
  });
  var pages = Object.keys(set).map(Number).sort(function(a,b){ return a-b; });
  var result = [];
  for (var j = 0; j < pages.length; j++) {
    if (j > 0 && pages[j] - pages[j-1] > 1) result.push('...');
    result.push(pages[j]);
  }
  return result;
}

function goToPage(page) {
  _wlPage = page;
  renderWishlistCards();
  var el = document.getElementById('wl-results');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setPerPage(n) {
  _wlPerPage = n;
  _wlPage    = 1;
  [20, 40, 60].forEach(function(v) {
    var btn = document.getElementById('wpp-' + v);
    if (btn) btn.classList.toggle('active', v === n);
  });
  renderWishlistCards();
}


// ── Construir card ──────────────────────────────────────────────
function buildWishlistCard(game, animIdx) {
  var priceData   = _wlPrices[game.appid];
  var hasDiscount = priceData && priceData.best && priceData.best.discount > 0;
  var card = document.createElement('div');
  card.className = 'wl-card' + (hasDiscount ? ' has-deal' : '');
  card.id = 'wlcard-' + game.appid;
  card.style.animationDelay = Math.min(animIdx * 30, 300) + 'ms';

  var img = document.createElement('img');
  img.className = 'wl-card-cover';
  img.alt = game.name;
  img._fallbacks = [game.coverMedium, game.coverSmall].filter(Boolean);
  img.onerror = function() {
    if (this._fallbacks && this._fallbacks.length) {
      this.src = this._fallbacks.shift();
    } else {
      var placeholder = document.createElement('div');
      placeholder.className = 'wl-card-cover wl-cover-placeholder';
      placeholder.id = 'wlcover-placeholder-' + game.appid;
      placeholder.textContent = game.name ? game.name.charAt(0).toUpperCase() : '?';
      card.insertBefore(placeholder, card.firstChild);
      this.remove();
    }
  };
  img.src = game.cover;
  card.appendChild(img);

  var body = document.createElement('div');
  body.className = 'wl-card-body';

  var nameEl = document.createElement('div');
  nameEl.className = 'wl-card-name';
  nameEl.id = 'wlname-' + game.appid;
  nameEl.textContent = game.name;
  body.appendChild(nameEl);

  var priceEl = document.createElement('div');
  priceEl.id = 'wlprice-' + game.appid;
  priceEl.appendChild(buildPriceContent(game, priceData));
  body.appendChild(priceEl);

  card.appendChild(body);

  // HLTB badge
  var hltbBadge = document.createElement('div');
  hltbBadge.className = 'wl-hltb-badge';
  hltbBadge.id = 'wlhltb-' + game.appid;
  var h = _wlHltb[game.appid];
  if (h && h > 0) {
    hltbBadge.textContent = '\ud83d\udd50 ' + fmtHours(h);
  } else if (_wlHltbReady) {
    hltbBadge.textContent = t('hltbNoData');
    hltbBadge.style.opacity = '0.4';
  } else {
    hltbBadge.style.display = 'none';
  }
  card.appendChild(hltbBadge);

  // Reviews badge (Steam) — visible por defecto
  var showMC = (_wlSortMode === 'mc-desc' || _wlSortMode === 'mc-asc');

  var revBadge = document.createElement('div');
  revBadge.className = 'wl-rev-badge';
  revBadge.id = 'wlrev-' + game.appid;
  var revData = _wlReviews[game.appid];
  if (showMC) {
    revBadge.style.display = 'none';
  } else if (revData && revData.score !== null) {
    revBadge.textContent = '\u2b50 ' + revData.score + '%';
    revBadge.style.borderColor = reviewScoreColor(revData.score);
  } else if (_wlReviewsReady) {
    revBadge.textContent = '\u2b50 N/A';
    revBadge.style.opacity = '0.4';
  } else {
    revBadge.style.display = 'none';
  }
  card.appendChild(revBadge);

  // Metacritic badge — solo visible cuando se ordena por MC
  var mcBadge = document.createElement('div');
  mcBadge.className = 'wl-mc-badge';
  mcBadge.id = 'wlmc-' + game.appid;
  var mcData = _wlMC[game.appid];
  if (!showMC) {
    mcBadge.style.display = 'none';
  } else if (mcData && mcData.score !== null) {
    mcBadge.textContent = 'MC ' + mcData.score;
    mcBadge.style.borderColor = mcScoreColor(mcData.score);
  } else if (_wlMCReady) {
    mcBadge.textContent = 'MC N/A';
    mcBadge.style.opacity = '0.4';
  } else {
    mcBadge.style.display = 'none';
  }
  card.appendChild(mcBadge);

  card.addEventListener('click', function(e) {
    if (e.target.tagName === 'A') return;
    switchTab('search');
    document.getElementById('search-input').value = game.name;
    fetchPrices(game.appid, game.name);
  });

  return card;
}

function buildPriceContent(game, priceData) {
  var frag = document.createDocumentFragment();

  if (priceData === undefined) {
    var loading = document.createElement('div');
    loading.className = 'wl-card-loading';
    var spinner = document.createElement('div');
    spinner.className = 'mini-spinner';
    var txt = document.createElement('span');
    txt.textContent = t('cardLoading');
    loading.appendChild(spinner);
    loading.appendChild(txt);
    frag.appendChild(loading);
    return frag;
  }

  if (!priceData || !priceData.best) {
    var noPrice = document.createElement('div');
    noPrice.className = 'wl-no-price';
    noPrice.textContent = t('cardNoPrice');
    frag.appendChild(noPrice);
    return frag;
  }

  var best     = priceData.best;
  var currency = document.getElementById('sel-currency').value;

  var storeEl = document.createElement('div');
  storeEl.className = 'wl-best-store';
  storeEl.textContent = best.storeName;
  frag.appendChild(storeEl);

  var priceEl = document.createElement('div');
  priceEl.className = 'wl-best-price';
  priceEl.textContent = fmtPrice(best.priceNative) + ' ' + currency;
  frag.appendChild(priceEl);

  if (best.discount > 0) {
    var row  = document.createElement('div');
    row.className = 'wl-best-row';
    var disc = document.createElement('span');
    disc.className = 'wl-discount';
    disc.textContent = '-' + best.discount + '%';
    var orig = document.createElement('span');
    orig.className = 'wl-original';
    orig.textContent = fmtPrice(best.originalNative) + ' ' + currency;
    row.appendChild(disc);
    row.appendChild(orig);
    frag.appendChild(row);
  }

  if (priceData.allCount > 1) {
    var count = document.createElement('div');
    count.className = 'wl-stores-count';
    count.textContent = priceData.allCount + ' ' + t('storesFound');
    frag.appendChild(count);
  }

  // Precio histórico más bajo de la tienda ganadora (mostrar si es <= precio actual)
  if (best.storeLowNative && best.storeLowNative > 0 && best.storeLowNative <= best.priceNative) {
    var histEl = document.createElement('div');
    histEl.className = 'wl-history-low';
    histEl.textContent = '\ud83d\udcc9 ' + t('historicLow') + ' ' + best.storeName + ': ' + fmtPrice(best.storeLowNative) + ' ' + currency;
    frag.appendChild(histEl);
  }

  // Bundles
  if (priceData.bundles && priceData.bundles.length > 0) {
    priceData.bundles.forEach(function(b) {
      var bundleWrap = document.createElement('div');
      bundleWrap.className = 'wl-bundle-row';

      var bundleIcon = document.createElement('span');
      bundleIcon.textContent = '\ud83c\udf81';

      var bundleLink = document.createElement('a');
      bundleLink.className = 'wl-bundle-link';
      bundleLink.href = b.url;
      bundleLink.target = '_blank';
      bundleLink.addEventListener('click', function(e){ e.stopPropagation(); });

      var isSteam = (b.storeName || '').toLowerCase() === 'steam';
      if (isSteam) {
        // Steam: solo link informativo, sin precio (depende de lo que el usuario ya tenga)
        var text = b.title || t('bundleSteam');
        if (b.gamesCount > 1) text += ' (' + b.gamesCount + ' ' + t('bundleGames') + ')';
        text += ' \u2192 ' + t('see');
        bundleLink.textContent = text;
      } else {
        // Otras tiendas: mostrar precio
        var bundlePrice = fmtPrice(b.priceNative) + ' ' + currency;
        var storeName = b.storeName || 'Bundle';
        var text = t('bundleIn') + ' ' + storeName + ': ' + bundlePrice;
        if (b.gamesCount > 1) text += ' (' + b.gamesCount + ' ' + t('bundleGames') + ')';
        bundleLink.textContent = text;
      }

      bundleWrap.appendChild(bundleIcon);
      bundleWrap.appendChild(bundleLink);
      frag.appendChild(bundleWrap);
    });
  }

  var btn = document.createElement('a');
  btn.className = 'wl-card-btn';
  btn.href = best.url;
  btn.target = '_blank';
  btn.textContent = t('goTo') + ' ' + best.storeName + ' \u2192';
  btn.addEventListener('click', function(e){ e.stopPropagation(); });
  frag.appendChild(btn);

  return frag;
}

// ── Actualizar card individual ──────────────────────────────────
function updateWishlistCard(appid) {
  var priceEl = document.getElementById('wlprice-' + appid);
  if (!priceEl) return;

  var game = _wlGames.find(function(g){ return g.appid === appid; });
  if (!game) return;

  var priceData = _wlPrices[appid];

  while (priceEl.firstChild) priceEl.removeChild(priceEl.firstChild);
  priceEl.appendChild(buildPriceContent(game, priceData));

  var card = document.getElementById('wlcard-' + appid);
  if (card && priceData && priceData.best && priceData.best.discount > 0) {
    card.classList.add('has-deal');
  }
}


// ── Búsqueda en wishlist ─────────────────────────────────────────
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    var input = document.getElementById('wl-search');
    var clearBtn = document.getElementById('wl-search-clear');
    if (!input || !clearBtn) return;

    input.addEventListener('input', function() {
      _wlSearchQuery = input.value.trim();
      _wlPage = 1;
      clearBtn.style.display = _wlSearchQuery ? 'flex' : 'none';
      renderWishlistCards();
    });

    clearBtn.addEventListener('click', function() {
      input.value = '';
      _wlSearchQuery = '';
      _wlPage = 1;
      clearBtn.style.display = 'none';
      renderWishlistCards();
      input.focus();
    });
  });
})();
