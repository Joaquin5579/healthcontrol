// =====================================================================
//  MINI GRÁFICOS EN LAS TARJETAS DE SIGNOS VITALES (pestaña Telemetría)
//  Archivo aparte: guarda los últimos valores de cada tripulante y dibuja
//  una línea chiquita debajo de cada número, con una flecha de tendencia.
//  Solo LEE los datos del SCADA; no cambia ninguna función existente.
// =====================================================================
(function () {
  const MAX = 90;   // muestras guardadas (≈ 1,5 minutos a 1 muestra por segundo)

  // id de la tarjeta → cómo leer el valor, cuánto rango mínimo mostrar y cómo escribir el cambio
  const CARDS = {
    cardHr:     { get: cs => cs.vitals.hr,           span: 8,   dec: 0, unit: "lpm" },
    cardBp:     { get: cs => cs.vitals.sys,          span: 10,  dec: 0, unit: "mmHg" },
    cardSpo2:   { get: cs => cs.vitals.spo2,         span: 3,   dec: 0, unit: "%" },
    cardTemp:   { get: cs => cs.vitals.temp,         span: 0.4, dec: 1, unit: "°C" },
    cardRr:     { get: cs => cs.vitals.rr,           span: 4,   dec: 0, unit: "rpm" },
    cardSans:   { get: cs => cs.vitals.iop,          span: 1.5, dec: 1, unit: "mmHg" },
    cardMuscle: { get: cs => cs.vitals.muscleDelta,  span: 0.3, dec: 2, unit: "%" },
    cardBone:   { get: cs => cs.vitals.boneDelta,    span: 0.2, dec: 2, unit: "%" },
    cardRad:    { get: cs => cs.vitals.radRate,      span: 12,  dec: 1, unit: "µSv/h" },
    // El sueño usa las últimas 7 noches en vez de los últimos segundos
    cardSleep:  { nights: true, span: 2, dec: 1, unit: "h" }
  };

  const buffers = [0, 1, 2].map(() => Object.fromEntries(Object.keys(CARDS).map(k => [k, []])));
  const COL = { nominal: "#1f6fd1", warning: "#d98a06", critical: "#d92d2d" };

  // Agrega un lienzo y una flecha de tendencia a cada tarjeta (una sola vez)
  const nodes = {};
  Object.keys(CARDS).forEach(id => {
    const card = document.getElementById(id);
    if (!card) return;
    const trend = document.createElement("span");
    trend.className = "spark-trend";
    card.querySelector(".vital-value").appendChild(trend);
    const canvas = document.createElement("canvas");
    canvas.className = "spark";
    card.appendChild(canvas);
    nodes[id] = { card, canvas, trend };
  });

  function sample() {
    if (typeof state === "undefined" || !state.crewStates) return;
    if (typeof missionStarted !== "undefined" && !missionStarted) return;
    state.crewStates.forEach((cs, i) => {
      if (!cs.vitals) return;
      Object.entries(CARDS).forEach(([id, def]) => {
        if (def.nights) return;
        const buf = buffers[i][id];
        buf.push(def.get(cs));
        if (buf.length > MAX) buf.shift();
      });
    });
  }

  function levelOf(card) {
    return card.classList.contains("critical") ? "critical" : card.classList.contains("warning") ? "warning" : "nominal";
  }

  function draw() {
    if (typeof state === "undefined" || state.activeView !== "telemetry") return;
    const i = state.activeCrewIndex;
    const cs = state.crewStates[i];
    if (!cs) return;
    Object.entries(nodes).forEach(([id, n]) => {
      const def = CARDS[id];
      const data = def.nights ? cs.sleepHistory7d.slice() : buffers[i][id];
      const fit = fitCanvas(n.canvas);
      if (!fit) return;
      const { ctx, w, h } = fit;
      const col = COL[levelOf(n.card)];
      ctx.clearRect(0, 0, w, h);

      if (data.length < 2) {
        ctx.strokeStyle = "rgba(90,115,147,0.35)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
        ctx.setLineDash([]);
        n.trend.textContent = "";
        return;
      }

      // Escala: el rango de los datos, con un mínimo para que el ruido no parezca un problema
      let min = Math.min(...data), max = Math.max(...data);
      if (max - min < def.span) { const mid = (max + min) / 2; min = mid - def.span / 2; max = mid + def.span / 2; }
      const pad = 3;
      const x = k => (k / (data.length - 1)) * (w - 6) + 1;
      const y = v => pad + (1 - (v - min) / (max - min)) * (h - pad * 2);

      // Relleno con degradado
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, hexToRgba(col, 0.25));
      grad.addColorStop(1, hexToRgba(col, 0.02));
      ctx.beginPath();
      data.forEach((v, k) => (k ? ctx.lineTo(x(k), y(v)) : ctx.moveTo(x(k), y(v))));
      ctx.lineTo(x(data.length - 1), h);
      ctx.lineTo(x(0), h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Línea
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = "round";
      ctx.beginPath();
      data.forEach((v, k) => (k ? ctx.lineTo(x(k), y(v)) : ctx.moveTo(x(k), y(v))));
      ctx.stroke();

      // Punto en el último valor
      const lx = x(data.length - 1), ly = y(data[data.length - 1]);
      ctx.beginPath(); ctx.arc(lx, ly, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = col; ctx.stroke();

      // Flecha de tendencia: último valor contra el promedio del primer tercio
      const first = data.slice(0, Math.max(1, Math.floor(data.length / 3)));
      const base = first.reduce((a, b) => a + b, 0) / first.length;
      const diff = data[data.length - 1] - base;
      const threshold = def.span * 0.25;
      if (Math.abs(diff) < threshold) {
        n.trend.textContent = "→ estable";
        n.trend.className = "spark-trend flat";
      } else {
        const up = diff > 0;
        n.trend.textContent = `${up ? "▲" : "▼"} ${up ? "+" : ""}${diff.toFixed(def.dec)}`;
        n.trend.className = `spark-trend ${up ? "up" : "down"}`;
      }
      n.trend.title = def.nights ? "Cambio respecto a las primeras noches de la semana" : "Cambio en el último minuto y medio";
    });
  }

  setInterval(() => { sample(); draw(); }, 1000);
  // Redibujar al cambiar de tripulante o de pestaña, sin esperar al siguiente segundo
  document.addEventListener("pointerdown", () => setTimeout(draw, 60), true);
  window.addEventListener("resize", draw);
})();
