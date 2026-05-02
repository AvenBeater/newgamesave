// search.js — Input de búsqueda, sugerencias, fetchPrices

var searchInput=document.getElementById("search-input");
var suggestionsEl=document.getElementById("suggestions");

// ── Event listeners ─────────────────────────────────────────────
searchInput.addEventListener("input",function(){
  updateClearBtn();
  clearTimeout(searchTimeout);
  var q=searchInput.value.trim();
  if(q.length<3){suggestionsEl.classList.remove("visible");return;}
  searchTimeout=setTimeout(function(){fetchSuggestions(q);},400);
});
searchInput.addEventListener("keydown",function(e){if(e.key==="Enter")searchGame();});
document.addEventListener("click",function(e){
  if(!e.target.closest(".search-section")) suggestionsEl.classList.remove("visible");
});

// ── Sugerencias ─────────────────────────────────────────────────
async function fetchSuggestions(q){
  try{
    var r=await fetch("/api/search?q="+encodeURIComponent(q)+"&lang="+currentLang+"&currency="+currentCurrency);
    renderSuggestions(await r.json());
  }catch(e){}
}

function renderSuggestions(games){
  if(!games.length){suggestionsEl.classList.remove("visible");return;}
  window._sugg=games;
  var html="";
  for(var i=0;i<games.length;i++){
    var g=games[i];
    html+="<div class='suggestion-item' onclick='selectGameByIndex("+i+")'>";
    html+="<img src='"+esc(g.image)+"' onerror='hideImg(this)' alt=''>";
    html+="<span class='suggestion-name'>"+esc(g.name)+"</span>";
    if(g.price) html+="<span class='suggestion-price'>"+displayPrice(g.price)+"</span>";
    html+="</div>";
  }
  suggestionsEl.innerHTML=html;
  suggestionsEl.classList.add("visible");
}

function selectGameByIndex(i){var g=window._sugg[i];selectGame(g.id,g.name);}

function selectGame(id,name){
  selectedGame={id:id,name:name};
  searchInput.value=name;
  suggestionsEl.classList.remove("visible");
  fetchPrices(id,name);
}

// ── Búsqueda principal ──────────────────────────────────────────
async function searchGame(){
  var q=searchInput.value.trim(); if(!q)return;
  if(selectedGame&&selectedGame.name===q){fetchPrices(selectedGame.id,selectedGame.name);return;}
  try{
    var r=await fetch("/api/search?q="+encodeURIComponent(q)+"&lang="+currentLang+"&currency="+currentCurrency);
    var gs=await r.json();
    if(gs.length>0)selectGame(gs[0].id,gs[0].name);else showEmpty();
  }catch(e){showEmpty();}
}

// ── Fetch precios de un juego ───────────────────────────────────
async function fetchPrices(appId,gameName){
  suggestionsEl.classList.remove("visible");
  showLoading();
  try{
    var url="/api/prices?appid="+appId+"&name="+encodeURIComponent(gameName)+"&currency="+currentCurrency+"&lang="+currentLang;
    var r=await fetch(url);
    lastData=await r.json();
    var displayName = (lastData.localizedName && lastData.localizedName.trim()) ? lastData.localizedName : gameName;
    lastGameName=displayName;
    searchInput.value=displayName;
    updateClearBtn();
    if(selectedGame) selectedGame.name=displayName;
    renderResults(lastData,displayName);
  }catch(e){showEmpty();}
}
