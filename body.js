// =====================================================================
//  PESTAÑA 6 · MODELO ANATÓMICO
//  Archivo aparte: solo LEE los datos del SCADA (app.js) y los muestra
//  sobre una silueta del cuerpo. No cambia ninguna función existente.
// =====================================================================
(function () {
  const $ = id => document.getElementById(id);
  const ui = {
    view: $("viewBody"), figure: $("bodyFigure"), crewName: $("bodyCrewName"), summary: $("bodySummaryBadge"),
    detail: $("bodyDetail"), detailBadge: $("bodyDetailBadge"), list: $("bodyList"), navBadge: $("bodyNavBadge"),
    cmAll: $("bodyCmAll")
  };

  // Contramedidas que corresponden a cada sistema del cuerpo
  const SYS_CM = {
    musculos: ["ared", "plan"], huesos: ["ared", "calcio", "bisfo"], rinones: ["hidratacion", "calcio"],
    cerebro: ["descanso", "videollamada"], ojos: ["lbnp"], yugular: ["lbnp"], corazon: ["ared"], inmune: ["descanso", "videollamada"]
  };
  function cmButton(i, id) {
    if (!window.CM) return "";
    const def = CM.LIST[id];
    const st = CM.status(i, id);
    const cls = st.running ? "running" : st.blocked ? "blocked" : st.active ? "active" : "";
    return `<button type="button" class="cm-btn ${cls}" data-cm="${id}" ${st.ready ? "" : "disabled"}>
      <span class="cm-icon">${def.icon}</span>
      <span class="cm-text"><strong>${def.name}</strong><span>${def.effect} · ${def.durS} s</span></span>
      <span class="cm-state">${st.ready ? "Aplicar" : st.txt}</span>
    </button>`;
  }
  // Aviso cuando el tripulante está ocupado con una contramedida
  function cmBusyBanner(i) {
    if (!window.CM) return "";
    const b = CM.busy(i);
    if (!b) return "";
    return `<div class="cm-busy">
      <div class="cm-busy-top"><span>${b.def.icon} <b>${esc(firstNameOf(i))}</b> está ${b.def.doing}</span><b class="mono">${b.left} s</b></div>
      <div class="cm-busy-bar"><div style="width:${Math.round(b.progress * 100)}%"></div></div>
      <small>Las demás contramedidas se habilitan cuando termine.</small>
    </div>`;
  }
  function firstNameOf(i) {
    const n = CREW_PROFILES[i].name.split(" ");
    return n.length > 1 ? n.slice(1).join(" ") : CREW_PROFILES[i].name;
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let selected = "cerebro";
  const LVL_TXT = { nominal: "NORMAL", warning: "ADVERTENCIA", critical: "CRÍTICO" };
  const worst = (...l) => l.includes("critical") ? "critical" : l.includes("warning") ? "warning" : "nominal";
  const hasAnom = (cs, key) => !!(cs.ai && cs.ai.anomalies.some(a => a.metric.key === key));
  const anomLvl = (cs, key) => {
    const a = cs.ai && cs.ai.anomalies.find(x => x.metric.key === key);
    return !a ? "nominal" : a.severe ? "critical" : "warning";
  };
  const fmt = (v, d = 1) => Number(v).toFixed(d);

  // ---------- Silueta (SVG) ----------
  // Mitad izquierda dibujada a mano; la derecha es su espejo (x → 320 - x).
  const mirror = d => d.replace(/(-?\d+(\.\d+)?) (-?\d+(\.\d+)?)/g, (_, x, __, y) => `${320 - Number(x)} ${y}`);
  const ARM = "M108 130 Q86 138 82 172 L70 268 Q66 300 72 330 L86 332 Q90 300 94 272 L108 196 Z";
  const LEG = "M122 340 L158 340 L156 452 Q154 520 152 582 L130 582 Q128 520 124 452 Z";
  const LUNG = "M150 150 Q122 152 118 200 Q118 236 146 238 Q154 200 150 150 Z";
  const RIB = y => `M160 ${y} Q132 ${y - 6} 118 ${y + 10}`;

  const SVG = `
  <svg viewBox="0 0 320 620" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Modelo anatómico del tripulante">
    <defs>
      <linearGradient id="bSkinGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="rgba(143,193,242,0.22)"/>
        <stop offset="1" stop-color="rgba(59,139,235,0.08)"/>
      </linearGradient>
    </defs>

    <!-- PIEL / RADIACIÓN (silueta) -->
    <g class="b-sys" data-sys="piel">
      <g class="b-skin" id="bSkin">
        <ellipse cx="160" cy="62" rx="34" ry="40"/>
        <rect x="146" y="96" width="28" height="30" rx="8"/>
        <path d="M108 128 Q160 112 212 128 L224 150 Q228 230 214 300 Q210 330 200 345 L120 345 Q110 330 106 300 Q92 230 96 150 Z"/>
        <path d="${ARM}"/><path d="${mirror(ARM)}"/>
        <ellipse cx="78" cy="346" rx="9" ry="14"/><ellipse cx="242" cy="346" rx="9" ry="14"/>
        <path d="${LEG}"/><path d="${mirror(LEG)}"/>
        <ellipse cx="138" cy="590" rx="16" ry="8"/><ellipse cx="182" cy="590" rx="16" ry="8"/>
      </g>
    </g>

    <!-- MÚSCULOS -->
    <g class="b-sys" data-sys="musculos">
      <ellipse class="b-shape" cx="96" cy="196" rx="9" ry="30"/><ellipse class="b-shape" cx="224" cy="196" rx="9" ry="30"/>
      <ellipse class="b-shape" cx="140" cy="400" rx="14" ry="44"/><ellipse class="b-shape" cx="180" cy="400" rx="14" ry="44"/>
      <ellipse class="b-shape" cx="140" cy="515" rx="9" ry="32"/><ellipse class="b-shape" cx="180" cy="515" rx="9" ry="32"/>
    </g>

    <!-- HUESOS -->
    <g class="b-sys" data-sys="huesos">
      <path class="b-line" d="M160 104 L160 334" stroke-dasharray="7 3"/>
      ${[160, 176, 192, 208, 224].map(y => `<path class="b-line thin" d="${RIB(y)}"/><path class="b-line thin" d="${mirror(RIB(y))}"/>`).join("")}
      <path class="b-line" d="M118 134 L156 128"/><path class="b-line" d="M202 134 L164 128"/>
      <path class="b-line" d="M128 318 Q160 352 192 318"/>
      <path class="b-line" d="M98 150 L90 226"/><path class="b-line" d="M222 150 L230 226"/>
      <path class="b-line" d="M89 232 L79 322"/><path class="b-line" d="M231 232 L241 322"/>
      <path class="b-line" d="M141 346 L140 456"/><path class="b-line" d="M179 346 L180 456"/>
      <path class="b-line" d="M140 464 L139 572"/><path class="b-line" d="M180 464 L181 572"/>
    </g>

    <!-- PULMONES -->
    <g class="b-sys" data-sys="pulmones">
      <path class="b-shape" d="${LUNG}"/><path class="b-shape" d="${mirror(LUNG)}"/>
    </g>

    <!-- RIÑONES -->
    <g class="b-sys" data-sys="rinones">
      <ellipse class="b-shape" cx="141" cy="270" rx="8" ry="13"/><ellipse class="b-shape" cx="179" cy="270" rx="8" ry="13"/>
    </g>

    <!-- CORAZÓN -->
    <g class="b-sys" data-sys="corazon">
      <path class="b-shape" d="M170 197 C170 188 157 186 157 197 C157 207 170 213 170 222 C170 213 183 207 183 197 C183 186 170 188 170 197 Z"/>
    </g>

    <!-- SISTEMA INMUNE (ganglios) -->
    <g class="b-sys" data-sys="inmune">
      ${[[146, 112], [174, 112], [114, 150], [206, 150], [132, 330], [188, 330]].map(([x, y]) => `<circle class="b-shape" cx="${x}" cy="${y}" r="4"/>`).join("")}
    </g>

    <!-- VENA YUGULAR -->
    <g class="b-sys" data-sys="yugular">
      <path class="b-line" d="M152 98 L149 126"/><path class="b-line" d="M168 98 L171 126"/>
    </g>

    <!-- CEREBRO -->
    <g class="b-sys" data-sys="cerebro">
      <path class="b-shape" d="M134 52 Q134 26 160 25 Q186 26 186 52 Q186 62 160 62 Q134 62 134 52 Z"/>
      <path class="b-line thin" d="M160 27 L160 61"/><path class="b-line thin" d="M142 40 Q150 46 146 54"/><path class="b-line thin" d="M178 40 Q170 46 174 54"/>
    </g>

    <!-- OJOS (SANS) -->
    <g class="b-sys" data-sys="ojos">
      <circle class="b-shape" cx="147" cy="72" r="5.5"/><circle class="b-shape" cx="173" cy="72" r="5.5"/>
    </g>

    <!-- Etiquetas con líneas guía -->
    <g id="bLabels"></g>
  </svg>`;

  // Posición de cada etiqueta: [x del órgano, y, x de la etiqueta, alineación]
  const LABELS = {
    cerebro: [186, 40, 250, "start"], ojos: [178, 72, 250, "start"], yugular: [172, 112, 250, "start"],
    corazon: [183, 205, 250, "start"], pulmones: [118, 190, 70, "end"], inmune: [114, 150, 70, "end"],
    rinones: [133, 270, 70, "end"], musculos: [126, 400, 70, "end"], huesos: [182, 470, 250, "start"],
    piel: [212, 300, 250, "start"]
  };

  const SHORT = {
    cerebro: "CEREBRO", ojos: "OJOS", yugular: "YUGULAR", corazon: "CORAZÓN", pulmones: "PULMONES",
    inmune: "INMUNE", rinones: "RIÑONES", musculos: "MÚSCULOS", huesos: "HUESOS", piel: "PIEL/ADN"
  };

  // ---------- Estado de cada sistema (calculado con los datos del SCADA) ----------
  function getSystems(idx) {
    const c = CREW_PROFILES[idx];
    const cs = state.crewStates[idx];
    const v = cs.vitals;
    const st = cs.diagnosis ? cs.diagnosis.cardStates : {};
    const sleep = getSleepStats(cs);
    const co2 = cs.localCo2 || 2.8;
    const pred = id => cs.ai ? cs.ai.preds.find(p => p.title.startsWith(id)) : null;

    const brainLvl = worst(
      cs.psychScore < 65 || sleep.last < 5 ? "critical" : "nominal",
      sleep.avg < 6 || cs.psychScore < 78 || st.sleepStatus === "warning" ? "warning" : "nominal"
    );
    const immuneLvl = worst(
      st.tempStatus === "warning" ? "warning" : "nominal",
      anomLvl(cs, "temp"),
      sleep.avg < 6.5 && cs.psychScore < 78 ? "warning" : "nominal"
    );
    let kidneyLvl = v.boneDelta < -4 ? "critical" : v.boneDelta < -2.5 ? "warning" : "nominal";
    // La hidratación con citrato de potasio baja un nivel el riesgo de cálculos
    if (window.CM && CM.kidneyProtected(idx)) kidneyLvl = kidneyLvl === "critical" ? "warning" : "nominal";
    const boneP = pred("Densidad"), muscP = pred("Masa");

    return [
      {
        id: "cerebro", icon: "🧠", name: "Cerebro y sueño", hazard: "Aislamiento y confinamiento",
        level: brainLvl,
        metrics: [
          ["Sueño anoche", `${fmt(sleep.last)} h`, st.sleepStatus || "nominal"],
          ["Sueño 7 días", `${fmt(sleep.avg)} h`, sleep.avg < 6 ? "warning" : "nominal"],
          ["Bienestar", `${cs.psychScore}/100`, cs.psychScore < 65 ? "critical" : cs.psychScore < 78 ? "warning" : "nominal"],
          ["Eficiencia sueño", `${cs.sleepEfficiency}%`, cs.sleepEfficiency < 85 ? "warning" : "nominal"]
        ],
        why: brainLvl === "nominal"
          ? "Descanso y estado de ánimo dentro de lo esperado. El aislamiento todavía no muestra efectos."
          : "El encierro, la monotonía y los 16 amaneceres diarios desajustan el reloj biológico. Dormir poco reduce la atención, provoca microsueños y aumenta el riesgo de ansiedad y depresión.",
        actions: ["Luz cálida sin azul en el camarote antes de dormir.", "Horario de sueño fijo todos los días.", "Videollamada con la familia y actividades significativas.", cs.psychScore < 78 ? "Adelantar la evaluación psicológica." : "Mantener la evaluación cada 10 días."]
      },
      {
        id: "ojos", icon: "👁", name: "Ojos (SANS)", hazard: "Gravedad alterada",
        level: worst(st.sansStatus || "nominal", anomLvl(cs, "iop")),
        metrics: [["Presión ocular", `${fmt(v.iop)} mmHg`, worst(st.sansStatus || "nominal", anomLvl(cs, "iop"))], ["Límite", "21 mmHg", "nominal"]],
        why: "Sin gravedad, los líquidos suben a la cabeza y presionan la parte de atrás del ojo. Puede aplanar el globo ocular e hinchar el nervio óptico (síndrome SANS), lo que deteriora la visión.",
        actions: ["Sesión LBNP (presión negativa en piernas) para bajar los líquidos.", "Examen de agudeza visual y fondo de ojo.", "Eco-Doppler de vena yugular (pestaña 3)."]
      },
      {
        id: "yugular", icon: "🩸", name: "Circulación cefálica (vena yugular)", hazard: "Gravedad alterada",
        level: (cs.sansLevel || 0) > 0.3 || cs.clinicalScenario === "sans" ? "warning" : "nominal",
        metrics: [["Estasis venosa", cs.clinicalScenario === "sans" ? "GRADO 2" : "GRADO 1", cs.clinicalScenario === "sans" ? "warning" : "nominal"], ["Actividad", MODE_SHORT[cs.mode], "nominal"]],
        why: "En microgravedad la sangre se acumula en el cuello y la cabeza (\"cara hinchada\"). Si la vena yugular se estanca, aumenta la presión dentro del cráneo y en los ojos.",
        actions: ["Sesión LBNP preventiva.", "Controlar el flujo en el Eco-Doppler.", "Hidratación adecuada."]
      },
      {
        id: "corazon", icon: "❤", name: "Corazón y presión", hazard: "Gravedad alterada · estrés",
        level: worst(st.hrStatus || "nominal", st.bpStatus || "nominal", anomLvl(cs, "hr"), anomLvl(cs, "sys")),
        metrics: [["Frecuencia cardíaca", `${v.hr} lpm`, worst(st.hrStatus || "nominal", anomLvl(cs, "hr"))], ["Presión arterial", `${v.sys}/${v.dia}`, worst(st.bpStatus || "nominal", anomLvl(cs, "sys"))]],
        why: "Sin gravedad el corazón trabaja menos y puede perder masa. Al volver a sentir gravedad aparecen mareos y desmayos (intolerancia ortostática). El estrés del encierro también acelera el pulso.",
        actions: ["Ejercicio aeróbico diario (cinta T2).", "Reposo y ECG si el pulso sigue alto.", "Hidratación y control de presión cada 30 min si hay alerta."]
      },
      {
        id: "pulmones", icon: "🫁", name: "Pulmones y respiración", hazard: "Ambiente hostil y cerrado",
        level: worst(st.spo2Status || "nominal", st.rrStatus || "nominal", co2 > 5 ? "warning" : "nominal", anomLvl(cs, "rr")),
        metrics: [["SpO₂", `${v.spo2}%`, st.spo2Status || "nominal"], ["Respiración", `${v.rr} rpm`, st.rrStatus || "nominal"], ["CO₂ camarote", `${fmt(co2)} mmHg`, co2 > 5 ? "warning" : "nominal"]],
        why: "En la nave el aire es reciclado. Sin gravedad el CO₂ exhalado no se dispersa y puede quedar alrededor de la cara mientras se duerme, causando dolor de cabeza y mal descanso.",
        actions: ["Ventilación del camarote al máximo.", "Verificar el sistema de soporte vital (ECLSS).", "Oxígeno suplementario si la SpO₂ baja de 92%."]
      },
      {
        id: "inmune", icon: "🛡", name: "Sistema inmune", hazard: "Ambiente hostil · aislamiento",
        level: immuneLvl,
        metrics: [["Temperatura", `${fmt(v.temp)} °C`, worst(st.tempStatus || "nominal", anomLvl(cs, "temp"))], ["Riesgo viral", immuneLvl === "nominal" ? "Bajo" : "Elevado", immuneLvl]],
        why: "El estrés, la falta de sueño, la microgravedad y la radiación bajan las defensas. Eso puede \"despertar\" virus latentes (herpes zóster, Epstein-Barr) que estaban dormidos en el cuerpo.",
        actions: ["Mejorar el sueño y bajar el estrés.", "Análisis de saliva (cortisol y virus).", "Revisar la piel por ampollas, ardor u hormigueo."]
      },
      {
        id: "rinones", icon: "🫘", name: "Riñones", hazard: "Gravedad alterada",
        level: kidneyLvl,
        metrics: [["Calcio liberado (hueso)", `${formatDelta(v.boneDelta)}%`, kidneyLvl], ["Riesgo de cálculos", kidneyLvl === "nominal" ? "Bajo" : kidneyLvl === "warning" ? "Moderado" : "Alto", kidneyLvl]],
        why: "Al perder hueso, el calcio pasa a la sangre y luego a la orina. Junto con la deshidratación, eso favorece cálculos renales muy dolorosos durante la misión.",
        actions: ["Beber al menos 2.5 L de agua al día.", "Citrato de potasio si el riesgo es moderado.", "Reforzar el ejercicio de carga para frenar la pérdida ósea."]
      },
      {
        id: "musculos", icon: "💪", name: "Músculos", hazard: "Gravedad alterada",
        level: st.muscleStatus || "nominal",
        metrics: [["Masa muscular", `${formatDelta(v.muscleDelta)}%`, st.muscleStatus || "nominal"], ["Ritmo", `${c.orbit.muscleRatePerMonth}%/mes`, "nominal"], ["Llega a -5%", muscP ? muscP.value : "—", muscP ? muscP.level : "nominal"]],
        why: "Sin peso que sostener, los músculos de piernas y espalda se atrofian rápido. Eso reduce la fuerza para caminatas espaciales y para el regreso a la gravedad.",
        actions: ["Ejercicio de resistencia diario (ARED).", "Aumentar la carga si la pérdida se acelera.", "Dieta con suficiente proteína."]
      },
      {
        id: "huesos", icon: "🦴", name: "Huesos", hazard: "Gravedad alterada",
        level: st.boneStatus || "nominal",
        metrics: [["Densidad ósea", `${formatDelta(v.boneDelta)}%`, st.boneStatus || "nominal"], ["Ritmo", `${c.orbit.boneRatePerMonth}%/mes`, "nominal"], ["Llega a -3%", boneP ? boneP.value : "—", boneP ? boneP.level : "nominal"]],
        why: "Sin el impacto de caminar, el cuerpo destruye hueso más rápido de lo que lo forma: se pierde entre 1% y 1.5% por mes en cadera, piernas y columna, con riesgo de fracturas.",
        actions: ["Ejercicio de impacto y carga (ARED).", "Calcio y vitamina D.", "Bifosfonatos si la pérdida supera el umbral."]
      },
      {
        id: "piel", icon: "☢", name: "Piel y ADN (radiación)", hazard: "Radiación",
        level: worst(cs.solarExposure ? "critical" : "nominal", st.radStatus || "nominal", anomLvl(cs, "radRate"), v.radTotal > 600 ? "critical" : v.radTotal > 450 ? "warning" : "nominal"),
        metrics: [["Tasa actual", `${fmt(v.radRate)} µSv/h`, worst(st.radStatus || "nominal", anomLvl(cs, "radRate"))], ["Dosis acumulada", `${fmt(v.radTotal)} mSv`, v.radTotal > 450 ? "warning" : "nominal"], ["Blindaje", c.shieldFactor > 1 ? "Reducido" : "Alto", c.shieldFactor > 1 ? "warning" : "nominal"]],
        why: "Los rayos cósmicos y las tormentas solares atraviesan el cuerpo y rompen el ADN. En dosis altas causan náuseas y quemaduras; a largo plazo, cataratas y mayor riesgo de cáncer.",
        actions: [cs.solarExposure ? "PERMANECER EN EL REFUGIO BLINDADO." : "Descansar en zonas con más blindaje (agua, polietileno).", "Registrar la dosis en el dosímetro personal.", "Antioxidantes en la dieta (vitaminas C y E)."]
      }
    ];
  }

  // ---------- Dibujo y actualización ----------
  ui.figure.innerHTML = SVG;
  const svg = ui.figure.querySelector("svg");
  const labelsG = svg.querySelector("#bLabels");

  function render() {
    const idx = state.activeCrewIndex;
    const c = CREW_PROFILES[idx];
    if (!state.crewStates[idx] || !state.crewStates[idx].diagnosis) return;
    const systems = getSystems(idx);
    const byId = Object.fromEntries(systems.map(s => [s.id, s]));

    ui.crewName.textContent = `${c.name.toUpperCase()} (${c.id})`;

    // Colorear cada sistema en la silueta
    svg.querySelectorAll(".b-sys").forEach(g => {
      const s = byId[g.dataset.sys];
      g.classList.remove("nominal", "warning", "critical", "selected");
      g.classList.add(s.level);
      if (s.id === selected) g.classList.add("selected");
    });
    const skin = svg.querySelector("#bSkin");
    skin.classList.remove("warning", "critical");
    if (byId.piel.level !== "nominal") skin.classList.add(byId.piel.level);

    // Etiquetas con líneas guía
    labelsG.innerHTML = systems.map(s => {
      const [ox, oy, lx, anchor] = LABELS[s.id];
      const tx = anchor === "start" ? lx + 3 : lx - 3;
      return `<path class="b-leader" d="M${ox} ${oy} L${lx} ${oy}"/>
        <text class="b-label ${s.level}" x="${tx}" y="${oy + 3}" text-anchor="${anchor}">${SHORT[s.id]}${s.level !== "nominal" ? " !" : ""}</text>`;
    }).join("");

    // Resumen
    const bad = systems.filter(s => s.level !== "nominal");
    const crit = bad.some(s => s.level === "critical");
    ui.summary.textContent = bad.length ? `${bad.length} SISTEMA(S) AFECTADO(S)` : "TODOS LOS SISTEMAS NORMALES";
    ui.summary.className = `badge ${bad.length ? (crit ? "crit-badge" : "warn-badge") : "ok-badge"}`;
    ui.navBadge.style.display = bad.length ? "inline-block" : "none";
    ui.navBadge.textContent = bad.length;

    // Detalle del sistema seleccionado
    const s = byId[selected] || systems[0];
    ui.detailBadge.textContent = LVL_TXT[s.level];
    ui.detailBadge.className = `badge ${s.level === "critical" ? "crit-badge" : s.level === "warning" ? "warn-badge" : "ok-badge"}`;
    ui.detail.innerHTML = `
      <div class="bd-head">
        <div class="bd-icon ${s.level}">${s.icon}</div>
        <div><div class="bd-title">${s.name}</div><div class="bd-hazard">Peligro del vuelo espacial: <b>${s.hazard}</b></div></div>
      </div>
      <div class="bd-metrics">${s.metrics.map(([l, val, lv]) => `<div class="bd-metric ${lv}"><span>${l.toUpperCase()}</span><strong class="mono">${val}</strong></div>`).join("")}</div>
      <div class="bd-block"><h4>¿QUÉ LE PASA AL CUERPO?</h4><p>${s.why}</p></div>
      <div class="bd-block actions"><h4>${s.level === "nominal" ? "PREVENCIÓN" : "QUÉ HACER AHORA"}</h4><ul>${s.actions.map(a => `<li>${a}</li>`).join("")}</ul></div>
      ${(SYS_CM[s.id] || []).length ? `<div class="bd-block cm-block"><h4>APLICAR CONTRAMEDIDA</h4>${cmBusyBanner(idx)}<div class="cm-grid">${SYS_CM[s.id].map(id => cmButton(idx, id)).join("")}</div></div>` : ""}`;

    // Todas las contramedidas del tripulante
    ui.cmAll.innerHTML = window.CM ? cmBusyBanner(idx) + Object.keys(CM.LIST).map(id => cmButton(idx, id)).join("") : "";

    // Lista de sistemas (los afectados primero)
    const order = { critical: 0, warning: 1, nominal: 2 };
    ui.list.innerHTML = systems.slice().sort((a, b) => order[a.level] - order[b.level]).map(x => `
      <button type="button" class="bl-item ${x.level} ${x.id === selected ? "selected" : ""}" data-sys="${x.id}">
        <span class="bl-icon">${x.icon}</span>
        <span class="bl-text"><strong>${x.name}</strong><span>${x.hazard}</span></span>
        <span class="bl-status">${LVL_TXT[x.level]}</span>
      </button>`).join("");
  }

  // ---------- Eventos ----------
  const pick = id => { selected = id; render(); };
  svg.addEventListener("pointerdown", e => {
    const g = e.target.closest(".b-sys");
    if (g) pick(g.dataset.sys);
  });
  // Aplicar una contramedida (desde el detalle del órgano o desde la lista completa)
  const onCm = e => {
    const b = e.target.closest("[data-cm]");
    if (!b || b.disabled || !window.CM) return;
    if (CM.apply(state.activeCrewIndex, b.dataset.cm)) render();
  };
  ui.detail.addEventListener("pointerdown", onCm);
  ui.cmAll.addEventListener("pointerdown", onCm);

  ui.list.addEventListener("pointerdown", e => {
    const b = e.target.closest("[data-sys]");
    if (b) pick(b.dataset.sys);
  });

  // Mostrar/ocultar sin tocar la navegación existente
  function syncView() {
    const show = state.activeView === "body";
    ui.view.style.display = show ? "grid" : "none";
    if (show) render();
  }
  document.querySelectorAll(".nav-tab").forEach(t => t.addEventListener("click", () => setTimeout(syncView, 0)));
  // Al tocar otro tripulante en las tarjetas de arriba, actualizar el modelo
  document.getElementById("fleetGrid").addEventListener("pointerdown", () => setTimeout(() => { if (state.activeView === "body") render(); }, 0));

  setInterval(() => {
    if ((state.activeView === "body") !== (ui.view.style.display !== "none")) syncView();
    if (state.activeView === "body") render();
    else {
      // mantener el contador del menú al día aunque la pestaña no esté abierta
      const idx = state.activeCrewIndex;
      if (state.crewStates[idx] && state.crewStates[idx].diagnosis) {
        const bad = getSystems(idx).filter(s => s.level !== "nominal").length;
        ui.navBadge.style.display = bad ? "inline-block" : "none";
        ui.navBadge.textContent = bad;
      }
    }
  }, 1000);

  syncView();
})();
