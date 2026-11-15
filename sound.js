// =====================================================================
//  SONIDO DE ALARMAS
//  Archivo aparte: solo LEE el estado del SCADA (app.js). Los sonidos se
//  generan con el navegador (Web Audio API): no hay archivos de audio,
//  así que no suma peso ni necesita internet.
//
//  Comportamiento (como en un SCADA real, norma ISA-18.2):
//   - Advertencia sin reconocer: dos tonos suaves cada 6 s.
//   - Crítico sin reconocer: tres pitidos agudos cada 2 s.
//   - Al presionar ACK, esa alarma deja de sonar.
//   - Alerta anticipada de la IA: un aviso corto (una sola vez).
//   - Botón en la barra superior para silenciar o activar el sonido.
// =====================================================================
(function () {
  const KEY = "orbital_med_scada_sound_v1";
  const REPEAT = { warning: 6000, critical: 2000 };
  let muted = false;
  try { muted = localStorage.getItem(KEY) === "off"; } catch (e) {}

  let ctx = null;
  let played = 0;
  let lastPlay = 0;
  let lastLevel = "nominal";
  const lastCodes = {};
  const lastAiKeys = {};

  // ---------- Motor de audio ----------
  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  // Los navegadores solo permiten sonido después de que el usuario toca la página
  ["pointerdown", "keydown"].forEach(ev =>
    window.addEventListener(ev, () => { ensureCtx(); setTimeout(updateBtn, 50); }, { capture: true })
  );

  function tone(freq, start, dur, type = "sine", vol = 0.16) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.03);
  }

  const PATTERNS = {
    warning: t => { tone(660, t, 0.22, "triangle"); tone(523, t + 0.28, 0.32, "triangle"); },
    critical: t => { for (let i = 0; i < 3; i++) tone(988, t + i * 0.16, 0.11, "square", 0.1); },
    ai: t => { tone(784, t, 0.16, "sine", 0.12); tone(1046, t + 0.15, 0.28, "sine", 0.12); },
    on: t => { tone(523, t, 0.12, "sine", 0.1); tone(784, t + 0.1, 0.18, "sine", 0.1); }
  };

  function play(kind) {
    if (muted || !ctx || ctx.state !== "running") return false;
    PATTERNS[kind](ctx.currentTime + 0.02);
    played++;
    btn.dataset.played = played;
    return true;
  }

  // ---------- Botón en la barra superior (se agrega sin tocar el HTML existente) ----------
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "soundBtn";
  btn.className = "sound-btn";
  btn.title = "Sonido de alarmas";
  const right = document.querySelector(".topbar-right");
  right.insertBefore(btn, document.getElementById("sidebarToggle"));

  function activeAlarms() {
    if (typeof state === "undefined" || !state.crewStates) return [];
    return state.crewStates
      .map((cs, i) => ({ cs, i }))
      .filter(({ cs }) => cs.diagnosis && cs.diagnosis.level !== "nominal" && !cs.alarmAcked);
  }

  function updateBtn() {
    const alarms = activeAlarms();
    const needsTouch = !muted && (!ctx || ctx.state !== "running");
    btn.classList.toggle("muted", muted);
    btn.classList.toggle("alarming", !muted && alarms.length > 0);
    btn.classList.toggle("need", needsTouch);
    btn.textContent = muted ? "🔕 Silenciado" : needsTouch ? "🔈 Activar sonido" : alarms.length ? `🔔 Alarma (${alarms.length})` : "🔔 Sonido";
  }

  btn.addEventListener("click", () => {
    const wasWaitingTouch = btn.classList.contains("need");
    ensureCtx();
    // Si decía "Activar sonido", el clic solo lo activa (no lo silencia)
    muted = wasWaitingTouch ? false : !muted;
    try { localStorage.setItem(KEY, muted ? "off" : "on"); } catch (e) {}
    if (!muted) setTimeout(() => play("on"), 60);
    lastPlay = 0;
    updateBtn();
  });

  // ---------- Vigilancia de alarmas (cada segundo) ----------
  setInterval(() => {
    if (typeof missionStarted !== "undefined" && !missionStarted) { updateBtn(); return; }
    if (typeof state === "undefined" || !state.crewStates) return;
    const now = performance.now();

    // ¿Apareció una alarma nueva? → sonar enseguida
    let newAlarm = false;
    state.crewStates.forEach((cs, i) => {
      const code = cs.diagnosis ? cs.diagnosis.code : "";
      if (lastCodes[i] !== undefined && code !== lastCodes[i] && cs.diagnosis && cs.diagnosis.level !== "nominal") newAlarm = true;
      lastCodes[i] = code;
    });

    const alarms = activeAlarms();
    const level = alarms.some(a => a.cs.diagnosis.level === "critical") ? "critical" : alarms.length ? "warning" : "nominal";

    let sounded = false;
    if (level !== "nominal") {
      const due = now - lastPlay >= REPEAT[level];
      if (newAlarm || due || level !== lastLevel) {
        sounded = play(level);
        if (sounded || muted) lastPlay = now;
      }
    }
    lastLevel = level;

    // Alerta anticipada de la IA (una sola vez por anomalía nueva)
    state.crewStates.forEach((cs, i) => {
      const keys = cs.aiActiveKeys || [];
      const prev = lastAiKeys[i] || [];
      if (keys.some(k => !prev.includes(k)) && !sounded) sounded = play("ai");
      lastAiKeys[i] = keys.slice();
    });

    updateBtn();
  }, 1000);

  updateBtn();
})();
