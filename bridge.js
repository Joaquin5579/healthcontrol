// =====================================================================
//  PUENTE DE MANDO: los 3 tripulantes de un vistazo
//  Archivo aparte: solo LEE los datos del SCADA y los resume en una
//  pantalla tipo centro de control. No cambia ninguna función existente.
// =====================================================================
(function () {
  const $ = id => document.getElementById(id);
  const ui = { view: $("viewBridge"), summary: $("bridgeSummary"), crew: $("bridgeCrew"), badge: $("bridgeNavBadge") };
  if (!ui.view) return;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ROLES = [
    { name: "Comandante de misión", cls: "cmd" },
    { name: "Ingeniero/a de vuelo", cls: "eng" },
    { name: "Especialista de misión", cls: "spec" }
  ];
  const HOME = ["Destiny · Laboratorio", "Destiny · Laboratorio", "Quest · Esclusa"];
  const PLACE = { refugio: "Zvezda · Refugio blindado", ejercicio: "Tranquility · Gimnasio", sueno: "Harmony · Camarotes", eva: "Exterior · Caminata espacial" };
  const DOING = {
    reposo: ["🧑‍🚀", "En reposo"], sueno: ["😴", "Durmiendo"], ejercicio: ["🏋", "Haciendo ejercicio"],
    eva: ["🛰", "Caminata espacial"], refugio: ["🛡", "En el refugio blindado"]
  };
  const SPARK = [
    { k: "hr", label: "Pulso", unit: "lpm", card: "hrStatus", get: cs => cs.vitals.hr, span: 8, dec: 0 },
    { k: "spo2", label: "Oxígeno", unit: "%", card: "spo2Status", get: cs => cs.vitals.spo2, span: 3, dec: 0 },
    { k: "rr", label: "Respiración", unit: "rpm", card: "rrStatus", get: cs => cs.vitals.rr, span: 4, dec: 0 },
    { k: "temp", label: "Temperatura", unit: "°C", card: "tempStatus", get: cs => cs.vitals.temp, span: 0.4, dec: 1 }
  ];
  const MAX = 90;
  const buffers = [0, 1, 2].map(() => Object.fromEntries(SPARK.map(s => [s.k, []])));
  const R = 15.9155;
  const ring = (k, label) => `
    <div class="br-ring" data-ring="${k}">
      <svg viewBox="0 0 36 36" class="ring"><circle class="ring-track" cx="18" cy="18" r="${R}"/>
        <circle class="ring-fill" cx="18" cy="18" r="${R}" stroke-dasharray="0 100" transform="rotate(-90 18 18)"/>
        <text class="ring-text" x="18" y="18" text-anchor="middle" dominant-baseline="central"></text></svg>
      <span>${label}</span>
    </div>`;

  // ---------- Construir las 3 tarjetas una sola vez ----------
  function build() {
    ui.crew.innerHTML = [0, 1, 2].map(i => `
      <article class="br-card" data-i="${i}">
        <header class="br-head">
          <div class="br-avatar ${ROLES[i].cls}"><span data-f="initials">—</span></div>
          <div class="br-id">
            <strong data-f="name">—</strong>
            <span data-f="role">${ROLES[i].name}</span>
          </div>
          <span class="badge" data-f="status">—</span>
        </header>

        <div class="br-now">
          <div class="br-now-item"><span class="br-now-ico" data-f="doingIco">🧑‍🚀</span><div><small>ACTIVIDAD</small><b data-f="doing">—</b></div></div>
          <div class="br-now-item"><span class="br-now-ico">📍</span><div><small>UBICACIÓN</small><b data-f="place">—</b></div></div>
        </div>

        <div class="br-rings">${ring("risk", "Riesgo IA")}${ring("well", "Bienestar")}${ring("sleep", "Sueño")}</div>

        <div class="br-vitals">
          ${SPARK.map(s => `
            <div class="br-vital" data-v="${s.k}">
              <div class="br-vital-top"><span>${s.label}</span><b class="mono" data-f="val-${s.k}">—</b></div>
              <canvas class="br-spark" data-c="${s.k}"></canvas>
            </div>`).join("")}
        </div>

        <div class="br-alerts" data-f="alerts"></div>

        <footer class="br-actions">
          <button type="button" data-go="telemetry">📈 Telemetría</button>
          <button type="button" data-go="body">🫀 Cuerpo</button>
          <button type="button" data-go="ai">🤖 IA</button>
        </footer>
      </article>`).join("");
  }
  build();

  const q = (i, sel) => ui.crew.querySelector(`.br-card[data-i="${i}"] ${sel}`);
  function setRing(el, pct, text, level) {
    const p = Math.round(Math.max(0, Math.min(1, pct)) * 100);
    el.querySelector(".ring-fill").setAttribute("stroke-dasharray", `${p} ${100 - p}`);
    el.querySelector(".ring-text").textContent = text;
    const svg = el.querySelector("svg");
    svg.classList.remove("nominal", "warning", "critical");
    svg.classList.add(level);
  }
  const levelOf = (v, warn, crit, lowerIsBad) =>
    lowerIsBad ? (v < crit ? "critical" : v < warn ? "warning" : "nominal") : (v > crit ? "critical" : v > warn ? "warning" : "nominal");

  // ---------- Muestras para los mini gráficos ----------
  function sample() {
    state.crewStates.forEach((cs, i) => {
      if (!cs.vitals) return;
      SPARK.forEach(s => {
        const b = buffers[i][s.k];
        b.push(s.get(cs));
        if (b.length > MAX) b.shift();
      });
    });
  }
  function drawSpark(canvas, data, span, color) {
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const { ctx, w, h } = fit;
    ctx.clearRect(0, 0, w, h);
    if (data.length < 2) return;
    let min = Math.min(...data), max = Math.max(...data);
    if (max - min < span) { const m = (max + min) / 2; min = m - span / 2; max = m + span / 2; }
    const x = k => (k / (data.length - 1)) * (w - 4) + 1;
    const y = v => 2 + (1 - (v - min) / (max - min)) * (h - 4);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, hexToRgba(color, 0.28));
    grad.addColorStop(1, hexToRgba(color, 0.02));
    ctx.beginPath();
    data.forEach((v, k) => (k ? ctx.lineTo(x(k), y(v)) : ctx.moveTo(x(k), y(v))));
    ctx.lineTo(x(data.length - 1), h); ctx.lineTo(x(0), h); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = "round";
    ctx.beginPath();
    data.forEach((v, k) => (k ? ctx.lineTo(x(k), y(v)) : ctx.moveTo(x(k), y(v))));
    ctx.stroke();
  }
  const COL = { nominal: "#3b8beb", warning: "#e5a02f", critical: "#ef5050" };

  // ---------- Actualizar el puente ----------
  function render() {
    if (typeof state === "undefined" || !state.crewStates) return;
    let unacked = 0, affected = 0;

    CREW_PROFILES.forEach((c, i) => {
      const cs = state.crewStates[i];
      if (!cs || !cs.diagnosis) return;
      const d = cs.diagnosis;
      const card = ui.crew.querySelector(`.br-card[data-i="${i}"]`);
      const ai = cs.ai || { risk: 0, riskLevel: "nominal", anomalies: [] };
      const level = d.level !== "nominal" ? d.level : ai.anomalies.length ? "warning" : "nominal";
      card.className = `br-card ${level} ${i === state.activeCrewIndex ? "active" : ""}`;
      if (level !== "nominal") affected++;
      if (d.level !== "nominal" && !cs.alarmAcked) unacked++;

      // Identidad
      const parts = c.name.split(" ").slice(1);
      q(i, '[data-f="name"]').textContent = parts.join(" ") || c.name;
      q(i, '[data-f="initials"]').textContent = parts.map(p => p[0] || "").join("").slice(0, 2).toUpperCase() || (i + 1);
      q(i, '[data-f="role"]').textContent = `${ROLES[i].name}${c.age ? " · " + c.age + " años" : ""} · ${c.id}`;
      const st = q(i, '[data-f="status"]');
      st.textContent = d.shortStatus;
      st.className = `badge ${d.level === "critical" ? "crit-badge" : d.level === "warning" ? "warn-badge" : "ok-badge"}`;

      // Actividad (si está haciendo una contramedida, se muestra eso)
      const busy = window.CM ? CM.busy(i) : null;
      const doing = busy ? [busy.def.icon, `${busy.def.name} · ${busy.left} s`] : (DOING[cs.mode] || ["🧑‍🚀", cs.mode]);
      q(i, '[data-f="doingIco"]').textContent = doing[0];
      q(i, '[data-f="doing"]').textContent = doing[1];
      q(i, '[data-f="place"]').textContent = PLACE[cs.mode] || HOME[i];

      // Anillos
      const sleep = cs.sleepHistory7d[cs.sleepHistory7d.length - 1];
      setRing(q(i, '[data-ring="risk"]'), ai.risk / 100, `${ai.risk}`, ai.riskLevel);
      setRing(q(i, '[data-ring="well"]'), cs.psychScore / 100, `${cs.psychScore}`, levelOf(cs.psychScore, 78, 65, true));
      setRing(q(i, '[data-ring="sleep"]'), sleep / 7.5, `${sleep.toFixed(1)}h`, levelOf(sleep, 6, 5, true));

      // Signos con mini gráfico
      SPARK.forEach(s => {
        const lvl = (d.cardStates || {})[s.card] || "nominal";
        const val = s.get(cs);
        const vEl = q(i, `[data-f="val-${s.k}"]`);
        vEl.textContent = `${Number(val).toFixed(s.dec)} ${s.unit}`;
        vEl.className = `mono ${lvl}`;
        drawSpark(q(i, `[data-c="${s.k}"]`), buffers[i][s.k], s.span, COL[lvl]);
      });

      // Alertas activas
      const alerts = [];
      if (d.level !== "nominal") alerts.push({ lvl: d.level, txt: d.title + (cs.alarmAcked ? " · reconocida" : "") });
      Object.entries(d.cardStates || {}).forEach(([k, v]) => {
        if (v === "nominal") return;
        const names = { muscleStatus: "Masa muscular baja", boneStatus: "Densidad ósea baja", sleepStatus: "Sueño insuficiente", sansStatus: "Presión ocular alta", radStatus: "Radiación alta", tempStatus: "Temperatura alta", bpStatus: "Presión arterial fuera de rango", rrStatus: "Respiración fuera de rango", hrStatus: "Pulso fuera de rango", spo2Status: "Oxígeno bajo" };
        if (names[k] && !alerts.some(a => a.txt.toLowerCase().includes(names[k].split(" ")[0].toLowerCase()))) alerts.push({ lvl: v, txt: names[k] });
      });
      ai.anomalies.forEach(a => alerts.push({ lvl: "ai", txt: `IA: ${a.metric.label} fuera de su patrón` }));
      q(i, '[data-f="alerts"]').innerHTML = alerts.length
        ? alerts.slice(0, 4).map(a => `<div class="br-alert ${a.lvl}">${a.lvl === "ai" ? "🤖" : a.lvl === "critical" ? "🚨" : "⚠"} ${esc(a.txt)}</div>`).join("") +
          (alerts.length > 4 ? `<div class="br-alert more">+${alerts.length - 4} más</div>` : "")
        : `<div class="br-alert ok">✓ Sin alertas</div>`;
    });

    // Resumen de misión
    const day = Math.floor(getMissionDays());
    let delay = "—";
    try {
      const L = JSON.parse(localStorage.getItem("orbital_med_scada_link_v1") || "null");
      const dest = L ? L.dest : "mars";
      const s = dest === "iss" ? 0.6 : dest === "moon" ? 1.28 : ((L ? L.marsDistMkm : 225) * 1e6) / 299792.458;
      delay = s < 60 ? `${s.toFixed(1)} s` : `${Math.round(s / 60)} min`;
      delay = `${dest === "iss" ? "ISS" : dest === "moon" ? "Luna" : "Marte"} · ${delay}`;
    } catch (e) {}
    const inc = state.activeIncident;
    const nominal = CREW_PROFILES.length - affected;
    ui.summary.innerHTML = `
      <div class="br-sum"><small>DÍA DE MISIÓN</small><b class="mono">${day}</b></div>
      <div class="br-sum ${nominal === CREW_PROFILES.length ? "ok" : "warn"}"><small>TRIPULACIÓN NORMAL</small><b class="mono">${nominal}/${CREW_PROFILES.length}</b></div>
      <div class="br-sum ${unacked ? "crit" : "ok"}"><small>ALARMAS SIN RECONOCER</small><b class="mono">${unacked}</b></div>
      <div class="br-sum ${inc ? "warn" : ""}"><small>INCIDENTE EN CURSO</small><b>${inc ? esc(inc.title) : "Ninguno"}</b></div>
      <div class="br-sum"><small>📡 ENLACE CON LA TIERRA</small><b>${esc(delay)}</b></div>`;

    ui.badge.style.display = affected ? "inline-block" : "none";
    ui.badge.textContent = affected;
  }

  // ---------- Botones: ir al detalle de ese tripulante ----------
  ui.crew.addEventListener("click", e => {
    const b = e.target.closest("[data-go]");
    const card = e.target.closest(".br-card");
    if (!card) return;
    const i = Number(card.dataset.i);
    selectCrew(i);
    if (b) {
      const tab = document.querySelector(`.nav-tab[data-view="${b.dataset.go}"]`);
      if (tab) tab.click();
    } else render();
  });

  // ---------- Mostrar/ocultar sin tocar la navegación existente ----------
  function sync() {
    const show = state.activeView === "bridge";
    ui.view.style.display = show ? "flex" : "none";
    if (show) render();
  }
  document.querySelectorAll(".nav-tab").forEach(t => t.addEventListener("click", () => setTimeout(sync, 0)));

  setInterval(() => {
    if (typeof state === "undefined" || !state.crewStates) return;
    if ((state.activeView === "bridge") !== (ui.view.style.display !== "none")) sync();
    if (typeof missionStarted !== "undefined" && missionStarted) sample();
    if (state.activeView === "bridge") render();
    else {
      // mantener el contador del menú al día
      const n = state.crewStates.filter(cs => cs.diagnosis && (cs.diagnosis.level !== "nominal" || (cs.ai && cs.ai.anomalies.length))).length;
      ui.badge.style.display = n ? "inline-block" : "none";
      ui.badge.textContent = n;
    }
  }, 1000);
  sync();
})();
