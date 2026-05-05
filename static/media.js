// media.js — Panel de media (screenshots y videos)

// ── Estado del media player ─────────────────────────────────────
var _mediaItems = [];
var _mediaIdx   = 0;

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
  while(v.firstChild) v.removeChild(v.firstChild);
  return v;
}

function playVideoInViewer(src){
  var viewer = clearViewer();
  if(!viewer) return;
  var vid = document.createElement('video');
  vid.setAttribute('controls','');
  vid.setAttribute('playsinline','');
  vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;display:block;';
  viewer.appendChild(vid);
  if(src.endsWith('.m3u8') && typeof Hls !== 'undefined' && Hls.isSupported()){
    var hls = new Hls();
    hls.loadSource(src);
    hls.attachMedia(vid);
    hls.on(Hls.Events.MANIFEST_PARSED, function(){ vid.play().catch(function(){}); });
  } else {
    vid.src = src;
    vid.load();
    vid.play().catch(function(e){ console.warn('play():', e); });
  }
}

function _buildViewerContent(viewer, item){
  while(viewer.firstChild) viewer.removeChild(viewer.firstChild);
  viewer.appendChild(buildMediaEl(item));
  if(item.type === 'video' || item.type === 'hls'){
    var ov = document.createElement('div');
    ov.className = 'media-play-overlay';
    ov.id = 'media-overlay';
    var btn = document.createElement('div');
    btn.className = 'media-play-btn';
    btn.innerHTML = '<span class="pa-icon pa-icon-play"></span>';
    ov.appendChild(btn);
    var videoSrc = item.src;
    ov.addEventListener('click', function(){
      ov.remove();
      playVideoInViewer(videoSrc);
    });
    viewer.appendChild(ov);
  }
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
