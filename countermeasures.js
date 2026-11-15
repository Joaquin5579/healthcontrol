// =====================================================================
//  CONTRAMEDIDAS: el ciclo completo  detectar → recomendar → ACTUAR → mejorar
//  Archivo aparte. Cada contramedida cambia los datos del tripulante en el
//  SCADA (músculo, hueso, sueño, bienestar...) y queda anotada en la bitácora.
//
//  - Cada contramedida es una ACTIVIDAD que dura un tiempo. Mientras está en
//    curso, el tripulante está OCUPADO y no puede hacer otra (no se puede dormir
//    y estar en una videollamada al mismo tiempo). El efecto se aplica al terminar.
//  - Después de terminar, la misma actividad tiene un tiempo de espera.
//  - Los programas de 30 días frenan la pérdida mientras están activos.
// =====================================================================
(function () {
  const REAL_COOLDOWN_MS = 30000;   // en la demo, una acción se puede repetir a los 30 s reales...
  const DAY = 86400;                // ...o cuando pasa su tiempo de espera en horas de misión

  const clamp0 = v => Math.min(0, v);
  // durS = duración de la actividad (segundos reales en la demo) · doing = qué está haciendo
  // mode = modo fisiológico mientras dura (cambia pulso, respiración, etc. en el SCADA)
  const LIST = {
    ared: {
      icon: "🏋", name: "Sesión de ejercicio ARED", effect: "+0.5% músculo · +0.2% hueso", cdH: 12,
      durS: 15, doing: "haciendo ejercicio en el ARED", mode: "ejercicio",
      apply: cs => { cs.vitals.muscleDelta = clamp0(cs.vitals.muscleDelta + 0.5); cs.vitals.boneDelta = clamp0(cs.vitals.boneDelta + 0.2); }
    },
    calcio: {
      icon: "💊", name: "Calcio + vitamina D", effect: "+0.15% hueso", cdH: 24,
      durS: 3, doing: "tomando el suplemento",
      apply: cs => { cs.vitals.boneDelta = clamp0(cs.vitals.boneDelta + 0.15); }
    },
    hidratacion: {
      icon: "💧", name: "Hidratación + citrato de potasio", effect: "Protege los riñones 7 días", cdH: 24,
      durS: 3, doing: "hidratándose",
      apply: cs => { cs.cm.kidneyUntil = state.metSeconds + 7 * DAY; }
    },
    descanso: {
      icon: "😴", name: "Descanso de recuperación", effect: "+1.5 h de sueño", cdH: 12,
      durS: 20, doing: "durmiendo", mode: "sueno",
      apply: cs => {
        const arr = cs.sleepHistory7d;
        arr[arr.length - 1] = +Math.min(8.5, arr[arr.length - 1] + 1.5).toFixed(1);
      }
    },
    videollamada: {
      icon: "📞", name: "Videollamada con la familia", effect: "+6 bienestar", cdH: 24,
      durS: 15, doing: "en videollamada con su familia",
      apply: cs => { cs.psychScore = Math.min(95, cs.psychScore + 6); }
    },
    lbnp: {
      icon: "🛡", name: "Sesión LBNP (presión negativa)", effect: "Baja la presión ocular", cdH: 8,
      durS: 10, doing: "en la sesión LBNP",
      apply: cs => { cs.sansLevel = Math.max(0, (cs.sansLevel || 0) - 0.6); if (cs.clinicalScenario === "sans") cs.clinicalScenario = "normal"; }
    },
    plan: {
      icon: "📋", name: "Plan de ejercicio intensivo", effect: "30 días: −70% pérdida muscular, −40% ósea", program: true, days: 30,
      durS: 3, doing: "revisando su nuevo plan con el oficial médico",
      apply: cs => { cs.cm.planUntil = state.metSeconds + 30 * DAY; }
    },
    bisfo: {
      icon: "💉", name: "Tratamiento con bifosfonatos", effect: "30 días: −50% pérdida ósea", program: true, days: 30,
      durS: 3, doing: "recibiendo la primera dosis",
      apply: cs => { cs.cm.bisfoUntil = state.metSeconds + 30 * DAY; }
    }
  };

  function cmOf(cs) {
    if (!cs.cm) cs.cm = { last: {} };
    if (!cs.cm.last) cs.cm.last = {};
    return cs.cm;
  }

  // Actividad en curso del tripulante (o null)
  function busy(i) {
    const cs = state.crewStates[i];
    const b = cs.cm && cs.cm.busy;
    if (!b) return null;
    const def = LIST[b.id];
    const left = Math.max(0, Math.ceil((b.endReal - Date.now()) / 1000));
    return { id: b.id, def, left, total: def.durS, progress: Math.min(1, 1 - left / def.durS) };
  }

  function status(i, id) {
    const cs = state.crewStates[i];
    const cm = cmOf(cs);
    const def = LIST[id];
    const met = state.metSeconds;
    const b = busy(i);
    if (b) {
      if (b.id === id) return { ready: false, running: true, txt: `En curso · ${b.left} s` };
      return { ready: false, blocked: true, txt: "Ocupado" };
    }
    if (def.program) {
      const until = id === "plan" ? cm.planUntil : cm.bisfoUntil;
      if (until && until > met) return { ready: false, active: true, txt: `Activo · quedan ${Math.ceil((until - met) / DAY)} días` };
      return { ready: true, txt: "Disponible" };
    }
    const last = cm.last[id];
    if (!last) return { ready: true, txt: "Disponible" };
    const realLeft = REAL_COOLDOWN_MS - (Date.now() - last.real);
    const metLeft = def.cdH * 3600 - (met - last.met);
    if (realLeft <= 0 || metLeft <= 0) return { ready: true, txt: "Disponible" };
    return { ready: false, txt: `Disponible en ${Math.ceil(realLeft / 1000)} s` };
  }

  // Actualiza la pantalla. Si cambió la actividad (dormir, ejercicio...), los signos vitales
  // recién se recalculan en el próximo segundo de simulación: evaluarlos ahora daría falsas alarmas.
  function refreshScada(i, modeChanged) {
    if (!modeChanged) evaluateCrewDiagnosis(i);
    renderFleetBar();
    renderActiveCrewDetails();
    saveState();
  }

  // Empieza la actividad: el tripulante queda ocupado hasta que termine
  function apply(i, id) {
    const def = LIST[id];
    if (!def || typeof state === "undefined") return false;
    const cs = state.crewStates[i];
    if (!status(i, id).ready) return false;
    const cm = cmOf(cs);
    cm.busy = { id, startReal: Date.now(), endReal: Date.now() + def.durS * 1000 };
    if (def.mode && cs.mode !== "refugio" && cs.mode !== "eva") {
      cm.busy.prevMode = cs.mode;
      cm.busy.setMode = def.mode;
      cs.mode = def.mode;
    }
    addLog(CREW_PROFILES[i].id, `Inicia contramedida: ${def.icon} ${def.name} (${def.durS} s). El tripulante está ${def.doing}.`, "info");
    refreshScada(i, !!cm.busy.setMode);
    return true;
  }

  // Termina la actividad: se aplica el efecto y se libera al tripulante
  function finish(i) {
    const cs = state.crewStates[i];
    const cm = cmOf(cs);
    const b = cm.busy;
    if (!b) return;
    const def = LIST[b.id];
    const before = { m: cs.vitals.muscleDelta, b: cs.vitals.boneDelta, s: cs.sleepHistory7d[cs.sleepHistory7d.length - 1], p: cs.psychScore };
    def.apply(cs);
    // Volver a la actividad anterior (salvo que una emergencia lo haya movido, p. ej. al refugio)
    let modeChanged = false;
    if (b.setMode && cs.mode === b.setMode) { cs.mode = b.prevMode || "reposo"; modeChanged = true; }
    cm.busy = null;
    cm.last[b.id] = { met: state.metSeconds, real: Date.now() };
    const changes = [];
    if (cs.vitals.muscleDelta !== before.m) changes.push(`músculo ${formatDelta(before.m)}% → ${formatDelta(cs.vitals.muscleDelta)}%`);
    if (cs.vitals.boneDelta !== before.b) changes.push(`hueso ${formatDelta(before.b)}% → ${formatDelta(cs.vitals.boneDelta)}%`);
    const sNow = cs.sleepHistory7d[cs.sleepHistory7d.length - 1];
    if (sNow !== before.s) changes.push(`sueño ${before.s} h → ${sNow} h`);
    if (cs.psychScore !== before.p) changes.push(`bienestar ${before.p} → ${cs.psychScore}`);
    addLog(CREW_PROFILES[i].id, `✓ Contramedida completada: ${def.icon} ${def.name}${changes.length ? " (" + changes.join(", ") + ")" : " · " + def.effect}.`, "info");
    refreshScada(i, modeChanged);
    // Aviso para el enlace con la Tierra: la contramedida se reporta a Houston
    window.dispatchEvent(new CustomEvent("cm-complete", {
      detail: { crew: i, id: b.id, icon: def.icon, name: def.name, effect: def.effect, changes }
    }));
  }

  function kidneyProtected(i) {
    const cs = state.crewStates[i];
    return !!(cs.cm && cs.cm.kidneyUntil && cs.cm.kidneyUntil > state.metSeconds);
  }

  // ---------- Bucle: terminar actividades y aplicar programas de 30 días ----------
  let lastMet = null;
  setInterval(() => {
    if (typeof state === "undefined" || (typeof missionStarted !== "undefined" && !missionStarted)) return;

    // Actividades que ya terminaron
    state.crewStates.forEach((cs, i) => {
      if (cs.cm && cs.cm.busy && Date.now() >= cs.cm.busy.endReal) finish(i);
    });

    // Programas: frenan la pérdida mientras corre la misión
    const met = state.metSeconds;
    if (lastMet === null || met < lastMet) { lastMet = met; return; }
    const dt = Math.min(2 * DAY, met - lastMet);
    lastMet = met;
    if (dt <= 0) return;
    const months = dt / (30 * DAY);
    CREW_PROFILES.forEach((c, i) => {
      const cs = state.crewStates[i];
      if (!cs.cm) return;
      const plan = cs.cm.planUntil && cs.cm.planUntil > met;
      const bisfo = cs.cm.bisfoUntil && cs.cm.bisfoUntil > met;
      if (plan) cs.vitals.muscleDelta = clamp0(cs.vitals.muscleDelta - c.orbit.muscleRatePerMonth * months * 0.7);
      const boneFrac = Math.min(0.8, (plan ? 0.4 : 0) + (bisfo ? 0.5 : 0));
      if (boneFrac) cs.vitals.boneDelta = clamp0(cs.vitals.boneDelta - c.orbit.boneRatePerMonth * months * boneFrac);
    });
  }, 500);

  window.CM = { LIST, status, apply, busy, kidneyProtected };
})();
