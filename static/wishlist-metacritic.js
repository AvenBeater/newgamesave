// wishlist-metacritic.js — Metacritic batch (via Steam), cache localStorage, badges

var _wlMC       = {};
var _wlMCReady  = false;
var _wlMCTotal  = 0;
var _wlMCLoaded = 0;

var _mcQueue       = [];
var _mcRunning     = 0;
var _mcAbort       = null;
var _mcBatchTimer  = null;
var MC_CONCURRENCY = 10;
var MC_LS_KEY      = 'newgamesave_metacritic_v1';

function cancelMetacritic() {
  _mcQueue = [];
  _mcRunning = 0;
  if (_mcBatchTimer) { clearTimeout(_mcBatchTimer); _mcBatchTimer = null; }
  if (_mcAbort) { _mcAbort.abort(); }
  _mcAbort = new AbortController();
}

function _mcLoadCache() {
  try {
    var raw = localStorage.getItem(MC_LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function _mcSaveCache(cache) {
  try { localStorage.setItem(MC_LS_KEY, JSON.stringify(cache)); } catch(e) {}
}

function enqueueMetacritic(game) {
  if (!game || !game.appid) return;
  if (_wlMC.hasOwnProperty(game.appid)) return;

  var cache = _mcLoadCache();
  if (game.appid in cache) {
    _wlMC[game.appid] = cache[game.appid];
    _wlMCTotal++;
    _wlMCLoaded++;
    updateMCBtn();
    _mcCheckDone();
    return;
  }

  _wlMC[game.appid] = undefined;
  _wlMCTotal++;
  _mcQueue.push(game);
  updateMCBtn();

  if (_mcBatchTimer) clearTimeout(_mcBatchTimer);
  _mcBatchTimer = setTimeout(_mcFlushAll, 300);
}

function _mcCheckDone() {
  if (_mcQueue.length === 0 && _mcRunning === 0 && _wlMCLoaded >= _wlMCTotal && _wlMCTotal > 0) {
    _wlMCReady = true;
    updateMCBtn();
    renderWishlistCards();
    _checkStartHltb();
  }
}

var _MC_CHUNK = 25;
var _MC_MAX_PARALLEL = 3;

function _mcFlushAll() {
  _mcBatchTimer = null;
  if (!_mcQueue.length) return;

  var all = _mcQueue.splice(0);
  var chunks = [];
  for (var i = 0; i < all.length; i += _MC_CHUNK) {
    chunks.push(all.slice(i, i + _MC_CHUNK));
  }

  var idx = 0;
  function nextChunk() {
    if (idx >= chunks.length) return;
    if (_mcRunning >= _MC_MAX_PARALLEL) return;
    var chunk = chunks[idx++];
    var appids = chunk.map(function(g) { return g.appid; });
    _mcRunning++;

    if (!_mcAbort) _mcAbort = new AbortController();
    fetch('/api/metacritic/batch', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ appids: appids }),
      signal: _mcAbort.signal
    })
    .then(function(r) { return r.json(); })
    .then(function(results) {
      var cache = _mcLoadCache();
      var cacheChanged = false;
      results.forEach(function(result) {
        var isError = result.error;
        var data = (result.score !== null) ? { score: result.score, url: result.url } : null;
        _wlMC[result.appid] = data;
        _wlMCLoaded++;
        if (!isError) {
          cache[result.appid] = data;
          cacheChanged = true;
        }
        updateMCBadge(result.appid);
      });
      if (cacheChanged) _mcSaveCache(cache);
      _mcRunning--;
      updateMCBtn();
      _mcCheckDone();
      nextChunk();
    })
    .catch(function() {
      chunk.forEach(function() { _wlMCLoaded++; });
      _mcRunning--;
      updateMCBtn();
      _mcCheckDone();
      nextChunk();
    });

    nextChunk();
  }
  nextChunk();
}

function mcScoreColor(score) {
  if (score >= 75) return '#6c3';
  if (score >= 50) return '#fc3';
  return '#f00';
}

function updateMCBadge(appid) {
  var badge = document.getElementById('wlmc-' + appid);
  if (!badge) return;
  var showMC = (_wlSortMode === 'mc-desc' || _wlSortMode === 'mc-asc');
  if (!showMC) {
    badge.style.display = 'none';
    return;
  }
  var data = _wlMC[appid];
  if (data && data.score !== null) {
    badge.textContent = 'MC ' + data.score;
    badge.style.display = '';
    badge.style.opacity = '';
    badge.style.borderColor = mcScoreColor(data.score);
  } else if (_wlMCReady) {
    badge.textContent = 'MC N/A';
    badge.style.display = '';
    badge.style.opacity = '0.4';
    badge.style.borderColor = 'transparent';
  } else {
    badge.style.display = 'none';
  }
}

function updateMCBtn() {
  var btn = document.getElementById('wsort-metacritic');
  if (!btn) return;
  if (_wlMCReady) {
    btn.disabled = false;
    btn.title = '';
    var isMC = (_wlSortMode === 'mc-desc' || _wlSortMode === 'mc-asc');
    if (!isMC) btn.textContent = t('sortMC');
  } else {
    btn.disabled = true;
    var pct = _wlMCTotal > 0 ? Math.round((_wlMCLoaded / _wlMCTotal) * 100) : 0;
    btn.textContent = t('sortMC') + ' (' + pct + '%)';
    btn.title = t('sortMCLoading');
  }
}
