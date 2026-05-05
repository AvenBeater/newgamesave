// render.js — Renderizado de resultados (grid, list, table)

function renderResults(data,gameName){
  hideAll();
  document.getElementById('results-section').style.display='block';
  document.getElementById('game-title').textContent=gameName;
  document.getElementById('game-subtitle').textContent=data.prices.length+' '+t('storesFound');
  var prices=data.prices.slice().sort(function(a,b){return a.priceNative-b.priceNative;});

  var bd=document.getElementById('best-deal');
  bd.style.display='block';
  bd.classList.add('visible');

  if(prices.length>0){
    var best=prices[0];
    var cv=data.cover||'';
    var media=data.media||[];
    var gi = data.gameInfo || {};

    // ── Hero banner ──
    var hero = document.createElement('div');
    hero.className = 'game-card-hero';
    var cvFallback = data.coverFallback || '';
    if(cv){
      var heroImg = document.createElement('img');
      heroImg.className = 'game-card-hero-img';
      heroImg.alt = '';
      heroImg.onerror = function(){
        if(cvFallback && this.src !== cvFallback){ this.src = cvFallback; }
        else { this.style.display='none'; }
      };
      heroImg.src = cv;
      hero.appendChild(heroImg);
    }
    var overlay = document.createElement('div');
    overlay.className = 'game-card-hero-overlay';
    var tag = document.createElement('div'); tag.className='best-deal-tag'; tag.textContent=t('bestPrice');
    var infoLeft = document.createElement('div');
    var lbl = document.createElement('div'); lbl.className='store-label'; lbl.textContent=t('bestLabel');
    var sname = document.createElement('div'); sname.className='store-name'; sname.textContent=best.storeName;
    var pmain = document.createElement('div'); pmain.className='price-main'; pmain.textContent=fmtPrice(best.priceNative)+' '+currentCurrency;
    infoLeft.appendChild(lbl); infoLeft.appendChild(sname); infoLeft.appendChild(pmain);
    if(best.discount>0){
      var psub=document.createElement('div'); psub.className='price-sub';
      psub.innerHTML='<span class="pa-icon pa-icon-fire"></span> '+best.discount+'% '+t('discount').toLowerCase();
      infoLeft.appendChild(psub);
    }
    var abtn=document.createElement('a'); abtn.className='best-deal-btn';
    abtn.href=best.url; abtn.target='_blank';
    abtn.innerHTML=esc(t('goStore'))+' <span class="pa-icon pa-icon-arrow-right"></span>';
    overlay.appendChild(tag); overlay.appendChild(infoLeft); overlay.appendChild(abtn);
    hero.appendChild(overlay);

    // ── Body: gameinfo izq | media der ──
    var body = document.createElement('div');
    body.className = 'game-card-body';

    // Game info panel
    var gip = document.createElement('div');
    gip.className = 'game-info-panel';
    function giRow(label, value){
      if(!value) return;
      var row=document.createElement('div'); row.className='gi-row';
      var l=document.createElement('div'); l.className='gi-label'; l.textContent=label;
      var v=document.createElement('div'); v.className='gi-value'; v.textContent=value;
      row.appendChild(l); row.appendChild(v); gip.appendChild(row);
    }
    if(gi.description){
      var descWrap=document.createElement('div'); descWrap.className='gi-desc-wrap';
      var desc=document.createElement('div'); desc.className='gi-desc'; desc.textContent=gi.description;
      var toggle=document.createElement('button'); toggle.type='button'; toggle.className='gi-desc-toggle';
      toggle.textContent=t('seeMore'); toggle.style.display='none';
      toggle.addEventListener('click', function(){
        var expanded=desc.classList.toggle('expanded');
        toggle.textContent=expanded ? t('seeLess') : t('seeMore');
      });
      descWrap.appendChild(desc); descWrap.appendChild(toggle);
      gip.appendChild(descWrap);
      // Mostrar el toggle solo si la descripcion esta clampeada (no cabe en 5 lineas).
      setTimeout(function(){
        if(desc.scrollHeight > desc.clientHeight + 1) toggle.style.display='';
      }, 0);
    }
    if(gi.platforms && gi.platforms.length){
      var pr=document.createElement('div'); pr.className='gi-row';
      var pl=document.createElement('div'); pl.className='gi-label'; pl.textContent=t('platforms');
      var pv=document.createElement('div'); pv.className='gi-platforms';
      gi.platforms.forEach(function(p){ var s=document.createElement('span'); s.className='gi-plat'; s.textContent=p; pv.appendChild(s); });
      pr.appendChild(pl); pr.appendChild(pv); gip.appendChild(pr);
    }
    if(gi.metacritic){
      var mr=document.createElement('div'); mr.className='gi-row';
      var ml=document.createElement('div'); ml.className='gi-label'; ml.textContent=t('metacritic');
      var mv=document.createElement('div'); mv.className='gi-meta'; mv.textContent=gi.metacritic+'/100';
      mr.appendChild(ml); mr.appendChild(mv); gip.appendChild(mr);
    }
    giRow(t('developer'), (gi.developers||[]).join(', '));
    giRow(t('publisher'), (gi.publishers||[]).join(', '));
    giRow(t('genres'), (gi.genres||[]).join(', '));
    giRow(t('release'), gi.releaseDate);
    giRow(t('categories'), (gi.categories||[]).slice(0,4).join(', '));
    body.appendChild(gip);

    // Media panel
    body.appendChild(renderMediaPanel(media));

    bd.innerHTML='';
    bd.appendChild(hero);
    bd.appendChild(body);
  } else {
    bd.innerHTML='';
  }

  var st=document.getElementById('status');
  st.style.display='block';
  st.innerHTML=t('rateLabel')+' USD/'+currentCurrency+': <span>'+fmtPrice(data.rate)+'</span> &middot; '+t('updated');
  renderGrid(prices);
}

// ── Cambio de vista ─────────────────────────────────────────────
function setView(v){
  currentView=v;
  ["grid","list","table"].forEach(function(x){
    document.getElementById("btn-"+x).classList.toggle("active",x===v);
  });
  if(lastData) renderGrid(lastData.prices.slice().sort(function(a,b){return a.priceNative-b.priceNative;}));
}

// ── Grid de precios ─────────────────────────────────────────────
function renderGrid(prices){
  var grid=document.getElementById("price-grid");
  if(currentView==="table"){
    grid.className="price-grid view-table";
    if(!prices.length){grid.innerHTML=noResults();return;}
    var h="<table class='price-table'><thead><tr>";
    h+="<th>"+t("store")+"</th><th>"+t("price")+" "+currentCurrency+"</th><th>"+t("discount")+"</th><th></th>";
    h+="</tr></thead><tbody>";
    for(var i=0;i<prices.length;i++){
      var p=prices[i];
      h+="<tr style='animation-delay:"+(i*0.04)+"s'>";
      var langTag = (p.lang && p.lang!==currentLang) ? " <span class='lang-tag'>"+p.langFlag+" "+p.langLabel+"</span>" : "";
      h+="<td><div class='table-store'><span class='store-dot' style='background:"+p.color+"'></span>"+esc(p.storeName)+langTag+"</div></td>";
      h+="<td><span class='table-price'>"+fmtPrice(p.priceNative)+"</span>";
      if(p.discount>0) h+="<span class='table-original'>"+fmtPrice(p.originalNative)+"</span>";
      h+="</td><td>";
      h+=p.discount>0?"<span class='discount-badge'>-"+p.discount+"%</span>":"<span style='color:var(--muted)'>&#x2014;</span>";
      h+="</td><td><a class='table-btn' href='"+esc(p.url)+"' target='_blank'>"+t("see")+" &#x2192;</a></td></tr>";
    }
    h+="</tbody></table>";
    grid.innerHTML=h;
  } else if(currentView==="list"){
    grid.className="price-grid view-list";
    if(!prices.length){grid.innerHTML=noResults();return;}
    var h="";
    for(var i=0;i<prices.length;i++){
      var p=prices[i];
      h+="<div class='price-card' style='--store-color:"+p.color+";animation-delay:"+(i*0.05)+"s'>";
      h+="<div class='card-store'><div class='store-badge'><span class='store-dot' style='background:"+p.color+"'></span>"+esc(p.storeName)+"</div>";
      if(p.discount>0) h+="<span class='discount-badge'>-"+p.discount+"%</span>";
      if(p.lang && p.lang!==currentLang) h+="<span class='lang-tag'>"+p.langFlag+" "+p.langLabel+"</span>";
      h+="</div><div class='price-info'><div class='card-price'>"+fmtPrice(p.priceNative)+" "+currentCurrency+"</div>";
      if(p.discount>0) h+="<div class='card-original'>"+fmtPrice(p.originalNative)+"</div>";
      h+="</div><a class='btn-buy' href='"+esc(p.url)+"' target='_blank'>"+t("goShort")+" &#x2192;</a></div>";
    }
    grid.innerHTML=h;
  } else {
    grid.className="price-grid";
    if(!prices.length){grid.innerHTML=noResults();return;}
    var h="";
    for(var i=0;i<prices.length;i++){
      var p=prices[i];
      h+="<div class='price-card' style='--store-color:"+p.color+";animation-delay:"+(i*0.05)+"s'>";
      h+="<div class='card-store'><div class='store-badge'><span class='store-dot' style='background:"+p.color+"'></span>"+esc(p.storeName)+"</div>";
      if(p.discount>0) h+="<span class='discount-badge'>-"+p.discount+"%</span>";
      h+="</div>";
      if(p.lang && p.lang!==currentLang) h+="<div style='margin-bottom:10px'><span class='lang-tag'>"+p.langFlag+" "+p.langLabel+"</span></div>";
      h+="<div class='card-price'>"+fmtPrice(p.priceNative)+" "+currentCurrency+"</div>";
      if(p.discount>0) h+="<div class='card-original'>"+t("before")+" "+fmtPrice(p.originalNative)+"</div>";
      h+="<a class='btn-buy' href='"+esc(p.url)+"' target='_blank'>"+t("goStore")+" &#x2192;</a></div>";
    }
    grid.innerHTML=h;
  }
}
