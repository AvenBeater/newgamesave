// age-gate.js — Verificación de edad para juegos con contenido adulto.
//
// Expone:
//   window.requireAgeVerification({onConfirm, onCancel})
//   window.isAgeVerified()
//
// La fecha de nacimiento se guarda en localStorage (`newgamesave_dob_v1`)
// como ISO YYYY-MM-DD. Si el usuario ya está verificado (>=18), futuros
// llamados a requireAgeVerification ejecutan onConfirm directo sin abrir
// el modal.

(function(){
  var LS_DOB_KEY = "newgamesave_dob_v1";
  var MIN_AGE = 18;

  // Callback pendiente del flow actual (mientras el modal está abierto).
  var pendingFlow = null;

  function computeAge(dob){
    var today = new Date();
    var age = today.getFullYear() - dob.getFullYear();
    var m = today.getMonth() - dob.getMonth();
    if(m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  }

  function loadStoredDOB(){
    try {
      var s = localStorage.getItem(LS_DOB_KEY);
      if(!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
      var d = new Date(s + "T00:00:00");
      if(isNaN(d.getTime())) return null;
      return d;
    } catch(e){ return null; }
  }

  function saveDOB(d){
    try {
      var iso = d.getFullYear() + "-" +
                String(d.getMonth()+1).padStart(2,"0") + "-" +
                String(d.getDate()).padStart(2,"0");
      localStorage.setItem(LS_DOB_KEY, iso);
    } catch(e){}
  }

  function isAgeVerified(){
    var d = loadStoredDOB();
    return !!d && computeAge(d) >= MIN_AGE;
  }

  function getMonthNames(locale){
    try {
      var fmt = new Intl.DateTimeFormat(locale || "en-US", {month: "long"});
      return Array.from({length:12}, function(_,i){
        return fmt.format(new Date(2000, i, 1));
      });
    } catch(e){
      return ["January","February","March","April","May","June",
              "July","August","September","October","November","December"];
    }
  }

  function daysInMonth(m, y){
    return new Date(y, m, 0).getDate();
  }

  function tr(k){
    return (typeof window.t === "function") ? window.t(k) : k;
  }

  function refreshDayOptions(){
    var daySel   = document.getElementById("dob-day");
    var monthSel = document.getElementById("dob-month");
    var yearSel  = document.getElementById("dob-year");
    if(!daySel || !monthSel || !yearSel) return;

    var m = parseInt(monthSel.value, 10);
    var y = parseInt(yearSel.value, 10);
    var max = (m && y) ? daysInMonth(m, y) : 31;
    var prev = parseInt(daySel.value, 10) || 0;

    var html = '<option value="">' + tr("dobDay") + '</option>';
    for(var d=1; d<=max; d++){
      var pad = d < 10 ? "0" : "";
      html += '<option value="'+d+'">'+pad+d+'</option>';
    }
    daySel.innerHTML = html;
    if(prev && prev <= max) daySel.value = String(prev);
  }

  function buildModal(){
    var existing = document.getElementById("age-modal");
    if(existing) return existing;

    var overlay = document.createElement("div");
    overlay.id = "age-modal";
    overlay.className = "age-modal-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "age-modal-title");

    var modal = document.createElement("div");
    modal.className = "age-modal";

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "age-modal-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = '<span class="pa-icon pa-icon-cancel"></span>';
    closeBtn.onclick = cancelFlow;

    var title = document.createElement("h2");
    title.id = "age-modal-title";
    title.className = "age-modal-title";

    var msg = document.createElement("p");
    msg.id = "age-modal-msg";
    msg.className = "age-modal-msg";

    var picker = document.createElement("div");
    picker.className = "dob-picker";

    var daySel = document.createElement("select");
    daySel.id = "dob-day";
    daySel.className = "ctrl-select dob-select";

    var monthSel = document.createElement("select");
    monthSel.id = "dob-month";
    monthSel.className = "ctrl-select dob-select dob-select-month";

    var yearSel = document.createElement("select");
    yearSel.id = "dob-year";
    yearSel.className = "ctrl-select dob-select dob-select-year";

    monthSel.addEventListener("change", refreshDayOptions);
    yearSel.addEventListener("change", refreshDayOptions);

    picker.appendChild(daySel);
    picker.appendChild(monthSel);
    picker.appendChild(yearSel);

    var actions = document.createElement("div");
    actions.className = "age-modal-actions";

    var cancelBtn = document.createElement("button");
    cancelBtn.id = "age-modal-cancel";
    cancelBtn.type = "button";
    cancelBtn.className = "age-modal-btn age-modal-btn-cancel";
    cancelBtn.onclick = cancelFlow;

    var confirmBtn = document.createElement("button");
    confirmBtn.id = "age-modal-confirm";
    confirmBtn.type = "button";
    confirmBtn.className = "age-modal-btn age-modal-btn-confirm";
    confirmBtn.onclick = confirmFlow;

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    modal.appendChild(closeBtn);
    modal.appendChild(title);
    modal.appendChild(msg);
    modal.appendChild(picker);
    modal.appendChild(actions);
    overlay.appendChild(modal);

    overlay.addEventListener("click", function(e){
      if(e.target === overlay) cancelFlow();
    });
    document.addEventListener("keydown", function(e){
      if(e.key === "Escape" && overlay.classList.contains("visible")) cancelFlow();
    });

    document.body.appendChild(overlay);
    return overlay;
  }

  function applyLabels(){
    document.getElementById("age-modal-title").textContent  = tr("ageModalTitle");
    document.getElementById("age-modal-msg").textContent    = tr("ageModalMsg");
    document.getElementById("age-modal-cancel").textContent = tr("ageModalCancel");
    document.getElementById("age-modal-confirm").textContent= tr("ageModalConfirm");

    var lang = window.currentLang || "en";
    var months = getMonthNames(lang);

    var monthSel = document.getElementById("dob-month");
    var yearSel  = document.getElementById("dob-year");

    var monthHtml = '<option value="">' + tr("dobMonth") + '</option>';
    for(var i=0; i<12; i++){
      var name = months[i].charAt(0).toUpperCase() + months[i].slice(1);
      monthHtml += '<option value="'+(i+1)+'">'+name+'</option>';
    }
    monthSel.innerHTML = monthHtml;

    var currentYear = new Date().getFullYear();
    var yearHtml = '<option value="">' + tr("dobYear") + '</option>';
    for(var y=currentYear; y>=currentYear-100; y--){
      yearHtml += '<option value="'+y+'">'+y+'</option>';
    }
    yearSel.innerHTML = yearHtml;

    refreshDayOptions();
  }

  function getEnteredDOB(){
    var d = parseInt(document.getElementById("dob-day").value, 10);
    var m = parseInt(document.getElementById("dob-month").value, 10);
    var y = parseInt(document.getElementById("dob-year").value, 10);
    if(!d || !m || !y) return null;
    var dob = new Date(y, m-1, d);
    // Validar que el browser no haya hecho rollover (ej. 31 feb → 3 mar)
    if(dob.getFullYear() !== y || dob.getMonth() !== (m-1) || dob.getDate() !== d) return null;
    if(dob > new Date()) return null;
    return dob;
  }

  function openModal(){
    var overlay = buildModal();
    applyLabels();
    overlay.classList.add("visible");
    setTimeout(function(){
      var first = document.getElementById("dob-day");
      if(first) first.focus();
    }, 100);
  }

  function closeModal(){
    var overlay = document.getElementById("age-modal");
    if(overlay) overlay.classList.remove("visible");
  }

  function cancelFlow(){
    closeModal();
    var cb = pendingFlow && pendingFlow.onCancel;
    pendingFlow = null;
    if(typeof cb === "function") cb();
  }

  function confirmFlow(){
    var dob = getEnteredDOB();
    if(!dob){
      if(window.showToast) showToast(tr("ageModalInvalid"), "error");
      return;
    }
    saveDOB(dob);
    var age = computeAge(dob);
    if(age < MIN_AGE){
      closeModal();
      if(window.showToast) showToast(tr("ageModalUnderage"), "error");
      var cb = pendingFlow && pendingFlow.onCancel;
      pendingFlow = null;
      if(typeof cb === "function") cb();
      return;
    }
    closeModal();
    var ok = pendingFlow && pendingFlow.onConfirm;
    pendingFlow = null;
    if(typeof ok === "function") ok();
  }

  function requireAgeVerification(callbacks){
    callbacks = callbacks || {};
    if(isAgeVerified()){
      if(typeof callbacks.onConfirm === "function") callbacks.onConfirm();
      return;
    }
    pendingFlow = callbacks;
    openModal();
  }

  window.requireAgeVerification = requireAgeVerification;
  window.isAgeVerified = isAgeVerified;
})();
