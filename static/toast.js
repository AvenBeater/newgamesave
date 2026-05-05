// toast.js — Sistema de feedback global reutilizable.
// Uso: showToast("Mensaje", "error" | "success" | "info")
// Auto-dismiss a los 10s; el usuario puede cerrar manual con la X.

(function(){
  var TOAST_TTL = 10000;

  function ensureContainer(){
    var c = document.getElementById("toast-container");
    if(!c){
      c = document.createElement("div");
      c.id = "toast-container";
      c.className = "toast-container";
      document.body.appendChild(c);
    }
    return c;
  }

  function dismissToast(t){
    if(!t || !t.parentNode) return;
    t.classList.remove("toast-visible");
    t.classList.add("toast-leaving");
    setTimeout(function(){
      if(t.parentNode) t.parentNode.removeChild(t);
    }, 250);
  }

  function showToast(message, type){
    type = type || "info";
    var c = ensureContainer();
    var t = document.createElement("div");
    t.className = "toast toast-" + type;

    var iconClass = type === "error" ? "pa-icon-warning" : (type === "success" ? "pa-icon-check" : "pa-icon-info");
    var iconEl = document.createElement("span");
    iconEl.className = "toast-icon pa-icon " + iconClass;
    iconEl.setAttribute("aria-hidden", "true");

    var msg = document.createElement("span");
    msg.className = "toast-msg";
    msg.textContent = message;

    var close = document.createElement("button");
    close.className = "toast-close";
    close.setAttribute("aria-label", "Close");
    close.type = "button";
    close.innerHTML = '<span class="pa-icon pa-icon-cancel"></span>';
    close.onclick = function(){ dismissToast(t); };

    t.appendChild(iconEl);
    t.appendChild(msg);
    t.appendChild(close);
    c.appendChild(t);

    // Force reflow para que la animación se dispare en el siguiente frame.
    requestAnimationFrame(function(){ t.classList.add("toast-visible"); });

    setTimeout(function(){ dismissToast(t); }, TOAST_TTL);
    return t;
  }

  window.showToast = showToast;
})();
