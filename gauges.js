// =====================================================================
//  MEDIDORES CIRCULARES (anillos de progreso)
//  Archivo aparte: agrega anillos a los datos más importantes y los
//  actualiza cada segundo. Solo LEE los datos del SCADA.
//   - Telemetría: oxígeno (SpO₂), sueño de anoche y dosis acumulada.
//   - Salud mental: índice de bienestar y sueño promedio.
//   - Tarjetas de la tripulación: riesgo de la IA de cada tripulante.
// =====================================================================
(function () {
  const R = 15.9155;                 // radio para que la circunferencia mida 100
  const clamp = v => Math.max(0, Math.min(1, v));

  function ringSvg(cls) {
    return `<svg viewBox="0 0 36 36" class="ring ${cls || ""}" aria-hidden="true">
      <circle class="ring-track" cx="18" cy="18" r="${R}"/>
      <circle class="ring-fill" cx="18" cy="18" r="${R}" stroke-dasharray="0 100" transform="rotate(-90 18 18)"/>
      <text class="ring-text" x="18" y="18" text-anchor="middle" dominant-baseline="central"></text>
    </svg>`;
  }
  function setRing(svg, pct, text, level) {
    if (!svg) return;
    const p = Math.round(clamp(pct) * 100);
    svg.querySelector(".ring-fill").setAttribute("stroke-dasharray", `${p} ${100 - p}`);
    svg.querySelector(".ring-text").textContent = text;
    svg.classList.remove("nominal", "warning", "critical");
    svg.classList.add(level || "nominal");
  }
  const levelOfCard = card => (card.classList.contains("critical") ? "critical" : card.classList.contains("warning") ? "warning" : "nominal");

  // ---------- Anillos dentro de las tarjetas ----------
  // id de la tarjeta → cómo calcular el porcentaje y el texto del centro
  const CARD_RINGS = {
    cardSpo2: {
      title: "Saturación de oxígeno (escala 85–100 %)",
      calc: cs => ({ pct: (cs.vitals.spo2 - 85) / 15, text: `${cs.vitals.spo2}` })
    },
    cardSleep: {
      title: "Sueño de anoche respecto a la meta de 7.5 h",
      calc: cs => { const s = cs.sleepHistory7d[cs.sleepHistory7d.length - 1]; return { pct: s / 7.5, text: `${s.toFixed(1)}h` }; }
    },
    cardRad: {
      title: "Dosis acumulada respecto al límite de carrera (600 mSv)",
      calc: cs => {
        const p = cs.vitals.radTotal / 600;
        return { pct: p, text: `${Math.round(p * 100)}%`, level: p > 0.75 ? "critical" : p > 0.5 ? "warning" : null };
      }
    },
    cardMentalIndex: {
      big: true, title: "Índice de bienestar psicológico",
      calc: cs => ({ pct: cs.psychScore / 100, text: `${cs.psychScore}` })
    },
    cardMentalSleep: {
      big: true, title: "Sueño promedio de 7 días respecto a la meta de 7.5 h",
      calc: cs => { const a = cs.sleepHistory7d.reduce((x, y) => x + y, 0) / cs.sleepHistory7d.length; return { pct: a / 7.5, text: `${a.toFixed(1)}h` }; }
    }
  };

  const cardNodes = {};
  Object.entries(CARD_RINGS).forEach(([id, def]) => {
    const card = document.getElementById(id);
    if (!card) return;
    card.classList.add("has-ring");
    if (def.big) card.classList.add("has-ring-big");
    const wrap = document.createElement("div");
    wrap.className = `ring-wrap ${def.big ? "big" : ""}`;
    wrap.title = def.title;
    wrap.innerHTML = ringSvg();
    card.appendChild(wrap);
    cardNodes[id] = { card, svg: wrap.querySelector("svg") };
  });

  function updateCards() {
    if (typeof state === "undefined" || !state.crewStates) return;
    const cs = state.crewStates[state.activeCrewIndex];
    if (!cs || !cs.vitals) return;
    Object.entries(cardNodes).forEach(([id, n]) => {
      const r = CARD_RINGS[id].calc(cs);
      setRing(n.svg, r.pct, r.text, r.level || levelOfCard(n.card));
    });
  }

  // ---------- Riesgo de la IA en las tarjetas de la tripulación ----------
  // Esas tarjetas se redibujan cada segundo, así que el anillo se vuelve a agregar cada vez.
  const fleetGrid = document.getElementById("fleetGrid");
  function decorateFleet() {
    if (!fleetGrid || typeof state === "undefined" || !state.crewStates) return;
    fleetGrid.querySelectorAll(".fleet-card").forEach(card => {
      const i = Number(card.dataset.idx);
      const cs = state.crewStates[i];
      if (!cs || !cs.ai) return;
      let wrap = card.querySelector(".ring-wrap");
      if (!wrap) {
        wrap = document.createElement("div");
        wrap.className = "ring-wrap fleet";
        wrap.title = "Riesgo predicho por la IA para las próximas 48 h";
        wrap.innerHTML = ringSvg("risk") + `<span class="ring-cap">riesgo</span>`;
        card.classList.add("has-ring");
        card.appendChild(wrap);
      }
      setRing(wrap.querySelector("svg"), cs.ai.risk / 100, `${cs.ai.risk}`, cs.ai.riskLevel);
    });
  }
  if (fleetGrid) new MutationObserver(decorateFleet).observe(fleetGrid, { childList: true });

  setInterval(() => { updateCards(); decorateFleet(); }, 1000);
  document.addEventListener("pointerdown", () => setTimeout(() => { updateCards(); decorateFleet(); }, 60), true);
  updateCards();
  decorateFleet();
})();
