// =====================================================================
//  ECOCARDIOGRAMA DOPPLER COLOR (pestaña 4)
//  Archivo aparte: es una pestaña NUEVA; la pestaña 3 (Eco-Doppler de la
//  vena yugular y la carótida) queda exactamente como estaba.
//   - Imagen 2D simulada, vista apical de 4 cámaras, con el corazón latiendo
//     a la frecuencia cardíaca real del tripulante.
//   - Doppler color con la convención BART (rojo = hacia el transductor,
//     azul = se aleja) y aliasing en las velocidades altas.
//   - Doppler espectral: mitral (PW) y aórtico (CW), con ECG sincronizado.
//   - Mediciones y hallazgos que dependen de los datos del tripulante.
//  Solo LEE los datos del SCADA.
// =====================================================================
(function () {
  const host = document.getElementById("viewEcho");     // pestaña propia: la pestaña 3 queda como estaba
  if (!host || typeof state === "undefined") return;

  const IW = 640, IH = 500;           // tamaño lógico de la imagen del eco
  const SW = 640, SH = 200;           // tamaño lógico del Doppler espectral
  const OX = 320, OY = -60;           // vértice del sector (transductor)
  const SECTOR_R = 620, HALF = 50 * Math.PI / 180;
  const PX_CM = 0.031;                // centímetros por píxel
  const VMAX = 0.6;                   // velocidad máxima de la escala de color (m/s)
  const SPEED = 160;                  // píxeles por segundo del espectro

  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const gauss = (x, mu, sg, a) => a * Math.exp(-((x - mu) ** 2) / (2 * sg * sg));

  // ---------- Panel nuevo (se agrega al final de la pestaña) ----------
  const panel = document.createElement("section");
  panel.className = "panel echo-panel";
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>ECOCARDIOGRAMA DOPPLER COLOR · VISTA APICAL DE 4 CÁMARAS</h2>
        <p class="subtitle" style="margin-top:1px;">Ventrículos, aurículas y flujo a través de las válvulas · imagen simulada con los datos del tripulante</p>
      </div>
      <span class="badge" id="echoBadge">FEVI —</span>
    </div>
    <div class="echo-controls">
      <div class="echo-seg" id="echoCrew"></div>
      <div class="echo-seg" id="echoMode">
        <button type="button" data-mode="color" class="active">Doppler color</button>
        <button type="button" data-mode="bmode">Modo 2D</button>
      </div>
      <div class="echo-seg" id="echoWin">
        <button type="button" data-win="mitral" class="active">Mitral (PW)</button>
        <button type="button" data-win="aortic">Aórtico (CW)</button>
      </div>
    </div>
    <div class="echo-grid">
      <div class="echo-left">
        <div class="echo-screen"><canvas id="echoCanvas"></canvas></div>
        <div class="echo-screen"><canvas id="echoSpec"></canvas></div>
      </div>
      <div class="echo-right">
        <div class="echo-table" id="echoTable"></div>
        <div class="echo-findings" id="echoFindings"></div>
        <p class="echo-note">Imagen simulada con fines demostrativos. Rojo: flujo que se acerca al transductor · Azul: flujo que se aleja. Las zonas amarillas o verdes indican velocidades altas (aliasing y turbulencia).</p>
      </div>
    </div>`;
  host.appendChild(panel);

  const $ = id => panel.querySelector("#" + id);
  const cvE = $("echoCanvas"), cvS = $("echoSpec");
  const ui = { badge: $("echoBadge"), crew: $("echoCrew"), mode: $("echoMode"), win: $("echoWin"), table: $("echoTable"), finds: $("echoFindings") };
  let mode = "color", win = "mitral";

  // ---------- Textura de ruido (speckle) ----------
  const noise = document.createElement("canvas");
  noise.width = 360; noise.height = 290;
  (function () {
    const x = noise.getContext("2d"), im = x.createImageData(noise.width, noise.height);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = 70 + Math.random() * 150;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
  })();

  // ---------- Fisiología del tripulante ----------
  function physio(i) {
    const cs = state.crewStates[i], v = cs.vitals;
    const hr = clamp(v.hr, 35, 200);
    const days = getMissionDays();
    const massLoss = 0.16 * (1 - Math.exp(-days / 200));          // la masa del VI baja con los meses en 0g
    const ex = cs.mode === "ejercicio", sl = cs.mode === "sueno";
    let ef = 0.62 + (ex ? 0.05 : 0) - (hr > 150 ? 0.05 : 0) - massLoss * 0.12 - (sl ? 0.01 : 0);
    if (v.spo2 < 94) ef -= 0.03;
    const edv = 120 * (1 - massLoss * 0.3) * (hr > 120 ? 0.86 : 1) * (sl ? 1.05 : 1);
    const sv = edv * ef;
    return {
      hr, massLoss, ef, edv, sv, ex, sl, days,
      co: sv * hr / 1000,
      E: 0.82 + 0.0012 * (hr - 60),
      A: Math.max(0.22, 0.48 - 0.0025 * (hr - 60)),
      vao: 1.1 + 0.0035 * (hr - 60),
      mass: 150 * (1 - massLoss)
    };
  }

  // Valores suavizados para que la imagen no salte cuando cambia la frecuencia
  const sm = { hr: 60, ef: 0.62, E: 0.82, A: 0.48, vao: 1.1 };
  let phase = 0, lastT = 0, lastSlow = 0, noiseJx = 0, noiseJy = 0, noiseT = 0;

  const systoleFraction = hr => {
    const ts = Math.max(0.22, 0.33 - 0.0012 * (hr - 60));
    return Math.min(0.62, ts * hr / 60);
  };
  const fill = d => 0.72 * ease(d / 0.45) + 0.28 * ease((d - 0.82) / 0.18);

  // ---------- Geometría de las cámaras en cada instante del ciclo ----------
  function geom() {
    const fs = systoleFraction(sm.hr);
    const sys = phase < fs;
    const s = sys ? phase / fs : 1;
    const d = sys ? 0 : (phase - fs) / (1 - fs);
    const vol = ef => (sys ? 1 - ef * ease(s) : (1 - ef) + ef * fill(d));
    const vLV = vol(sm.ef), vRV = vol(0.36);
    const laFill = sys ? 0.15 + 0.85 * ease(s) : Math.max(0.15, 1 - 0.85 * ease(d / 0.4));

    const lv = { apex: 64 };
    lv.len = 250 * (0.84 + 0.16 * vLV); lv.base = lv.apex + lv.len;
    lv.ax = 78 * (0.62 + 0.38 * vLV); lv.cx = 326 + lv.ax; lv.cy = lv.apex + lv.len / 2; lv.ay = lv.len / 2;

    const rv = { apex: 80 };
    rv.len = 228 * (0.88 + 0.12 * vRV); rv.base = rv.apex + rv.len;
    rv.ax = 64 * (0.66 + 0.34 * vRV); rv.cx = 314 - rv.ax; rv.cy = rv.apex + rv.len / 2; rv.ay = rv.len / 2;

    const BOT = 444;
    const la = { top: lv.base - 6 }; la.ax = 66 * (0.9 + 0.16 * laFill); la.cx = 326 + la.ax; la.ay = (BOT - la.top) / 2; la.cy = (BOT + la.top) / 2;
    const ra = { top: rv.base - 6 }; ra.ax = 62 * (0.9 + 0.16 * laFill); ra.cx = 314 - ra.ax; ra.ay = (BOT - ra.top) / 2; ra.cy = (BOT + ra.top) / 2;

    // Velocidades del flujo en este instante (m/s)
    const Ew = sm.E * Math.sin(Math.PI * clamp(d / 0.45, 0, 1));
    const Aw = sm.A * Math.sin(Math.PI * clamp((d - 0.82) / 0.18, 0, 1));
    const M = sys ? 0 : Ew + Aw + (d > 0.45 && d < 0.82 ? 0.07 : 0);
    const S = sys ? sm.vao * Math.pow(Math.sin(Math.PI * s), 0.8) : 0;

    // Válvulas: abiertas en diástole, cerradas en sístole
    const openAV = sys ? (s < 0.05 ? 1 - s / 0.05 : 0) : clamp(d / 0.05, 0, 1);
    return { fs, sys, s, d, lv, rv, la, ra, M, S, openAV, vLV, aoY: lv.base + 14 };
  }

  // ---------- Dibujo ----------
  const sectorPath = ctx => { ctx.beginPath(); ctx.moveTo(OX, OY); ctx.arc(OX, OY, SECTOR_R, Math.PI / 2 - HALF, Math.PI / 2 + HALF); ctx.closePath(); };
  const ellipse = (ctx, c) => { ctx.beginPath(); ctx.ellipse(c.cx, c.cy, c.ax, c.ay, 0, 0, Math.PI * 2); };

  function leaflets(ctx, xa, xb, y, open) {
    const mid = (xa + xb) / 2;
    ctx.save();
    ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(230,235,245,0.95)"; ctx.shadowColor = "rgba(230,240,255,0.7)"; ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(xa, y); ctx.lineTo(lerp(mid, xa + 8, open), y - open * 30);
    ctx.moveTo(xb, y); ctx.lineTo(lerp(mid, xb - 8, open), y - open * 24);
    ctx.stroke();
    ctx.restore();
  }

  function flowColor(v) {
    let u = v / VMAX;
    if (u > 1) u -= 2; else if (u < -1) u += 2;            // aliasing: la velocidad "da la vuelta"
    const mix = (a, b, t) => `${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))}`;
    if (u >= 0) return u < 0.5 ? mix([60, 0, 0], [235, 35, 25], u / 0.5) : mix([235, 35, 25], [255, 225, 80], (u - 0.5) / 0.5);
    const t = -u;
    return t < 0.5 ? mix([0, 0, 60], [25, 95, 240], t / 0.5) : mix([25, 95, 240], [120, 240, 255], (t - 0.5) / 0.5);
  }

  // Velocidad del flujo en un punto (m/s). Positivo = hacia el transductor (rojo).
  function flowAt(x, y, g) {
    const inside = c => { const dx = (x - c.cx) / (c.ax * 0.88), dy = (y - c.cy) / (c.ay * 0.94); return dx * dx + dy * dy < 1; };
    if (inside(g.lv)) {
      const L = g.lv;
      if (g.sys) {   // eyección hacia la aorta: se aleja (azul)
        const wy = 0.3 + 0.7 * Math.exp(-(L.base - y) / (L.len * 0.35));
        const wx = Math.exp(-(((x - (326 + L.ax * 0.5)) / (L.ax * 0.6)) ** 2));
        return -g.S * wy * wx;
      }
      const wy = Math.exp(-(L.base - y) / (L.len * 0.55));
      const wx = Math.exp(-(((x - L.cx) / (L.ax * 0.55)) ** 2));
      return g.M * wy * wx;                  // llenado desde la válvula mitral hacia el ápex: se acerca (rojo)
    }
    if (inside(g.rv)) {
      const R = g.rv;
      if (g.sys) {
        const wy = 0.3 + 0.7 * Math.exp(-(R.base - y) / (R.len * 0.35));
        return -g.S * 0.5 * wy * Math.exp(-(((x - (R.cx + R.ax * 0.3)) / (R.ax * 0.6)) ** 2));
      }
      return g.M * 0.62 * Math.exp(-(R.base - y) / (R.len * 0.55)) * Math.exp(-(((x - R.cx) / (R.ax * 0.55)) ** 2));
    }
    const atrium = (c, k) => {
      if (!inside(c)) return null;
      if (g.sys) return k * 0.3 * Math.sin(Math.PI * g.s) * Math.exp(-((c.top + c.ay * 2 - y) / (c.ay * 0.6))) * Math.exp(-(((x - c.cx) / (c.ax * 0.9)) ** 2));
      return k * g.M * 0.8 * Math.exp(-((y - c.top) / (c.ay * 0.7))) * Math.exp(-(((x - c.cx) / (c.ax * 0.6)) ** 2));
    };
    const a1 = atrium(g.la, 1); if (a1 !== null) return a1;
    const a2 = atrium(g.ra, 0.7); if (a2 !== null) return a2;
    // raíz de la aorta: sale el flujo de la sístole (azul)
    const dx = (x - 318) / 16, dy = (y - g.aoY) / 22;
    if (dx * dx + dy * dy < 1) return g.sys ? -g.S * 0.9 : 0;
    return null;
  }

  function drawEcho(t) {
    const fit = fitCanvas(cvE);
    if (!fit) return;
    const ctx = fit.ctx;
    ctx.setTransform(cvE.width / IW, 0, 0, cvE.height / IH, 0, 0);
    const g = geom();
    ctx.fillStyle = "#02050a"; ctx.fillRect(0, 0, IW, IH);

    ctx.save();
    sectorPath(ctx); ctx.clip();
    const bg = ctx.createRadialGradient(OX, 120, 40, OX, 200, 480);
    bg.addColorStop(0, "#0e1622"); bg.addColorStop(1, "#04070d");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, IW, IH);

    // Sangre dentro de las cámaras (oscura)
    ctx.fillStyle = "#010204";
    [g.lv, g.rv, g.la, g.ra].forEach(c => { ellipse(ctx, c); ctx.fill(); });
    ctx.beginPath(); ctx.ellipse(318, g.aoY, 17, 24, 0, 0, Math.PI * 2); ctx.fill();

    // Paredes del corazón (miocardio brillante)
    ctx.lineJoin = "round"; ctx.shadowColor = "rgba(210,220,235,0.45)"; ctx.shadowBlur = 10;
    const wall = (c, w, a) => { ctx.strokeStyle = `rgba(190,196,208,${a})`; ctx.lineWidth = w; ellipse(ctx, c); ctx.stroke(); };
    wall(g.lv, 24, 0.62); wall(g.rv, 12, 0.5); wall(g.la, 7, 0.42); wall(g.ra, 7, 0.42);
    ctx.strokeStyle = "rgba(205,210,222,0.72)"; ctx.lineWidth = 17;                    // tabique interventricular
    ctx.beginPath(); ctx.moveTo(321, g.lv.apex - 2); ctx.lineTo(321, g.lv.base); ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = "rgba(200,206,218,0.55)";                     // tabique interauricular
    ctx.beginPath(); ctx.moveTo(320, g.lv.base - 4); ctx.lineTo(320, 442); ctx.stroke();
    ctx.lineWidth = 7; ctx.strokeStyle = "rgba(190,196,208,0.5)";                      // raíz aórtica
    ctx.beginPath(); ctx.ellipse(318, g.aoY, 17, 24, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    // músculos papilares
    ctx.fillStyle = "rgba(170,176,190,0.5)";
    [[g.lv.cx + g.lv.ax * 0.55, g.lv.base - 52], [g.lv.cx - g.lv.ax * 0.5, g.lv.base - 70]].forEach(([px, py]) => { ctx.beginPath(); ctx.ellipse(px, py, 9, 14, 0.3, 0, Math.PI * 2); ctx.fill(); });

    // Válvulas (se abren en diástole)
    leaflets(ctx, 330, 326 + 2 * g.lv.ax - 4, g.lv.base, g.openAV);
    leaflets(ctx, 312, 314 - 2 * g.rv.ax + 4, g.rv.base, g.openAV);

    // Textura del ultrasonido (speckle), que se renueva como en un equipo real
    if (t - noiseT > 0.08) { noiseJx = -Math.floor(Math.random() * 40); noiseJy = -Math.floor(Math.random() * 40); noiseT = t; }
    ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = 0.6;
    ctx.drawImage(noise, noiseJx, noiseJy, 700, 560);
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.05;
    ctx.drawImage(noise, noiseJx - 9, noiseJy - 7, 700, 560);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;

    // Doppler color: cuadrados de color, uno por celda
    if (mode === "color") {
      const STEP = 6;
      for (let y = 64; y < 446; y += STEP) {
        for (let x = 150; x < 500; x += STEP) {
          let v = flowAt(x + 3, y + 3, g);
          if (v === null) continue;
          v *= 0.86 + Math.random() * 0.28;
          if (Math.abs(v) < 0.05) continue;
          if (Math.random() < 0.07) continue;                            // pequeños huecos
          if (Math.abs(v) > VMAX * 1.1 && Math.random() < 0.14) ctx.fillStyle = "rgba(40,200,100,0.92)";   // turbulencia
          else ctx.fillStyle = `rgba(${flowColor(v)},0.93)`;
          ctx.fillRect(x, y, STEP - 0.4, STEP - 0.4);
        }
      }
    }

    // Ventana de medición (muestra del Doppler espectral)
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    if (win === "mitral") {
      const mx = 326 + g.lv.ax, my = g.lv.base - 14;
      ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(mx - 12, my - 6); ctx.lineTo(mx - 12, my + 6); ctx.moveTo(mx + 12, my - 6); ctx.lineTo(mx + 12, my + 6); ctx.moveTo(mx - 12, my); ctx.lineTo(mx + 12, my); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(OX, OY + 70); ctx.lineTo(318, g.aoY); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();

    // Bordes del sector
    ctx.strokeStyle = "rgba(143,193,242,0.28)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(OX, OY); ctx.lineTo(OX + SECTOR_R * Math.sin(HALF), OY + SECTOR_R * Math.cos(HALF));
    ctx.moveTo(OX, OY); ctx.lineTo(OX - SECTOR_R * Math.sin(HALF), OY + SECTOR_R * Math.cos(HALF)); ctx.stroke();

    // Rótulos de las cámaras
    ctx.font = "700 15px Inter, 'Segoe UI', sans-serif"; ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.fillText("VI", g.lv.cx, g.lv.cy - 40); ctx.fillText("VD", g.rv.cx, g.rv.cy - 40);
    ctx.fillText("AI", g.la.cx, g.la.cy + 4); ctx.fillText("AD", g.ra.cx, g.ra.cy + 4);
    ctx.font = "700 12px Inter, 'Segoe UI', sans-serif"; ctx.fillText("Ao", 318, g.aoY + 4);

    // Información del equipo (arriba a la izquierda)
    ctx.textAlign = "left"; ctx.font = "600 12px 'JetBrains Mono', Consolas, monospace";
    ctx.fillStyle = "rgba(190,225,255,0.95)";
    ctx.fillText(`FC ${Math.round(sm.hr)} lpm`, 12, 20);
    ctx.fillStyle = "rgba(190,225,255,0.7)";
    ctx.fillText(mode === "color" ? "Doppler color" : "Modo 2D", 12, 36);
    ctx.fillText("Apical 4C · 2.5 MHz", 12, 52);

    // Barra de color (velocidades)
    if (mode === "color") {
      const bx = 12, by = 78, bw = 14, bh = 150;
      for (let i = 0; i < bh; i++) {
        const v = lerp(VMAX, -VMAX, i / (bh - 1));
        ctx.fillStyle = `rgb(${flowColor(v * 0.999)})`; ctx.fillRect(bx, by + i, bw, 1);
      }
      ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = "600 10px 'JetBrains Mono', Consolas, monospace";
      ctx.fillText(`+${VMAX.toFixed(1)}`, bx + 20, by + 8); ctx.fillText("0", bx + 20, by + bh / 2 + 3); ctx.fillText(`-${VMAX.toFixed(1)}`, bx + 20, by + bh);
      ctx.fillText("m/s", bx, by + bh + 14);
    }

    // Escala de profundidad (derecha)
    ctx.textAlign = "right"; ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "600 10px 'JetBrains Mono', Consolas, monospace";
    ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 1;
    for (let cm = 4; cm <= 14; cm += 2) {
      const y = OY + cm / PX_CM;
      if (y > IH - 8) break;
      ctx.beginPath(); ctx.moveTo(IW - 22, y); ctx.lineTo(IW - 8, y); ctx.stroke();
      ctx.fillText(cm, IW - 26, y + 3);
    }
    ctx.fillText("cm", IW - 8, 14);
  }

  // ---------- Doppler espectral + ECG ----------
  const ecgShape = p => gauss(p, 0.10, 0.025, 0.12) + gauss(p, 0.20, 0.008, -0.12) + gauss(p, 0.23, 0.010, 1) + gauss(p, 0.26, 0.010, -0.25) + gauss(p, 0.45, 0.045, 0.30);

  // Velocidad del espectro en una fase del ciclo (m/s; positivo = hacia el transductor)
  function specVel(p) {
    const fs = systoleFraction(sm.hr);
    const sys = p < fs, s = sys ? p / fs : 1, d = sys ? 0 : (p - fs) / (1 - fs);
    if (win === "mitral") {
      if (sys) return 0;
      return sm.E * Math.sin(Math.PI * clamp(d / 0.45, 0, 1)) + sm.A * Math.sin(Math.PI * clamp((d - 0.82) / 0.18, 0, 1)) + (d > 0.45 && d < 0.82 ? 0.06 : 0);
    }
    return sys ? -sm.vao * Math.pow(Math.sin(Math.PI * s), 0.85) : 0;
  }

  let specGrad = null;
  function drawSpec() {
    const fit = fitCanvas(cvS);
    if (!fit) return;
    const ctx = fit.ctx;
    ctx.setTransform(cvS.width / SW, 0, 0, cvS.height / SH, 0, 0);
    ctx.fillStyle = "#02050a"; ctx.fillRect(0, 0, SW, SH);
    const mitral = win === "mitral";
    const base = mitral ? 128 : 34;
    const k = mitral ? 80 : 70;           // píxeles por m/s

    // Cuadrícula y escala de velocidades
    ctx.font = "600 10px 'JetBrains Mono', Consolas, monospace"; ctx.textAlign = "left";
    for (let v = mitral ? -0.5 : -1.5; v <= (mitral ? 1.5 : 0.5); v += 0.5) {
      const y = base - v * k; if (y < 4 || y > 152) continue;
      ctx.strokeStyle = v === 0 ? "rgba(143,193,242,0.55)" : "rgba(143,193,242,0.12)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(SW, y); ctx.stroke();
      ctx.fillStyle = "rgba(190,225,255,0.65)"; ctx.fillText(v.toFixed(1), 2, y + 3);
    }
    const g1 = ctx.createLinearGradient(0, mitral ? 8 : 34, 0, mitral ? 128 : 150);
    g1.addColorStop(0, "rgba(255,255,255,0.95)"); g1.addColorStop(1, "rgba(120,170,230,0.15)");
    const g2 = ctx.createLinearGradient(0, 34, 0, 150);
    g2.addColorStop(0, "rgba(120,170,230,0.15)"); g2.addColorStop(1, "rgba(255,255,255,0.95)");

    // Trazado: cada columna es un instante del pasado reciente
    for (let x = 34; x < SW; x += 2) {
      const p = ((phase - (SW - x) / SPEED * sm.hr / 60) % 1 + 1) % 1;
      const v = specVel(p);
      if (Math.abs(v) < 0.015) continue;
      const yEnv = base - v * k;
      ctx.fillStyle = mitral ? g1 : g2;
      if (mitral) ctx.fillRect(x, yEnv, 2, base - yEnv); else ctx.fillRect(x, base, 2, yEnv - base);
      ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.fillRect(x, yEnv - 1, 2, 2);               // borde (envolvente)
      for (let n = 0; n < 3; n++) {                                                            // ensanchamiento espectral
        const f = Math.random(); ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.4})`;
        ctx.fillRect(x, base - v * k * f, 1.5, 1.5);
      }
    }

    // ECG sincronizado
    const ey = 184;
    ctx.strokeStyle = "rgba(80,220,140,0.95)"; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let x = 34; x < SW; x += 2) {
      const p = ((phase - (SW - x) / SPEED * sm.hr / 60) % 1 + 1) % 1;
      const y = ey - ecgShape((p + 0.23) % 1) * 22;
      x === 34 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(80,220,140,0.9)"; ctx.fillText("ECG", 2, ey - 14);

    // Valores y rótulos
    ctx.textAlign = "right"; ctx.fillStyle = "rgba(190,225,255,0.95)"; ctx.font = "700 11px 'JetBrains Mono', Consolas, monospace";
    ctx.fillText(mitral ? `Mitral PW  ·  E ${sm.E.toFixed(2)}  A ${sm.A.toFixed(2)} m/s  ·  E/A ${(sm.E / sm.A).toFixed(1)}` : `Aórtico CW  ·  Vmáx ${sm.vao.toFixed(2)} m/s  ·  grad. ${(4 * sm.vao * sm.vao).toFixed(0)} mmHg`, SW - 8, 14);
  }

  // ---------- Panel de mediciones y hallazgos ----------
  const STATUS_TXT = { nominal: "normal", warning: "advertencia", critical: "crítico" };
  function row(name, val, unit, ref, lvl) {
    return `<div class="echo-row ${lvl}"><span class="er-name">${name}</span><span class="er-val mono">${val} <small>${unit}</small></span><span class="er-ref">${ref}</span></div>`;
  }
  function renderTable() {
    const i = state.activeCrewIndex, cs = state.crewStates[i];
    if (!cs || !cs.diagnosis) return;
    const p = physio(i);
    const hrLvl = (cs.diagnosis.cardStates || {}).hrStatus || "nominal";
    const efLvl = p.ef < 0.4 ? "critical" : p.ef < 0.5 || p.ef > 0.75 ? "warning" : "nominal";
    const coLvl = p.co < 2.5 ? "critical" : p.co < 3.5 ? "warning" : "nominal";
    const eaLvl = p.E / p.A < 0.8 || p.E / p.A > 2.2 ? "warning" : "nominal";
    const massLvl = p.massLoss > 0.15 ? "critical" : p.massLoss > 0.08 ? "warning" : "nominal";
    ui.table.innerHTML =
      `<div class="echo-table-title">MEDICIONES · ${esc(CREW_PROFILES[i].name.toUpperCase())}</div>` +
      row("Frecuencia cardíaca", Math.round(p.hr), "lpm", "50 – 95", hrLvl) +
      row("Fracción de eyección (FEVI)", Math.round(p.ef * 100), "%", "55 – 70", efLvl) +
      row("Volumen diastólico final", Math.round(p.edv), "mL", "90 – 150", "nominal") +
      row("Volumen sistólico", Math.round(p.sv), "mL", "55 – 100", "nominal") +
      row("Gasto cardíaco", p.co.toFixed(1), "L/min", "4 – 8", coLvl) +
      row("Onda E mitral", p.E.toFixed(2), "m/s", "0.6 – 1.0", "nominal") +
      row("Onda A mitral", p.A.toFixed(2), "m/s", "0.3 – 0.7", "nominal") +
      row("Relación E/A", (p.E / p.A).toFixed(1), "", "0.8 – 2.2", eaLvl) +
      row("Velocidad aórtica máx.", p.vao.toFixed(2), "m/s", "1.0 – 1.7", "nominal") +
      row("Masa del ventrículo izq.", Math.round(p.mass), "g", `−${Math.round(p.massLoss * 100)}% vs. basal`, massLvl);

    const worst = [efLvl, coLvl, eaLvl, massLvl, hrLvl].includes("critical") ? "critical" : [efLvl, coLvl, eaLvl, massLvl, hrLvl].includes("warning") ? "warning" : "nominal";
    ui.badge.textContent = `FEVI ${Math.round(p.ef * 100)}% · ${STATUS_TXT[worst].toUpperCase()}`;
    ui.badge.className = `badge ${worst === "critical" ? "crit-badge" : worst === "warning" ? "warn-badge" : "ok-badge"}`;

    // Hallazgos
    const f = [];
    f.push([efLvl, p.ef < 0.5 ? `Función sistólica reducida (FEVI ${Math.round(p.ef * 100)}%).` : `Función sistólica conservada (FEVI ${Math.round(p.ef * 100)}%).`]);
    f.push(["nominal", "Cavidades de tamaño normal. Sin derrame pericárdico."]);
    f.push([eaLvl, eaLvl === "nominal" ? "Llenado diastólico normal (relación E/A conservada)." : "Patrón de llenado diastólico alterado (relación E/A fuera de rango)."]);
    f.push([p.hr > 150 ? "warning" : "nominal", p.hr > 150 ? "Flujo turbulento en las válvulas por la frecuencia cardíaca muy alta." : "Flujo laminar por las válvulas mitral y aórtica. Sin regurgitación significativa."]);
    f.push([massLvl, `Masa ventricular ${Math.round(p.massLoss * 100)}% menor que la basal por la microgravedad` + (massLvl !== "nominal" ? ": reforzar el ejercicio resistivo (ARED)." : ".")]);
    if (p.hr > 130) f.push(["warning", "Taquicardia: diástole acortada; las ondas E y A tienden a fusionarse."]);
    else if (p.hr < 50 && !p.sl) f.push(["warning", "Bradicardia: revisar tolerancia al esfuerzo."]);
    if (p.sl) f.push(["nominal", "Durante el sueño la frecuencia baja y el llenado ventricular aumenta, lo esperado."]);
    ui.finds.innerHTML = `<div class="echo-findings-title">HALLAZGOS</div>` + f.map(([l, t]) => `<div class="echo-find ${l}">${l === "nominal" ? "✓" : "⚠"} ${esc(t)}</div>`).join("");
  }

  function renderCrew() {
    const n = CREW_PROFILES.length;
    if (ui.crew.children.length !== n) ui.crew.innerHTML = CREW_PROFILES.map((_, i) => `<button type="button" data-i="${i}"></button>`).join("");
    CREW_PROFILES.forEach((c, i) => {
      const b = ui.crew.children[i];
      if (b.textContent !== c.name) b.textContent = c.name;
      b.classList.toggle("active", i === state.activeCrewIndex);
    });
  }

  // ---------- Eventos ----------
  ui.crew.addEventListener("click", e => { const b = e.target.closest("[data-i]"); if (b) { selectCrew(Number(b.dataset.i)); renderCrew(); renderTable(); } });
  ui.mode.addEventListener("click", e => { const b = e.target.closest("[data-mode]"); if (!b) return; mode = b.dataset.mode; ui.mode.querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b)); });
  ui.win.addEventListener("click", e => { const b = e.target.closest("[data-win]"); if (!b) return; win = b.dataset.win; ui.win.querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b)); });

  // ---------- Bucle de animación ----------
  // Mostrar/ocultar la pestaña sin tocar la navegación existente
  function syncView() {
    const show = state.activeView === "echo";
    host.style.display = show ? "block" : "none";
  }
  document.querySelectorAll(".nav-tab").forEach(t => t.addEventListener("click", () => setTimeout(syncView, 0)));

  function frame(ms) {
    requestAnimationFrame(frame);
    if ((state.activeView === "echo") !== (host.style.display !== "none")) syncView();
    if (state.activeView !== "echo") { lastT = 0; return; }
    const t = ms / 1000;
    const dt = lastT ? Math.min(0.1, t - lastT) : 0;
    lastT = t;
    if (!state.crewStates || !state.crewStates[state.activeCrewIndex] || !state.crewStates[state.activeCrewIndex].vitals) return;

    const p = physio(state.activeCrewIndex);
    const a = 1 - Math.exp(-dt * 4);
    sm.hr += (p.hr - sm.hr) * a; sm.ef += (p.ef - sm.ef) * a; sm.E += (p.E - sm.E) * a; sm.A += (p.A - sm.A) * a; sm.vao += (p.vao - sm.vao) * a;
    phase = (phase + dt * sm.hr / 60) % 1;

    drawEcho(t);
    drawSpec();
    if (t - lastSlow > 0.5) { lastSlow = t; renderCrew(); renderTable(); }
  }
  requestAnimationFrame(frame);
})();
