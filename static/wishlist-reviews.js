// wishlist-reviews.js — Steam Reviews batch, cache localStorage, badges

var _wlReviews       = {};
var _wlReviewsReady  = false;
var _wlReviewsTotal  = 0;
var _wlReviewsLoaded = 0;

var _revQueue       = [];
var _revRunning     = 0;
var _revAbort       = null;
var _revBatchTimer  = null;
var REV_CONCURRENCY = 10;
var REV_LS_KEY      = 'gamewise_reviews_v1';

function cancelReviews() {
  _revQueue = [];
  _revRunning = 0;
  if (_revBatchTimer) { clearTimeout(_revBatchTimer); _revBatchTimer = null; }
  if (_revAbort) { _revAbort.abort(); }
  _revAbort = new AbortController();
}

function _revLoadCache() {
  try {
    var raw = localStorage.getItem(REV_LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function _revSaveCache(cache) {
  try { localStorage.setItem(REV_LS_KEY, JSON.stringify(cache)); } catch(e) {}
}

function enqueueReview(game) {
  if (!game || !game.appid) return;
  if (_wlReviews.hasOwnProperty(game.appid)) return;

  var cache = _revLoadCache();
  if (game.appid in cache) {
    _wlReviews[game.appid] = cache[game.appid];
    _wlReviewsTotal++;
    _wlReviewsLoaded++;
    updateReviewsBtn();
    _revCheckDone();
    return;
  }

  _wlReviews[game.appid] = undefined;
  _wlReviewsTotal++;
  _revQueue.push(game);
  updateReviewsBtn();

  // Debounce: esperar 300ms a que se acumulen más juegos, luego disparar mini-batches
  if (_revBatchTimer) clearTimeout(_revBatchTimer);
  _revBatchTimer = setTimeout(_revFlushAll, 300);
}

function _updateRevProgress() {
  var wrap = document.getElementById('wl-reviews-progress');
  var fill = document.getElementById('wl-reviews-progress-fill');
  var text = document.getElementById('wl-reviews-progress-text');
  if (!wrap || !fill || !text) return;
  if (_wlReviewsTotal === 0) return;
  if (_wlReviewsReady) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  var pct = Math.round((_wlReviewsLoaded / _wlReviewsTotal) * 100);
  fill.style.width = pct + '%';
  text.textContent = t('wlLoadingReviews') + ' ' + _wlReviewsLoaded + ' / ' + _wlReviewsTotal;
}

function _revCheckDone() {
  if (_revQueue.length === 0 && _revRunning === 0 && _wlReviewsLoaded >= _wlReviewsTotal && _wlReviewsTotal > 0) {
    _wlReviewsReady = true;
    var revProg = document.getElementById('wl-reviews-progress');
    if (revProg) revProg.style.display = 'none';
    updateReviewsBtn();
    renderWishlistCards();
    _checkStartHltb();
  }
}

var _REV_CHUNK = 25;
var _REV_MAX_PARALLEL = 3;

function _revFlushAll() {
  _revBatchTimer = null;
  if (!_revQueue.length) return;

  var all = _revQueue.splice(0);
  var chunks = [];
  for (var i = 0; i < all.length; i += _REV_CHUNK) {
    chunks.push(all.slice(i, i + _REV_CHUNK));
  }

  var idx = 0;
  function nextChunk() {
    if (idx >= chunks.length) return;
    if (_revRunning >= _REV_MAX_PARALLEL) return;
    var chunk = chunks[idx++];
    var appids = chunk.map(function(g) { return g.appid; });
    _revRunning++;

    if (!_revAbort) _revAbort = new AbortController();
    fetch('/api/steam-reviews/batch', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ appids: appids }),
      signal: _revAbort.signal
    })
    .then(function(r) { return r.json(); })
    .then(function(results) {
      var cache = _revLoadCache();
      var cacheChanged = false;
      results.forEach(function(result) {
        var isError = (result.total === -1);
        var data = (result.score !== null) ? { score: result.score, total: result.total } : null;
        _wlReviews[result.appid] = data;
        _wlReviewsLoaded++;
        if (!isError) {
          cache[result.appid] = data;
          cacheChanged = true;
        }
        updateReviewsBadge(result.appid);
      });
      if (cacheChanged) _revSaveCache(cache);
      _revRunning--;
      updateReviewsBtn();
      _revCheckDone();
      nextChunk();
    })
    .catch(function() {
      chunk.forEach(function() { _wlReviewsLoaded++; });
      _revRunning--;
      updateReviewsBtn();
      _revCheckDone();
      nextChunk();
    });

    nextChunk();
  }
  nextChunk();
}

function fmtReviewScore(data) {
  if (!data || data.score === null || data.score === undefined) return null;
  return data.score + '%';
}

function reviewScoreColor(score) {
  if (score >= 80) return '#66c0f4';
  if (score >= 70) return '#a8db5e';
  if (score >= 50) return '#ffc82c';
  return '#c35c2c';
}

function updateReviewsBadge(appid) {
  var badge = document.getElementById('wlrev-' + appid);
  if (!badge) return;
  var data = _wlReviews[appid];
  if (data && data.score !== null) {
    badge.textContent = '\u2b50 ' + data.score + '%';
    badge.style.display = '';
    badge.style.opacity = '';
    badge.style.borderColor = reviewScoreColor(data.score);
  } else if (_wlReviewsReady) {
    badge.textContent = '\u2b50 N/A';
    badge.style.display = '';
    badge.style.opacity = '0.4';
    badge.style.borderColor = 'transparent';
  } else {
    badge.style.display = 'none';
  }
}

function updateReviewsBtn() {
  var btn = document.getElementById('wsort-reviews');
  if (!btn) return;
  if (_wlReviewsReady) {
    btn.disabled = false;
    btn.title = '';
    var isRev = (_wlSortMode === 'reviews-desc' || _wlSortMode === 'reviews-asc');
    if (!isRev) btn.textContent = t('sortSteamReviews');
  } else {
    btn.disabled = true;
    var pct = _wlReviewsTotal > 0 ? Math.round((_wlReviewsLoaded / _wlReviewsTotal) * 100) : 0;
    btn.textContent = t('sortSteamReviews') + ' (' + pct + '%)';
    btn.title = t('sortReviewsLoading');
  }
  _updateRevProgress();
}
