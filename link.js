// =====================================================================
//  PESTAÑA 5 · ENLACE CON LA TIERRA (retardo de comunicación)
//  Archivo aparte: solo LEE el estado del SCADA (app.js), no cambia
//  ninguna función existente. Guarda sus datos en su propia clave.
// =====================================================================
(function () {
  const LINK_KEY = "orbital_med_scada_link_v1";
  const LIGHT_KM_S = 299792.458;
  const HOUSTON_PROCESSING_S = 5 * 60;   // tiempo que Houston tarda en analizar y responder
  const DESTINATIONS = {
    iss:  { label: "Órbita terrestre (ISS)", oneWay: () => 0.6, distKm: () => 400, bw: "300 Mbps · TDRS" },
    moon: { label: "Luna", oneWay: () => 384400 / LIGHT_KM_S, distKm: () => 384400, bw: "50 Mbps · DSN" },
    mars: { label: "Marte", oneWay: s => (s.marsDistMkm * 1e6) / LIGHT_KM_S, distKm: s => s.marsDistMkm * 1e6, bw: "2 Mbps · DSN banda Ka" }
  };

  function defaultLinkState() {
    return { dest: "mars", marsDistMkm: 225, speed: 10, clock: 0, nextId: 1, messages: [], lastCodes: {} };
  }
  let link = defaultLinkState();
  try {
    const saved = JSON.parse(localStorage.getItem(LINK_KEY) || "null");
    if (saved && typeof saved === "object") link = { ...defaultLinkState(), ...saved };
  } catch (e) {}
  const saveLink = () => { try { localStorage.setItem(LINK_KEY, JSON.stringify(link)); } catch (e) {} };

  const $ = id => document.getElementById(id);
  const ui = {
    view: $("viewLink"), badge: $("linkNavBadge"), status: $("linkStatusBadge"),
    destSeg: $("linkDestSeg"), distControl: $("linkDistControl"), distRange: $("linkDistRange"), distLabel: $("linkDistLabel"),
    speedSeg: $("linkSpeedSeg"),
    statDist: $("linkStatDist"), statOne: $("linkStatOneWay"), statRound: $("linkStatRound"), statBw: $("linkStatBw"),
    canvas: $("linkCanvas"), compare: $("linkCompare"),
    messages: $("linkMessages"), queueBadge: $("linkQueueBadge"),
    form: $("linkCompose"), type: $("linkMsgType"), crew: $("linkMsgCrew"), text: $("linkMsgText")
  };

  const oneWay = () => DESTINATIONS[link.dest].oneWay(link);

  function fmtDur(s) {
    s = Math.max(0, s);
    if (s < 10) return `${s.toFixed(1)} s`;
    if (s < 60) return `${Math.round(s)} s`;
    if (s < 3600) { const m = Math.floor(s / 60), r = Math.round(s % 60); return r ? `${m} min ${r} s` : `${m} min`; }
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return `${h} h ${m} min`;
  }
  function fmtDist(km) {
    if (km < 1e6) return `${Math.round(km).toLocaleString("es")} km`;
    return `${Math.round(km / 1e6)} M km`;
  }
  const crewName = i => CREW_PROFILES[i] ? CREW_PROFILES[i].name : `Tripulante ${i + 1}`;
  const crewFirst = i => (typeof crewIdentities !== "undefined" && crewIdentities[i]) ? crewIdentities[i].nombre : crewName(i);

  // ---------- Mensajes ----------
  function enqueue(msg) {
    const now = link.clock;
    const travel = oneWay();
    link.messages.push({ id: link.nextId++, sentAt: now, arriveAt: now + travel, replied: false, ...msg });
    if (link.messages.length > 40) link.messages.splice(0, link.messages.length - 40);
    saveLink();
  }

  function houstonReply(m, reply) {
    const name = crewName(m.crew);
    // Tiempo real desde el envío original hasta que la respuesta llega a la nave
    const lag = fmtDur((reply ? reply.arriveAt : link.clock + oneWay()) - m.sentAt);
    switch (m.type) {
      case "alerta":
        return `Houston: Recibimos la alerta «${m.title}» de ${name}. Cuando lean esta respuesta habrán pasado ${lag} desde el evento: confirmen el resultado del protocolo que aplicaron a bordo.`;
      case "reporte":
        return `Houston: Reporte médico de ${name} recibido y archivado. Coincidimos con las medidas tomadas a bordo. Próxima revisión en el siguiente pase de comunicaciones.`;
      case "contramedida":
        return `Houston: Recibido el reporte de ${name}: «${m.title}» aplicada a bordo hace ${lag}. Conforme con el protocolo de la tripulación y la IA clínica. Seguiremos su evolución en los próximos reportes.`;
      case "consulta":
        return `Houston: Respondemos su consulta («${m.text.slice(0, 60)}${m.text.length > 60 ? "…" : ""}»). Sigan el criterio de la IA clínica de a bordo; si la situación cambió en estos ${lag}, prioricen su evaluación local.`;
      case "familia":
        return `Familia de ${crewFirst(m.crew)}: ¡Recibimos tu mensaje! Te extrañamos mucho y estamos muy orgullosos. Cuídate y descansa. ❤`;
      default:
        return "Houston: Mensaje recibido.";
    }
  }

  function processQueue() {
    link.messages.forEach(m => {
      // Un mensaje de la nave llega a la Tierra → Houston/familia procesa y responde
      if (m.dir === "out" && !m.replied && link.clock >= m.arriveAt) {
        m.replied = true;
        const replyAt = m.arriveAt + (m.type === "familia" ? 15 * 60 : HOUSTON_PROCESSING_S);
        link.messages.push({
          id: link.nextId++, dir: "in", type: m.type, crew: m.crew,
          from: m.type === "familia" ? `Familia de ${crewFirst(m.crew)}` : "Houston · Control de Misión",
          text: "", replyTo: m.id, sentAt: replyAt, arriveAt: replyAt + oneWay(), pendingText: true
        });
      }
      if (m.dir === "in" && m.pendingText && link.clock >= m.sentAt) {
        const orig = link.messages.find(x => x.id === m.replyTo) || m;
        m.text = houstonReply(orig, m);
        m.pendingText = false;
      }
      if (m.dir === "in" && !m.logged && link.clock >= m.arriveAt && !m.pendingText) {
        m.logged = true;
        if (typeof addLog === "function") addLog("TIERRA", `Mensaje recibido de ${m.from} (${fmtDur(m.arriveAt - (link.messages.find(x => x.id === m.replyTo) || m).sentAt)} después del envío).`, "info");
      }
    });
  }

  // Las alarmas nuevas del SCADA se envían solas a Houston (solo se LEE el diagnóstico).
  // Cada contramedida aplicada a bordo se reporta sola a Houston
  window.addEventListener("cm-complete", e => {
    const d = e.detail || {};
    const detail = d.changes && d.changes.length ? d.changes.join(", ") : d.effect;
    enqueue({
      dir: "out", type: "contramedida", auto: true, crew: d.crew, title: d.name,
      text: `REPORTE AUTOMÁTICO · ${crewName(d.crew)}: contramedida ${d.icon} ${d.name} aplicada a bordo (${detail}). Decisión de la tripulación con la IA clínica.`
    });
    renderBadge();
    if (state.activeView === "link") renderLinkView();
  });

  function watchAlarms() {
    if (typeof state === "undefined" || !state.crewStates) return;
    state.crewStates.forEach((cs, i) => {
      const d = cs.diagnosis;
      if (!d) return;
      const prev = link.lastCodes[i];
      if (prev !== undefined && d.code !== prev && d.level !== "nominal") {
        enqueue({ dir: "out", type: "alerta", auto: true, crew: i, title: d.title, text: `ALERTA AUTOMÁTICA · ${crewName(i)}: ${d.title}. ${d.desc}` });
      }
      link.lastCodes[i] = d.code;
    });
  }

  // ---------- Reloj propio del enlace ----------
  let lastTickReal = performance.now();
  setInterval(() => {
    // Si otra parte del SCADA cambió de vista (por ejemplo "Reiniciar misión"), mantener la pestaña sincronizada
    if ((state.activeView === "link") !== (ui.view.style.display !== "none")) syncView();
    if (typeof missionStarted !== "undefined" && !missionStarted) { lastTickReal = performance.now(); return; }
    link.clock += link.speed;
    lastTickReal = performance.now();
    watchAlarms();
    processQueue();
    saveLink();
    renderBadge();
    if (state.activeView === "link") renderLinkView();
  }, 1000);
  const smoothClock = () => link.clock + Math.min(1, (performance.now() - lastTickReal) / 1000) * link.speed;

  // ---------- Interfaz ----------
  function renderBadge() {
    const transit = link.messages.filter(m => link.clock < m.arriveAt).length;
    ui.badge.style.display = transit ? "inline-block" : "none";
    ui.badge.textContent = transit;
    ui.queueBadge.textContent = `${transit} EN TRÁNSITO`;
    ui.queueBadge.className = `badge ${transit ? "warn-badge" : ""}`;
  }

  function renderControls() {
    ui.destSeg.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.dest === link.dest));
    ui.speedSeg.querySelectorAll("button").forEach(b => b.classList.toggle("active", Number(b.dataset.speed) === link.speed));
    ui.distControl.classList.toggle("disabled", link.dest !== "mars");
    ui.distRange.value = link.marsDistMkm;
    ui.distLabel.textContent = `${link.marsDistMkm} M km`;
  }

  function renderStats() {
    const ow = oneWay();
    ui.statDist.textContent = fmtDist(DESTINATIONS[link.dest].distKm(link));
    ui.statOne.textContent = fmtDur(ow);
    ui.statRound.textContent = fmtDur(ow * 2);
    ui.statBw.textContent = DESTINATIONS[link.dest].bw;
    const slow = ow * 2 > 60;
    ui.status.textContent = slow ? `ENLACE ACTIVO · RETARDO ${fmtDur(ow)}` : "ENLACE ACTIVO · CASI INSTANTÁNEO";
    ui.status.className = `badge ${slow ? "warn-badge" : "ok-badge"}`;

    const local = 0.001;
    const earth = ow * 2 + HOUSTON_PROCESSING_S;
    const logScale = s => Math.max(2, Math.min(100, (Math.log10(s) + 3) / (Math.log10(3 * 3600) + 3) * 100));
    ui.compare.innerHTML = `
      <div class="link-bar-row">
        <div class="link-bar-name">IA clínica a bordo<small>detecta y recomienda en la nave</small></div>
        <div class="link-bar-track"><div class="link-bar-fill local" style="width:${logScale(local)}%"></div></div>
        <div class="link-bar-value mono">~1 ms</div>
      </div>
      <div class="link-bar-row">
        <div class="link-bar-name">Respuesta de Houston<small>ida + análisis (5 min) + vuelta</small></div>
        <div class="link-bar-track"><div class="link-bar-fill earth ${earth > 900 ? "slow" : ""}" style="width:${logScale(earth)}%"></div></div>
        <div class="link-bar-value mono">${fmtDur(earth)}</div>
      </div>
      <div class="link-compare-note">
        ${link.dest === "mars"
          ? `Desde Marte, una emergencia tendría que esperar <b>${fmtDur(earth)}</b> por la respuesta de la Tierra. La IA de a bordo responde <b>${Math.round(earth / local).toLocaleString("es")} veces más rápido</b>: por eso la tripulación debe ser autónoma.`
          : `Desde ${DESTINATIONS[link.dest].label.toLowerCase()} el retardo es bajo, pero la IA de a bordo sigue respondiendo antes de que el mensaje llegue a la Tierra.`}
        <br><small>Escala logarítmica.</small>
      </div>`;
  }

  function renderMessages() {
    const now = link.clock;
    const visible = link.messages.filter(m => m.dir === "out" || now >= m.sentAt);
    if (!visible.length) {
      ui.messages.innerHTML = `<div class="link-empty">Todavía no hay mensajes.<br>Envía uno abajo o espera una alarma: se enviará sola a Houston.</div>`;
      return;
    }
    const atBottom = ui.messages.scrollHeight - ui.messages.scrollTop - ui.messages.clientHeight < 30;
    ui.messages.innerHTML = visible.map(m => {
      const total = Math.max(0.001, m.arriveAt - m.sentAt);
      const progress = Math.max(0, Math.min(1, (now - m.sentAt) / total));
      const arrived = now >= m.arriveAt;
      const typeTxt = { alerta: "ALERTA AUTOMÁTICA", reporte: "REPORTE MÉDICO", consulta: "CONSULTA", familia: "MENSAJE FAMILIAR", contramedida: "CONTRAMEDIDA APLICADA" }[m.type] || "MENSAJE";
      let status;
      if (m.dir === "out") {
        if (!arrived) status = `<div class="link-msg-status transit">En tránsito a la Tierra · llega en ${fmtDur(m.arriveAt - now)}<div class="link-progress"><div style="width:${progress * 100}%"></div></div></div>`;
        else {
          const reply = link.messages.find(x => x.replyTo === m.id);
          status = reply && now >= reply.arriveAt
            ? `<div class="link-msg-status done">✓ Entregado · respuesta recibida</div>`
            : `<div class="link-msg-status waiting">✓ Entregado en la Tierra · esperando respuesta${reply ? ` (llega en ${fmtDur(reply.arriveAt - now)})` : ""}</div>`;
        }
        return `<div class="link-msg out ${m.auto ? "auto" : ""}">
          <div class="link-msg-head"><span>NAVE → ${m.type === "familia" ? "FAMILIA" : "HOUSTON"} · ${typeTxt}</span><span>${escapeHtml(crewName(m.crew))}</span></div>
          <div class="link-msg-text">${escapeHtml(m.text)}</div>${status}</div>`;
      }
      // Mensajes de la Tierra: solo se leen cuando terminan de llegar
      if (!arrived) {
        return `<div class="link-msg in ${m.type === "familia" ? "family" : ""}">
          <div class="link-msg-head"><span>${escapeHtml(m.from)} → NAVE</span><span>${typeTxt}</span></div>
          <div class="link-msg-status transit">Respuesta en camino · llega en ${fmtDur(m.arriveAt - now)}<div class="link-progress"><div style="width:${progress * 100}%"></div></div></div></div>`;
      }
      return `<div class="link-msg in ${m.type === "familia" ? "family" : ""}">
        <div class="link-msg-head"><span>${escapeHtml(m.from)} → NAVE</span><span>RECIBIDO</span></div>
        <div class="link-msg-text">${escapeHtml(m.text)}</div></div>`;
    }).join("");
    if (atBottom) ui.messages.scrollTop = ui.messages.scrollHeight;
  }

  function renderCrewOptions() {
    const current = ui.crew.value;
    ui.crew.innerHTML = CREW_PROFILES.map((c, i) => `<option value="${i}">${escapeHtml(c.name)} (${c.id})</option>`).join("");
    ui.crew.value = current || String(state.activeCrewIndex || 0);
  }

  function renderLinkView() {
    renderControls();
    renderStats();
    renderMessages();
    renderBadge();
  }

  // ---------- Diagrama animado Tierra ↔ nave ----------
  function drawLink() {
    if (state.activeView !== "link") return;
    const fit = fitCanvas(ui.canvas);
    if (!fit) return;
    const { ctx, w, h } = fit;
    const t = performance.now() / 1000;
    const now = smoothClock();
    const ex = 70, sx = w - 70, cy = h / 2 + 6;

    ctx.clearRect(0, 0, w, h);
    // estrellas fijas
    for (let i = 0; i < 70; i++) {
      const x = (i * 97.13) % w, y = (i * 53.71) % h;
      ctx.fillStyle = `rgba(220,235,255,${0.15 + ((i * 7) % 10) / 25})`;
      ctx.fillRect(x, y, 1.3, 1.3);
    }
    // trayectoria
    ctx.strokeStyle = "rgba(143,193,242,0.35)";
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ex + 30, cy); ctx.lineTo(sx - 22, cy); ctx.stroke();
    ctx.setLineDash([]);

    // Tierra
    const g = ctx.createRadialGradient(ex - 8, cy - 10, 4, ex, cy, 30);
    g.addColorStop(0, "#9fd8ff"); g.addColorStop(0.55, "#2f7fd6"); g.addColorStop(1, "#0d3a78");
    ctx.save(); ctx.shadowColor = "#5aaeff"; ctx.shadowBlur = 18;
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, cy, 28, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = "rgba(120,200,140,0.55)";
    ctx.beginPath(); ctx.ellipse(ex - 6, cy - 4, 9, 6, 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex + 9, cy + 9, 6, 4, -0.4, 0, Math.PI * 2); ctx.fill();

    // Nave
    ctx.save();
    ctx.translate(sx, cy);
    ctx.fillStyle = "#e9f2fc";
    ctx.fillRect(-10, -6, 20, 12);
    ctx.fillStyle = "#3b8beb";
    ctx.fillRect(-30, -4, 16, 8); ctx.fillRect(14, -4, 16, 8);
    ctx.fillStyle = "#c4dff8"; ctx.fillRect(-3, -12, 6, 6);
    ctx.restore();
    // antena pulsando
    const pulse = (t % 2) / 2;
    ctx.strokeStyle = `rgba(127,212,255,${0.6 * (1 - pulse)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx, cy, 18 + pulse * 26, 0, Math.PI * 2); ctx.stroke();

    // etiquetas
    ctx.font = "700 11px Inter, 'Segoe UI', sans-serif";
    ctx.fillStyle = "#e9f2fc";
    ctx.textAlign = "center";
    ctx.fillText("TIERRA · HOUSTON", ex, cy + 48);
    ctx.fillText(`NAVE · ${DESTINATIONS[link.dest].label.toUpperCase()}`, sx, cy + 48);
    ctx.font = "600 10px 'JetBrains Mono', Consolas, monospace";
    ctx.fillStyle = "#8fc1f2";
    ctx.fillText(`${fmtDist(DESTINATIONS[link.dest].distKm(link))} · la luz tarda ${fmtDur(oneWay())}`, w / 2, 20);
    ctx.textAlign = "left";

    // Señales en tránsito
    const x0 = sx - 22, x1 = ex + 30;
    link.messages.forEach(m => {
      if (now < m.sentAt || now >= m.arriveAt) return;
      const p = (now - m.sentAt) / Math.max(0.001, m.arriveAt - m.sentAt);
      const fromShip = m.dir === "out";
      const x = fromShip ? x0 + (x1 - x0) * p : x1 + (x0 - x1) * p;
      const y = cy + (fromShip ? -9 : 9);
      const col = m.type === "alerta" ? "#ffb547" : m.type === "familia" ? "#c9a7ff" : m.type === "contramedida" ? "#5ee0c8" : fromShip ? "#7fd4ff" : "#7ff0b5";
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = 12;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // estela
      const tail = ctx.createLinearGradient(x, 0, x + (fromShip ? 40 : -40), 0);
      tail.addColorStop(0, hexToRgba(col, 0.6)); tail.addColorStop(1, hexToRgba(col, 0));
      ctx.strokeStyle = tail; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (fromShip ? 40 : -40), y); ctx.stroke();
      ctx.font = "600 9px 'JetBrains Mono', Consolas, monospace";
      ctx.fillStyle = col;
      ctx.textAlign = "center";
      ctx.fillText(fmtDur(m.arriveAt - now), x, y + (fromShip ? -10 : 18));
      ctx.textAlign = "left";
    });
  }
  function linkLoop() { drawLink(); requestAnimationFrame(linkLoop); }
  requestAnimationFrame(linkLoop);

  // ---------- Eventos ----------
  ui.destSeg.addEventListener("click", e => {
    const b = e.target.closest("[data-dest]");
    if (!b) return;
    link.dest = b.dataset.dest;
    saveLink(); renderLinkView();
  });
  ui.speedSeg.addEventListener("click", e => {
    const b = e.target.closest("[data-speed]");
    if (!b) return;
    link.speed = Number(b.dataset.speed);
    saveLink(); renderLinkView();
  });
  ui.distRange.addEventListener("input", () => {
    link.marsDistMkm = Number(ui.distRange.value);
    saveLink(); renderControls(); renderStats();
  });
  ui.type.addEventListener("change", () => {
    ui.text.placeholder = ui.type.value === "familia" ? "Escribe un mensaje para tu familia…" : "Escribe el mensaje…";
  });
  ui.form.addEventListener("submit", e => {
    e.preventDefault();
    const text = ui.text.value.trim();
    if (!text) { ui.text.focus(); return; }
    const crew = Number(ui.crew.value || 0);
    enqueue({ dir: "out", type: ui.type.value, crew, text });
    if (typeof addLog === "function") addLog(CREW_PROFILES[crew].id, `Mensaje enviado a la Tierra (llega en ${fmtDur(oneWay())}).`, "info");
    ui.text.value = "";
    renderLinkView();
    ui.messages.scrollTop = ui.messages.scrollHeight;
  });

  // Mostrar/ocultar la pestaña sin tocar la navegación existente:
  // switchView() ya marca la pestaña activa y oculta las demás vistas.
  function syncView() {
    const show = state.activeView === "link";
    ui.view.style.display = show ? "grid" : "none";
    if (show) { renderCrewOptions(); renderLinkView(); }
  }
  document.querySelectorAll(".nav-tab").forEach(t => t.addEventListener("click", () => setTimeout(syncView, 0)));

  // Inicio
  watchAlarms();
  renderBadge();
  syncView();
})();
