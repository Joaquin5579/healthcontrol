// =====================================================================
//  ANIMACIONES DEL SCADA
//  Archivo aparte: solo OBSERVA el SCADA (bitácora, estados, pestañas) y
//  agrega efectos visuales. No cambia ninguna función existente.
//   - Avisos emergentes para alarmas, IA, contramedidas y mensajes.
//   - Destello en los bordes de la pantalla cuando llega una alarma.
//   - Transición al cambiar de pestaña.
//   - Tarjetas que "saltan" al empeorar y brillan en verde al recuperarse.
//   - Despegue al comenzar la misión.
//   - Partículas de radiación durante una tormenta solar.
// =====================================================================
(function () {
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nameOf = id => {
    const c = (typeof CREW_PROFILES !== "undefined" ? CREW_PROFILES : []).find(p => p.id === id);
    return c ? c.name : id;
  };

  // ---------- Avisos emergentes ----------
  const box = document.createElement("div");
  box.className = "anim-toasts";
  document.body.appendChild(box);

  function toast(kind, icon, title, text, ms) {
    const el = document.createElement("div");
    el.className = `anim-toast ${kind}`;
    el.innerHTML = `
      <div class="anim-toast-icon">${icon}</div>
      <div class="anim-toast-body">
        <div class="anim-toast-title">${esc(title)}</div>
        <div class="anim-toast-text">${esc(text)}</div>
        <div class="anim-toast-bar"><i style="animation-duration:${ms}ms"></i></div>
      </div>`;
    const close = () => {
      if (el.classList.contains("out")) return;
      el.classList.add("out");
      setTimeout(() => el.remove(), 350);
    };
    el.addEventListener("click", close);
    box.prepend(el);
    while (box.children.length > 4) box.lastElementChild.remove();
    setTimeout(close, ms);
  }

  const vignette = document.createElement("div");
  vignette.className = "anim-vignette";
  document.body.appendChild(vignette);
  function flash(level) {
    if (reduced) return;
    vignette.className = "anim-vignette";
    void vignette.offsetWidth;          // reinicia la animación
    vignette.className = `anim-vignette ${level}`;
  }

  // Convierte una entrada de la bitácora en un aviso (o ninguno)
  function fromLog(l) {
    const m = l.msg;
    const who = nameOf(l.crew);
    if (/ESTADO NOMINAL|volvió a su línea base|Velocidad de simulación|__marca__/.test(m)) return;
    if (m.startsWith("IA · Anomalía")) {
      toast("ai", "🤖", `Alerta anticipada de la IA · ${who}`, m.replace("IA · ", "").split(" (")[0], 6000);
      return;
    }
    if (m.startsWith("✓ Contramedida completada")) {
      toast("success", "✅", `Contramedida completada · ${who}`, m.replace("✓ Contramedida completada: ", ""), 5500);
      heal(l.crew);
      return;
    }
    if (m.startsWith("Inicia contramedida")) {
      toast("info", "⏳", `Contramedida en curso · ${who}`, m.replace("Inicia contramedida: ", ""), 4000);
      return;
    }
    if (l.crew === "TIERRA" && m.startsWith("Mensaje recibido")) {
      toast("comm", "📡", "Mensaje de la Tierra", m, 5500);
      return;
    }
    if (m.startsWith("INCIDENTE")) {
      toast("critical", "🚨", `Incidente · ${who}`, m.replace(/^INCIDENTE \(Día \d+\): /, ""), 7000);
      flash("critical");
      return;
    }
    if (/Alarma reconocida/.test(m)) {
      toast("success", "✋", `Alarma reconocida · ${who}`, m, 3500);
      return;
    }
    if ((l.level === "critical" || l.level === "warning") && /^(CRÍTICO|ALERTA|ADVERTENCIA)/.test(m)) {
      const crit = l.level === "critical";
      toast(crit ? "critical" : "warning", crit ? "🚨" : "⚠️", `${crit ? "Alarma crítica" : "Alerta"} · ${who}`, m, crit ? 8000 : 6000);
      flash(crit ? "critical" : "warning");
    }
  }

  // Vigila la bitácora: cada entrada nueva puede generar un aviso
  let seen = null;
  setInterval(() => {
    if (typeof state === "undefined" || !state.logs) return;
    const logs = state.logs;
    if (seen === null) { seen = logs[0] || "∅"; return; }
    if (logs[0] === seen || !logs.length) return;
    let idx = logs.indexOf(seen);
    if (idx < 0) idx = Math.min(3, logs.length);      // la bitácora se reinició
    const fresh = logs.slice(0, idx).reverse();
    seen = logs[0];
    fresh.slice(-4).forEach(fromLog);
  }, 300);

  // ---------- Tarjetas que saltan / se recuperan ----------
  function heal(crewId) {
    if (reduced || typeof CREW_PROFILES === "undefined") return;
    const i = CREW_PROFILES.findIndex(p => p.id === crewId);
    const card = document.querySelector(`.fleet-card[data-idx="${i}"]`);
    if (card) { card.classList.remove("anim-heal"); void card.offsetWidth; card.classList.add("anim-heal"); }
  }

  // Tarjetas de signos vitales (persisten en la página): animar al cambiar de color
  const levelOf = cls => (cls.includes("critical") ? "critical" : cls.includes("warning") ? "warning" : "nominal");
  const vitalObserver = new MutationObserver(muts => {
    if (reduced) return;
    muts.forEach(mu => {
      const el = mu.target;
      const before = levelOf(mu.oldValue || "");
      const now = levelOf(el.className);
      if (before === now) return;
      el.classList.remove("anim-pop", "anim-heal");
      void el.offsetWidth;
      el.classList.add(now === "nominal" ? "anim-heal" : "anim-pop");
    });
  });
  document.querySelectorAll(".vital-card, .expand-item").forEach(el =>
    vitalObserver.observe(el, { attributes: true, attributeFilter: ["class"], attributeOldValue: true })
  );

  // Tarjetas de la tripulación (se redibujan cada segundo): comparar su nivel con el anterior
  const fleetLevels = {};
  const fleetGrid = document.getElementById("fleetGrid");
  if (fleetGrid) {
    new MutationObserver(() => {
      if (reduced) return;
      fleetGrid.querySelectorAll(".fleet-card").forEach(card => {
        const i = card.dataset.idx;
        const lvl = levelOf(card.className);
        if (fleetLevels[i] !== undefined && fleetLevels[i] !== lvl) {
          card.classList.add(lvl === "nominal" ? "anim-heal" : "anim-pop");
        }
        fleetLevels[i] = lvl;
      });
    }).observe(fleetGrid, { childList: true });
  }

  // ---------- Transición al cambiar de pestaña ----------
  const VIEWS = ["viewBridge", "viewTelemetry", "viewMental", "viewDoppler", "viewAI", "viewLink", "viewBody", "viewEcho"];
  document.querySelectorAll(".nav-tab").forEach(t => t.addEventListener("click", () => {
    setTimeout(() => {
      const v = VIEWS.map(id => document.getElementById(id)).find(el => el && el.style.display !== "none");
      if (!v || reduced) return;
      v.classList.remove("anim-view-enter");
      void v.offsetWidth;
      v.classList.add("anim-view-enter");
    }, 30);
  }));

  // ---------- Despegue al comenzar la misión ----------
  let wasStarted = typeof missionStarted !== "undefined" ? missionStarted : true;
  setInterval(() => {
    if (typeof missionStarted === "undefined") return;
    if (!wasStarted && missionStarted && !reduced) launch();
    wasStarted = missionStarted;
  }, 200);
  function launch() {
    const crew = (typeof CREW_PROFILES !== "undefined" ? CREW_PROFILES : []).map(c => c.name).join(" · ");
    const el = document.createElement("div");
    el.className = "anim-launch";
    const stars = Array.from({ length: 26 }, () =>
      `<i style="left:${Math.random() * 100}%;top:${Math.random() * -100}%;animation-duration:${0.5 + Math.random() * 0.8}s"></i>`).join("");
    el.innerHTML = `
      <div class="anim-launch-stars">${stars}</div>
      <img class="lbdln-logo lbdln-launch" src="logo-lbdln.png" alt="LBDLN" /><div class="anim-launch-rocket">🚀</div>
      <div class="anim-launch-title">INICIANDO MISIÓN</div>
      <div class="anim-launch-sub">${esc(crew)}</div>
      <div class="anim-launch-bar"><i></i></div>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }

  // ---------- Tormenta solar ----------
  const solar = document.createElement("div");
  solar.className = "anim-solar";
  solar.innerHTML = Array.from({ length: 22 }, () =>
    `<i style="top:${Math.random() * 100}%;animation-duration:${0.9 + Math.random() * 1.4}s;animation-delay:${-Math.random() * 2}s"></i>`).join("");
  document.body.appendChild(solar);
  setInterval(() => {
    if (typeof state === "undefined" || !state.crewStates) return;
    const started = typeof missionStarted === "undefined" || missionStarted;
    const storm = started && state.crewStates.some(cs => cs.solarExposure);
    solar.classList.toggle("on", storm && !reduced);
  }, 500);
})();
