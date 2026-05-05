// media.js — Panel de media (screenshots y videos)

// ── Estado del media player ─────────────────────────────────────
var _mediaItems = [];
var _mediaIdx   = 0;
var _mediaViewerHls = null;
var _mediaTheaterKeyHandler = null;
var _mediaTheaterHls = null;
var _mediaTheaterReturnFocus = null;
var _mediaFullscreenEventsBound = false;

function _isVideoMedia(item){
  return item && (item.type === 'video' || item.type === 'hls');
}

function _mediaText(key, fallback){
  return (typeof t === 'function') ? t(key) : fallback;
}

function _requestFullscreen(el){
  if(!el) return;
  var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if(!fn) return;
  try {
    var result = fn.call(el);
    return result && typeof result.then === 'function' ? result : Promise.resolve();
  } catch(e) {
    return Promise.resolve();
  }
}

function _fullscreenElement(){
  return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
}

function _exitFullscreen(){
  var fn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  if(!fn) return Promise.resolve();
  try {
    var result = fn.call(document);
    return result && typeof result.then === 'function' ? result : Promise.resolve();
  } catch(e) {
    return Promise.resolve();
  }
}

function _syncFullscreenButtons(){
  var active = !!_fullscreenElement();
  var label = active
    ? _mediaText('mediaExitFullscreen', 'Exit fullscreen')
    : _mediaText('mediaFullscreen', 'Fullscreen');
  document.querySelectorAll('.media-action-fullscreen,.media-theater-fullscreen').forEach(function(btn){
    btn.classList.toggle('is-active', active);
    btn.title = label;
    btn.setAttribute('aria-label', label);
  });
}

function _bindFullscreenEvents(){
  if(_mediaFullscreenEventsBound) return;
  _mediaFullscreenEventsBound = true;
  ['fullscreenchange','webkitfullscreenchange','MSFullscreenChange'].forEach(function(eventName){
    document.addEventListener(eventName, _syncFullscreenButtons);
  });
}

function _toggleFullscreen(el){
  var action = _fullscreenElement() ? _exitFullscreen() : _requestFullscreen(el);
  if(action && typeof action.then === 'function'){
    action.then(function(){ setTimeout(_syncFullscreenButtons, 40); });
  } else {
    setTimeout(_syncFullscreenButtons, 40);
  }
}

function openMediaTheaterFromCurrent(){
  if(!_fullscreenElement()){
    openMediaTheater(_mediaIdx);
    return;
  }
  _exitFullscreen().then(function(){
    setTimeout(function(){ openMediaTheater(_mediaIdx); }, 80);
  });
}

function _formatVideoTime(seconds){
  if(!isFinite(seconds) || seconds < 0) seconds = 0;
  var total = Math.floor(seconds);
  var hours = Math.floor(total / 3600);
  var minutes = Math.floor((total % 3600) / 60);
  var secs = total % 60;
  if(hours > 0) {
    return hours + ':' + String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  }
  return minutes + ':' + String(secs).padStart(2, '0');
}

function _destroyViewerHls(){
  if(_mediaViewerHls){
    _mediaViewerHls.destroy();
    _mediaViewerHls = null;
  }
}

// ── Construir elemento de media ─────────────────────────────────
function buildMediaEl(item){
  if(item.type !== 'video' && item.type !== 'hls'){
    var img = document.createElement('img');
    img.src = item.src; img.alt = '';
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;';
    img.onerror = function(){ this.style.display='none'; };
    return img;
  }
  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;inset:0;';
  var thumb = document.createElement('img');
  thumb.src = item.thumb || '';
  thumb.alt = '';
  thumb.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
  thumb.onerror = function(){ this.parentNode.style.background='#111'; this.style.display='none'; };
  wrap.appendChild(thumb);
  return wrap;
}

// ── Viewer helpers ──────────────────────────────────────────────
function clearViewer(){
  var v = document.getElementById('media-viewer');
  if(!v) return v;
  _destroyViewerHls();
  while(v.firstChild) v.removeChild(v.firstChild);
  return v;
}

function _attachVideoSource(vid, item, autoplay){
  var src = item.src || '';
  if(src.endsWith('.m3u8') && typeof Hls !== 'undefined' && Hls.isSupported()){
    var hls = new Hls();
    hls.loadSource(src);
    hls.attachMedia(vid);
    if(autoplay){
      hls.on(Hls.Events.MANIFEST_PARSED, function(){ vid.play().catch(function(){}); });
    }
    return hls;
  }

  vid.src = src;
  vid.load();
  if(autoplay) {
    vid.play().catch(function(){});
  }
  return null;
}

function _buildCustomVideoPlayer(item, options){
  options = options || {};
  var wrap = document.createElement('div');
  wrap.className = 'media-video-player' + (options.theater ? ' is-theater' : '');
  var hideControlsTimer = null;

  var vid = document.createElement('video');
  vid.className = 'media-video-el';
  vid.setAttribute('playsinline', '');
  vid.preload = 'metadata';
  wrap.appendChild(vid);

  var controls = document.createElement('div');
  controls.className = 'media-video-controls';

  var playBtn = document.createElement('button');
  playBtn.className = 'media-video-btn media-video-play';
  playBtn.type = 'button';
  controls.appendChild(playBtn);

  var time = document.createElement('span');
  time.className = 'media-video-time';
  time.textContent = '0:00 / 0:00';
  controls.appendChild(time);

  var progress = document.createElement('input');
  progress.className = 'media-video-progress';
  progress.type = 'range';
  progress.min = '0';
  progress.max = '1000';
  progress.value = '0';
  controls.appendChild(progress);

  var muteBtn = document.createElement('button');
  muteBtn.className = 'media-video-btn media-video-mute';
  muteBtn.type = 'button';
  controls.appendChild(muteBtn);

  var volume = document.createElement('input');
  volume.className = 'media-video-volume';
  volume.type = 'range';
  volume.min = '0';
  volume.max = '1';
  volume.step = '0.05';
  volume.value = '1';
  controls.appendChild(volume);

  wrap.appendChild(controls);

  function setNavIdle(idle){
    var viewer = wrap.closest('.media-viewer');
    if(viewer) viewer.classList.toggle('media-video-idle', idle);
  }

  function scheduleControlsHide(){
    clearTimeout(hideControlsTimer);
    if(vid.paused) {
      wrap.classList.remove('controls-hidden');
      setNavIdle(false);
      return;
    }
    hideControlsTimer = setTimeout(function(){
      if(!vid.paused && !controls.matches(':hover') && !controls.matches(':focus-within')){
        wrap.classList.add('controls-hidden');
        setNavIdle(true);
      }
    }, 1600);
  }

  function showControls(){
    wrap.classList.remove('controls-hidden');
    setNavIdle(false);
    scheduleControlsHide();
  }

  function updatePlayState(){
    var label = vid.paused ? _mediaText('mediaPlay', 'Play') : _mediaText('mediaPause', 'Pause');
    playBtn.classList.toggle('is-playing', !vid.paused);
    wrap.classList.toggle('is-playing', !vid.paused);
    if(vid.paused) {
      clearTimeout(hideControlsTimer);
      wrap.classList.remove('controls-hidden');
      setNavIdle(false);
    } else {
      scheduleControlsHide();
    }
    playBtn.title = label;
    playBtn.setAttribute('aria-label', label);
  }

  function updateVolumeState(){
    var muted = vid.muted || vid.volume === 0;
    var label = muted ? _mediaText('mediaUnmute', 'Unmute') : _mediaText('mediaMute', 'Mute');
    muteBtn.classList.toggle('is-muted', muted);
    muteBtn.title = label;
    muteBtn.setAttribute('aria-label', label);
    volume.value = muted ? '0' : String(vid.volume || 1);
  }

  function updateProgress(){
    var duration = vid.duration || 0;
    var current = vid.currentTime || 0;
    time.textContent = _formatVideoTime(current) + ' / ' + _formatVideoTime(duration);
    progress.value = duration ? String(Math.round((current / duration) * 1000)) : '0';
  }

  playBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if(vid.paused) vid.play().catch(function(){});
    else vid.pause();
  });

  progress.addEventListener('input', function(e){
    e.stopPropagation();
    if(!vid.duration) return;
    vid.currentTime = (Number(progress.value) / 1000) * vid.duration;
    showControls();
  });

  muteBtn.addEventListener('click', function(e){
    e.stopPropagation();
    vid.muted = !(vid.muted || vid.volume === 0);
    if(!vid.muted && vid.volume === 0) vid.volume = 0.7;
    updateVolumeState();
    showControls();
  });

  volume.addEventListener('input', function(e){
    e.stopPropagation();
    vid.volume = Number(volume.value);
    vid.muted = vid.volume === 0;
    updateVolumeState();
    showControls();
  });

  vid.addEventListener('click', function(e){
    e.stopPropagation();
    if(vid.paused) vid.play().catch(function(){});
    else vid.pause();
  });
  ['loadedmetadata','durationchange','timeupdate'].forEach(function(eventName){
    vid.addEventListener(eventName, updateProgress);
  });
  ['play','pause','ended'].forEach(function(eventName){
    vid.addEventListener(eventName, updatePlayState);
  });
  vid.addEventListener('volumechange', updateVolumeState);
  wrap.addEventListener('mousemove', showControls);
  wrap.addEventListener('touchstart', showControls, {passive: true});

  // Atajos de teclado nativos (compensa la perdida del atributo `controls`).
  // Ignoramos cuando el foco esta en un boton o slider para no pisar su comportamiento nativo.
  wrap.tabIndex = 0;
  wrap.addEventListener('keydown', function(e){
    showControls();
    var tag = (e.target && e.target.tagName ? e.target.tagName : '').toUpperCase();
    if(tag === 'BUTTON' || tag === 'INPUT') return;
    var handled = true;
    switch(e.key){
      case ' ':
      case 'k':
      case 'K':
        if(vid.paused) vid.play().catch(function(){}); else vid.pause();
        break;
      case 'ArrowLeft':
        vid.currentTime = Math.max(0, (vid.currentTime || 0) - 5);
        break;
      case 'ArrowRight':
        vid.currentTime = Math.min(vid.duration || 0, (vid.currentTime || 0) + 5);
        break;
      case 'ArrowUp':
        vid.volume = Math.min(1, (vid.volume || 0) + 0.1);
        vid.muted = false;
        updateVolumeState();
        break;
      case 'ArrowDown':
        vid.volume = Math.max(0, (vid.volume || 0) - 0.1);
        updateVolumeState();
        break;
      case 'm':
      case 'M':
        vid.muted = !vid.muted;
        updateVolumeState();
        break;
      case 'f':
      case 'F':
        var fsTarget = wrap.closest('.media-theater') || wrap.closest('.media-viewer') || wrap;
        _toggleFullscreen(fsTarget);
        break;
      default:
        handled = false;
    }
    if(handled){
      e.preventDefault();
      e.stopPropagation();
    }
  });

  controls.addEventListener('mouseenter', function(){ clearTimeout(hideControlsTimer); });
  controls.addEventListener('mouseleave', scheduleControlsHide);
  controls.addEventListener('focusin', function(){ clearTimeout(hideControlsTimer); wrap.classList.remove('controls-hidden'); });
  controls.addEventListener('focusout', scheduleControlsHide);

  var hls = _attachVideoSource(vid, item, !!options.autoplay);
  if(options.onHls) options.onHls(hls);
  updatePlayState();
  updateVolumeState();
  updateProgress();

  return wrap;
}

function playVideoInViewer(item){
  var viewer = clearViewer();
  if(!viewer) return;
  viewer.classList.remove('is-zoomable');
  viewer.classList.remove('media-video-idle');
  viewer.onclick = null;
  viewer.appendChild(_buildCustomVideoPlayer(item, {
    autoplay: true,
    onHls: function(hls){ _mediaViewerHls = hls; }
  }));
  viewer.appendChild(_buildMediaActions(viewer));
  viewer.appendChild(_buildFullscreenNav());
}

function _buildViewerContent(viewer, item){
  while(viewer.firstChild) viewer.removeChild(viewer.firstChild);
  viewer.appendChild(buildMediaEl(item));
  viewer.onclick = null;
  viewer.classList.toggle('is-zoomable', !_isVideoMedia(item));
  if(_isVideoMedia(item)){
    var ov = document.createElement('div');
    ov.className = 'media-play-overlay';
    ov.id = 'media-overlay';
    var btn = document.createElement('div');
    btn.className = 'media-play-btn';
    btn.innerHTML = '<span class="pa-icon pa-icon-play"></span>';
    ov.appendChild(btn);
    var videoItem = item;
    ov.addEventListener('click', function(){
      ov.remove();
      playVideoInViewer(videoItem);
    });
    viewer.appendChild(ov);
    viewer.appendChild(_buildMediaActions(viewer));
    viewer.appendChild(_buildFullscreenNav());
  } else {
    viewer.onclick = function(){ openMediaTheater(_mediaIdx); };
    viewer.appendChild(_buildMediaActions(viewer));
    viewer.appendChild(_buildFullscreenNav());
  }
}

function _buildMediaActionButton(kind, label, onClick){
  var btn = document.createElement('button');
  btn.className = 'media-action-btn media-action-' + kind;
  btn.type = 'button';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.addEventListener('click', function(e){
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function _buildMediaActions(fullscreenTarget){
  _bindFullscreenEvents();
  var actions = document.createElement('div');
  actions.className = 'media-actions';
  actions.appendChild(_buildMediaActionButton(
    'theater',
    _mediaText('mediaOpenTheater', 'Open theater view'),
    openMediaTheaterFromCurrent
  ));
  actions.appendChild(_buildMediaActionButton(
    'fullscreen',
    _mediaText('mediaFullscreen', 'Fullscreen'),
    function(){ _toggleFullscreen(fullscreenTarget); }
  ));
  setTimeout(_syncFullscreenButtons, 0);
  return actions;
}

function _buildFullscreenNav(){
  if(_mediaItems.length <= 1) return document.createDocumentFragment();

  var frag = document.createDocumentFragment();

  var prevBtn = document.createElement('button');
  prevBtn.className = 'media-viewer-nav media-viewer-prev';
  prevBtn.type = 'button';
  prevBtn.title = _mediaText('mediaPrev', 'Previous media');
  prevBtn.setAttribute('aria-label', prevBtn.title);
  prevBtn.addEventListener('click', function(e){
    e.stopPropagation();
    selectMedia((_mediaIdx - 1 + _mediaItems.length) % _mediaItems.length);
  });
  frag.appendChild(prevBtn);

  var nextBtn = document.createElement('button');
  nextBtn.className = 'media-viewer-nav media-viewer-next';
  nextBtn.type = 'button';
  nextBtn.title = _mediaText('mediaNext', 'Next media');
  nextBtn.setAttribute('aria-label', nextBtn.title);
  nextBtn.addEventListener('click', function(e){
    e.stopPropagation();
    selectMedia((_mediaIdx + 1) % _mediaItems.length);
  });
  frag.appendChild(nextBtn);

  return frag;
}

function _buildTheaterMediaEl(item){
  if(!_isVideoMedia(item)){
    var img = document.createElement('img');
    img.className = 'media-theater-img';
    img.alt = '';
    img.src = item.src;
    return img;
  }

  return _buildCustomVideoPlayer(item, {
    autoplay: true,
    theater: true,
    onHls: function(hls){ _mediaTheaterHls = hls; }
  });
}

function openMediaTheater(idx){
  var item = _mediaItems[idx];
  if(!item) return;

  closeMediaTheater();

  // Guardar el elemento que tenia foco antes de abrir, para restaurarlo al cerrar.
  _mediaTheaterReturnFocus = document.activeElement;

  var overlay = document.createElement('div');
  overlay.className = 'media-theater';
  overlay.id = 'media-theater';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  var bar = document.createElement('div');
  bar.className = 'media-theater-bar';
  bar.addEventListener('click', function(e){ e.stopPropagation(); });
  var title = document.createElement('div');
  title.className = 'media-theater-title';
  var gameTitle = document.getElementById('game-title');
  title.textContent = (gameTitle && gameTitle.textContent ? gameTitle.textContent + ' - ' : '') + _mediaText('mediaTitle', 'Trailers & Screenshots');
  bar.appendChild(title);
  overlay.appendChild(bar);

  var stage = document.createElement('div');
  stage.className = 'media-theater-stage';
  stage.addEventListener('click', function(e){ e.stopPropagation(); });
  overlay.appendChild(stage);

  var footer = document.createElement('div');
  footer.className = 'media-theater-footer';
  footer.addEventListener('click', function(e){ e.stopPropagation(); });
  overlay.appendChild(footer);

  var closeBtn = document.createElement('button');
  closeBtn.className = 'media-theater-close';
  closeBtn.type = 'button';
  closeBtn.title = _mediaText('mediaCloseTheater', 'Close theater view');
  closeBtn.setAttribute('aria-label', closeBtn.title);
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', function(e){
    e.stopPropagation();
    closeMediaTheater();
  });
  overlay.appendChild(closeBtn);

  var theaterActions = document.createElement('div');
  theaterActions.className = 'media-theater-actions';

  var exitTheaterBtn = document.createElement('button');
  exitTheaterBtn.className = 'media-theater-exit';
  exitTheaterBtn.type = 'button';
  exitTheaterBtn.title = _mediaText('mediaCloseTheater', 'Close theater view');
  exitTheaterBtn.setAttribute('aria-label', exitTheaterBtn.title);
  exitTheaterBtn.addEventListener('click', function(e){
    e.stopPropagation();
    closeMediaTheater();
  });
  theaterActions.appendChild(exitTheaterBtn);

  var fullscreenBtn = document.createElement('button');
  fullscreenBtn.className = 'media-theater-fullscreen';
  fullscreenBtn.type = 'button';
  fullscreenBtn.title = _mediaText('mediaFullscreen', 'Fullscreen');
  fullscreenBtn.setAttribute('aria-label', fullscreenBtn.title);
  fullscreenBtn.addEventListener('click', function(e){
    e.stopPropagation();
    _toggleFullscreen(overlay);
  });
  theaterActions.appendChild(fullscreenBtn);
  overlay.appendChild(theaterActions);
  setTimeout(_syncFullscreenButtons, 0);

  var prevBtn = document.createElement('button');
  prevBtn.className = 'media-theater-nav media-theater-prev';
  prevBtn.type = 'button';
  prevBtn.title = _mediaText('mediaPrev', 'Previous media');
  prevBtn.setAttribute('aria-label', prevBtn.title);
  overlay.appendChild(prevBtn);

  var nextBtn = document.createElement('button');
  nextBtn.className = 'media-theater-nav media-theater-next';
  nextBtn.type = 'button';
  nextBtn.title = _mediaText('mediaNext', 'Next media');
  nextBtn.setAttribute('aria-label', nextBtn.title);
  overlay.appendChild(nextBtn);

  function showMedia(nextIdx){
    if(!_mediaItems[nextIdx]) return;
    if(_mediaTheaterHls){
      _mediaTheaterHls.destroy();
      _mediaTheaterHls = null;
    }
    _mediaIdx = nextIdx;
    item = _mediaItems[_mediaIdx];
    while(stage.firstChild) stage.removeChild(stage.firstChild);
    stage.appendChild(_buildTheaterMediaEl(item));
    footer.textContent = (_mediaIdx + 1) + ' ' + _mediaText('mediaCounterOf', 'of') + ' ' + _mediaItems.length;
    selectMedia(_mediaIdx);

    var multiMedia = _mediaItems.length > 1;
    prevBtn.style.display = multiMedia ? 'flex' : 'none';
    nextBtn.style.display = multiMedia ? 'flex' : 'none';
  }

  function moveMedia(dir){
    if(!_mediaItems.length) return;
    showMedia((_mediaIdx + dir + _mediaItems.length) % _mediaItems.length);
  }

  prevBtn.addEventListener('click', function(e){
    e.stopPropagation();
    moveMedia(-1);
  });
  nextBtn.addEventListener('click', function(e){
    e.stopPropagation();
    moveMedia(1);
  });
  overlay.addEventListener('click', closeMediaTheater);

  _mediaTheaterKeyHandler = function(e){
    if(e.key === 'Escape') { closeMediaTheater(); return; }

    // ArrowLeft/Right navegan entre media, excepto si el foco esta dentro
    // del video player (donde esas teclas hacen seek o ajustan slider).
    var active = document.activeElement;
    var inVideoPlayer = active && active.closest && active.closest('.media-video-player');
    if(!inVideoPlayer){
      if(e.key === 'ArrowLeft') { moveMedia(-1); return; }
      if(e.key === 'ArrowRight') { moveMedia(1); return; }
    }

    // Focus trap: mantener el foco dentro del overlay con Tab.
    if(e.key === 'Tab'){
      var focusables = overlay.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])');
      var visible = [];
      focusables.forEach(function(el){ if(el.offsetParent !== null) visible.push(el); });
      if(!visible.length) return;
      var first = visible[0];
      var last = visible[visible.length - 1];
      if(e.shiftKey && (active === first || !overlay.contains(active))){
        e.preventDefault();
        last.focus();
      } else if(!e.shiftKey && (active === last || !overlay.contains(active))){
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener('keydown', _mediaTheaterKeyHandler);

  document.body.appendChild(overlay);
  showMedia(idx);
  closeBtn.focus();
}

function closeMediaTheater(){
  var overlay = document.getElementById('media-theater');
  if(overlay) overlay.remove();
  if(_mediaTheaterHls){
    _mediaTheaterHls.destroy();
    _mediaTheaterHls = null;
  }
  if(_mediaTheaterKeyHandler){
    document.removeEventListener('keydown', _mediaTheaterKeyHandler);
    _mediaTheaterKeyHandler = null;
  }
  // Restaurar foco al elemento que abrio el theater (a11y).
  if(_mediaTheaterReturnFocus && typeof _mediaTheaterReturnFocus.focus === 'function'){
    try { _mediaTheaterReturnFocus.focus(); } catch(e) {}
  }
  _mediaTheaterReturnFocus = null;
}

// ── Render panel completo ───────────────────────────────────────
function renderMediaPanel(media){
  _mediaItems = media || [];
  _mediaIdx   = 0;
  var panel = document.createElement('div');
  panel.className = 'media-panel';
  panel.id = 'media-panel';
  if(!_mediaItems.length) return panel;

  // Viewer
  var viewer = document.createElement('div');
  viewer.className = 'media-viewer';
  viewer.id = 'media-viewer';
  _buildViewerContent(viewer, _mediaItems[0]);
  panel.appendChild(viewer);

  // Thumb strip
  var scroll = document.createElement('div');
  scroll.className = 'media-scroll';
  _mediaItems.forEach(function(item, i){
    var thumb = document.createElement('div');
    thumb.className = 'media-thumb' + (i===0?' active':'');
    thumb.id = 'mthumb-'+i;
    if(item.type === 'video' || item.type === 'hls'){
      thumb.style.background = '#111';
      if(item.thumb){
        var img = document.createElement('img');
        img.src = item.thumb; img.alt = '';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        img.onerror = function(){ this.style.display='none'; };
        thumb.appendChild(img);
      }
      var pi = document.createElement('div');
      pi.className = 'media-thumb-play';
      pi.innerHTML = '<span class="pa-icon pa-icon-play"></span>';
      thumb.appendChild(pi);
    } else {
      var img2 = document.createElement('img');
      img2.src = item.thumb || item.src; img2.alt = '';
      img2.onerror = function(){ this.style.display='none'; };
      thumb.appendChild(img2);
    }
    thumb.addEventListener('click', function(){ selectMedia(i); });
    scroll.appendChild(thumb);
  });
  panel.appendChild(scroll);
  return panel;
}

// ── Selección de media ──────────────────────────────────────────
function selectMedia(idx){
  _mediaIdx = idx;
  var viewer = document.getElementById('media-viewer');
  if(!viewer || !_mediaItems[idx]) return;
  viewer.classList.remove('media-video-idle');
  _mediaItems.forEach(function(_, i){
    var t = document.getElementById('mthumb-'+i);
    if(t) t.classList.toggle('active', i===idx);
  });
  _buildViewerContent(viewer, _mediaItems[idx]);
  document.querySelectorAll('.media-thumb').forEach(function(el,i){
    el.classList.toggle('active', i===idx);
  });
  var t = document.getElementById('mthumb-'+idx);
  if(t) t.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
}
