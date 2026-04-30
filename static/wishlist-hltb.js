// wishlist-hltb.js — Cola HLTB batch, caché localStorage, badges de duración

var _wlHltb       = {};
var _wlHltbReady  = false;
var _wlHltbTotal  = 0;
var _wlHltbLoaded = 0;

var _hltbQueue        = [];
var _hltbRunning      = 0;
var _hltbAbort        = null;
var _hltbBatchTimer   = null;
var HLTB_CONCURRENCY  = 10;
var HLTB_LS_KEY       = 'newgamesave_hltb_v1';

function cancelHltb() {
  _hltbQueue = [];
  _hltbRunning = 0;
  if (_hltbBatchTimer) { clearTimeout(_hltbBatchTimer); _hltbBatchTimer = null; }
  if (_hltbAbort) { _hltbAbort.abort(); }
  _hltbAbort = new AbortController();
}

function _hltbLoadCache() {
  try {
    var raw = localStorage.getItem(HLTB_LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function _hltbSaveCache(cache) {
  try { localStorage.setItem(HLTB_LS_KEY, JSON.stringify(cache)); } catch(e) {}
}

function enqueueHltb(game) {
  if (!game || !game.name) return;
  if (_wlHltb.hasOwnProperty(game.appid)) return;

  var cache = _hltbLoadCache();
  var cacheKey = game.name.toLowerCase();
  if (cacheKey in cache) {
    _wlHltb[game.appid] = cache[cacheKey];
    _wlHltbTotal++;
    _wlHltbLoaded++;
    updateDurationBtn();
    _hltbCheckDone();
    return;
  }

  _wlHltb[game.appid] = undefined;
  _wlHltbTotal++;
  _hltbQueue.push(game);
  updateDurationBtn();

  if (_hltbBatchTimer) clearTimeout(_hltbBatchTimer);
  _hltbBatchTimer = setTimeout(_hltbFlushAll, 400);
}

function _updateHltbProgress() {
  var wrap = document.getElementById('wl-duration-progress');
  var fill = document.getElementById('wl-duration-progress-fill');
  var text = document.getElementById('wl-duration-progress-text');
  if (!wrap || !fill || !text) return;
  if (_wlHltbTotal === 0) return;
  if (_wlHltbReady) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  var pct = Math.round((_wlHltbLoaded / _wlHltbTotal) * 100);
  fill.style.width = pct + '%';
  text.textContent = t('wlLoadingDuration') + ' ' + _wlHltbLoaded + ' / ' + _wlHltbTotal;
}

function _hltbCheckDone() {
  if (_hltbQueue.length === 0 && _hltbRunning === 0 && _wlHltbLoaded >= _wlHltbTotal && _wlHltbTotal > 0) {
    _wlHltbReady = true;
    var hltbProg = document.getElementById('wl-duration-progress');
    if (hltbProg) hltbProg.style.display = 'none';
    updateDurationBtn();
    renderWishlistCards();
  }
}

var _HLTB_CHUNK = 10;
var _HLTB_MAX_PARALLEL = 3;

function _hltbFlushAll() {
  _hltbBatchTimer = null;
  if (!_hltbQueue.length) return;

  var all = _hltbQueue.splice(0);
  var chunks = [];
  for (var i = 0; i < all.length; i += _HLTB_CHUNK) {
    chunks.push(all.slice(i, i + _HLTB_CHUNK));
  }

  var idx = 0;
  function nextChunk() {
    if (idx >= chunks.length) return;
    if (_hltbRunning >= _HLTB_MAX_PARALLEL) return;
    var chunk = chunks[idx++];
    var games = chunk.map(function(g) { return { appid: g.appid, name: g.name }; });
    _hltbRunning++;

    if (!_hltbAbort) _hltbAbort = new AbortController();
    fetch('/api/hltb/batch', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ games: games }),
      signal: _hltbAbort.signal
    })
    .then(function(r) { return r.json(); })
    .then(function(results) {
      var cache = _hltbLoadCache();
      results.forEach(function(result) {
        var hours = (result.main && result.main > 0) ? result.main : null;
        _wlHltb[result.appid] = hours;
        _wlHltbLoaded++;
        if (result.name) {
          cache[result.name.toLowerCase()] = hours;
        }
        updateHltbBadge(result.appid);
      });
      _hltbSaveCache(cache);
      _hltbRunning--;
      updateDurationBtn();
      _hltbCheckDone();
      nextChunk();
    })
    .catch(function() {
      chunk.forEach(function() { _wlHltbLoaded++; });
      _hltbRunning--;
      updateDurationBtn();
      _hltbCheckDone();
      nextChunk();
    });

    nextChunk();
  }
  nextChunk();
}

function loadHltbData() {}  // compatibility stub

function fmtHours(h) {
  if (!h || h <= 0) return null;
  if (h < 1)  return Math.round(h * 60) + 'm';
  if (h % 1 === 0) return h + 'h';
  return Math.floor(h) + 'h ' + Math.round((h % 1) * 60) + 'm';
}

function updateHltbBadge(appid) {
  var badge = document.getElementById('wlhltb-' + appid);
  if (!badge) return;
  var h = _wlHltb[appid];
  if (h && h > 0) {
    badge.textContent = '\ud83d\udd50 ' + fmtHours(h);
    badge.style.display = '';
    badge.style.opacity = '';
  } else if (_wlHltbReady) {
    badge.textContent = t('hltbNoData');
    badge.style.display = '';
    badge.style.opacity = '0.4';
  } else {
    badge.style.display = 'none';
  }
}

function updateDurationBtn() {
  var btn = document.getElementById('wsort-duration');
  if (!btn) return;
  if (_wlHltbReady) {
    btn.disabled = false;
    btn.title = '';
    var isDur = (_wlSortMode === 'duration-asc' || _wlSortMode === 'duration-desc');
    if (!isDur) btn.textContent = t('sortDuration');
  } else {
    btn.disabled = true;
    var pct = _wlHltbTotal > 0 ? Math.round((_wlHltbLoaded / _wlHltbTotal) * 100) : 0;
    btn.textContent = t('sortDuration') + ' (' + pct + '%)';
    btn.title = t('sortDurationLoading');
  }
  _updateHltbProgress();
}
