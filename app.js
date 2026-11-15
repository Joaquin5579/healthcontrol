const STORAGE_KEY = "orbital_med_scada_v46";
const INITIAL_MET_SECONDS = 42 * 86400 + 14 * 3600 + 22 * 60 + 10;

const CREW_PROFILES = [
  {
    id: "AST-01",
    name: "Cmdr. V. Rossi",
    module: "Laboratorio Destiny",
    sharedDestinyEclss: true,
    shieldFactor: 1.0,
    sleepBase: 7.3,
    earth: { hr: 65, sys: 118, dia: 76, temp: 36.6, rr: 14, iop: 14.0, radRate: 0.12 },
    orbit: { hr: 61, sys: 114, dia: 73, temp: 37.1, rr: 15, iop: 17.5, radRate: 24.5, muscleRatePerMonth: -1.45, boneRatePerMonth: -0.95 }
  },
  {
    id: "AST-02",
    name: "Ing. M. Alvarez",
    module: "Laboratorio Destiny",
    sharedDestinyEclss: true,
    shieldFactor: 1.0,
    sleepBase: 7.6,
    earth: { hr: 60, sys: 115, dia: 72, temp: 36.5, rr: 13, iop: 13.5, radRate: 0.12 },
    orbit: { hr: 57, sys: 111, dia: 70, temp: 37.0, rr: 14, iop: 16.8, radRate: 24.5, muscleRatePerMonth: -1.25, boneRatePerMonth: -0.80 }
  },
  {
    id: "AST-03",
    name: "Esp. K. Tanaka",
    module: "Esclusa Quest",
    sharedDestinyEclss: false,
    shieldFactor: 1.35,
    sleepBase: 6.2,
    earth: { hr: 68, sys: 120, dia: 78, temp: 36.7, rr: 16, iop: 15.0, radRate: 0.12 },
    orbit: { hr: 64, sys: 116, dia: 75, temp: 37.2, rr: 16, iop: 18.4, radRate: 33.0, muscleRatePerMonth: -1.75, boneRatePerMonth: -1.15 }
  }
];

const ORBIT_MODES = {
  reposo: {
    label: "Reposo en microgravedad (0g)",
    hrRange: [50, 95], sysRange: [100, 135], tempRange: [36.4, 37.8], rrRange: [11, 20],
    hrOffset: 0, sysOffset: 0, tempOffset: 0, rrOffset: 0
  },
  sueno: {
    label: "Ciclo de sueño en órbita",
    hrRange: [42, 75], sysRange: [95, 125], tempRange: [36.1, 37.4], rrRange: [9, 17],
    hrOffset: -11, sysOffset: -8, tempOffset: -0.3, rrOffset: -3
  },
  ejercicio: {
    label: "Ejercicio diario (ARED / Cinta T2)",
    hrRange: [100, 175], sysRange: [130, 185], tempRange: [37.0, 38.7], rrRange: [20, 42],
    hrOffset: 78, sysOffset: 42, tempOffset: 0.9, rrOffset: 16
  },
  eva: {
    label: "Caminata Espacial (Traje EMU)",
    hrRange: [80, 155], sysRange: [115, 165], tempRange: [36.8, 38.3], rrRange: [16, 34],
    hrOffset: 45, sysOffset: 24, tempOffset: 0.5, rrOffset: 9
  },
  refugio: {
    label: "Refugio Blindado (Water Wall)",
    hrRange: [50, 95], sysRange: [100, 135], tempRange: [36.4, 37.8], rrRange: [11, 20],
    hrOffset: 2, sysOffset: 2, tempOffset: 0.1, rrOffset: 1
  }
};

// ===================== TRIPULACIÓN: INICIO DE SESIÓN =====================
const CREW_KEY = "orbital_med_scada_crew_v1";
const CREW_ROLES = [
  { short: "Cmdr.", long: "Comandante de misión" },
  { short: "Ing.", long: "Ingeniero/a de vuelo" },
  { short: "Esp.", long: "Especialista de misión" }
];
const NAME_PATTERN = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{2,30}$/;
let crewIdentities = [null, null, null];   // { nombre, apellido, edad } por tripulante
let missionStarted = false;

function loadCrewIdentities() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CREW_KEY) || "null");
    if (Array.isArray(parsed) && parsed.length === 3) crewIdentities = parsed;
  } catch (e) {}
}
function saveCrewIdentities() {
  try { localStorage.setItem(CREW_KEY, JSON.stringify(crewIdentities)); } catch (e) {}
}
function allCrewLoggedIn() { return crewIdentities.every(Boolean); }
function crewSignature() { return crewIdentities.map(p => p ? `${p.nombre}|${p.apellido}|${p.edad}` : "").join("#"); }

// Copia nombre y edad de cada sesión al perfil del tripulante (lo usa todo el SCADA).
function applyCrewIdentities() {
  crewIdentities.forEach((p, i) => {
    if (!p) return;
    CREW_PROFILES[i].name = `${CREW_ROLES[i].short} ${p.nombre} ${p.apellido}`;
    CREW_PROFILES[i].age = p.edad;
  });
  document.querySelectorAll("#crewSelect option").forEach((opt, i) => {
    opt.textContent = `${CREW_PROFILES[i].name} (${CREW_PROFILES[i].id})`;
  });
}

const MODE_SHORT ={ reposo: "Reposo", sueno: "Sueño", ejercicio: "ARED", eva: "EVA", refugio: "Refugio" };

function buildInitial24hHistory(baseHr, baseTemp, mode) {
  const hrArr = [];
  const tempArr = [];
  for (let i = 0; i < 24; i++) {
    const isSleep = i >= 0 && i <= 6;
    const isWorkout = i === 10 || i === 11;
    let h = baseHr + (isSleep ? -10 : isWorkout ? 68 : 0) + (Math.random() - 0.5) * 4;
    let t = baseTemp + (isSleep ? -0.3 : isWorkout ? 0.8 : 0) + (Math.random() - 0.5) * 0.15;
    if (i === 23 && mode === "ejercicio") {
      h = baseHr + 75;
      t = baseTemp + 0.85;
    }
    hrArr.push(Math.round(h));
    tempArr.push(+t.toFixed(1));
  }
  return { hr: hrArr, temp: tempArr };
}

function getDefaultState() {
  return {
    activeView: "telemetry",
    activeCrewIndex: 0,
    activeChart: "mission",
    dopplerVessel: "jugular",
    simSpeed: 1,
    solarStorm: false,
    metSeconds: INITIAL_MET_SECONDS,
    lastProcessedDay: 42,
    lastProcessedHour: Math.floor(INITIAL_MET_SECONDS / 3600),
    nextIncidentDay: 44,
    activeIncident: null,
    expandedCrew: null,        // tripulante con el panel de signos vitales abierto
    nextSickIndex: 0,         // turno rotativo: a quién le toca el próximo incidente
    lastIncidentType: null,    // evita repetir el mismo incidente dos veces seguidas
    co2: 2.8,
    o2: 160,
    pressure: 101.3,
    ambTemp: 22.5,
    crewStates: [
      {
        mode: "reposo",
        clinicalScenario: "normal",
        vitals: { hr: 61, sys: 114, dia: 73, spo2: 98, temp: 37.1, rr: 15, iop: 17.5, muscleDelta: -2.1, boneDelta: -1.4, radRate: 24.5, radTotal: 24.7 },
        history24h: buildInitial24hHistory(61, 37.1, "reposo"),
        sleepHistory7d: [7.5, 6.8, 7.2, 7.8, 6.9, 7.3, 7.4],
        sleepEfficiency: 89,
        sleepRemPercent: 41,
        lastPsychDay: 30,
        psychScore: 84,
        psychHistory: [
          { day: 30, score: 84, mood: 4, stress: 4, focus: 4, cohesion: 5, sleepAvg: 7.3, notes: "Adaptación orbital completa." },
          { day: 20, score: 80, mood: 4, stress: 3, focus: 4, cohesion: 5, sleepAvg: 6.9, notes: "Leve ruido de ventiladores." }
        ],
        alarmAcked: false,
        alarmAckInfo: null,
        checkedSteps: {},
        diagnosis: null,
        lastCode: "",
        lastPsychAlertDay: -1
      },
      {
        mode: "ejercicio",
        clinicalScenario: "normal",
        vitals: { hr: 135, sys: 153, dia: 89, spo2: 98, temp: 37.9, rr: 30, iop: 16.8, muscleDelta: -1.8, boneDelta: -1.1, radRate: 24.5, radTotal: 24.7 },
        history24h: buildInitial24hHistory(57, 37.0, "ejercicio"),
        sleepHistory7d: [7.8, 7.6, 8.0, 7.5, 7.7, 7.4, 7.6],
        sleepEfficiency: 92,
        sleepRemPercent: 44,
        lastPsychDay: 40,
        psychScore: 90,
        psychHistory: [
          { day: 40, score: 90, mood: 5, stress: 4, focus: 5, cohesion: 5, sleepAvg: 7.7, notes: "Excelente rendimiento físico." }
        ],
        alarmAcked: false,
        alarmAckInfo: null,
        checkedSteps: {},
        diagnosis: null,
        lastCode: "",
        lastPsychAlertDay: -1
      },
      {
        mode: "reposo",
        clinicalScenario: "normal",
        vitals: { hr: 64, sys: 116, dia: 75, spo2: 98, temp: 37.2, rr: 16, iop: 18.4, muscleDelta: -2.6, boneDelta: -1.7, radRate: 33.0, radTotal: 33.2 },
        history24h: buildInitial24hHistory(64, 37.2, "reposo"),
        sleepHistory7d: [6.4, 6.1, 6.5, 5.9, 6.2, 6.0, 6.1],
        sleepEfficiency: 82,
        sleepRemPercent: 35,
        lastPsychDay: 40,
        psychScore: 76,
        psychHistory: [
          { day: 40, score: 76, mood: 4, stress: 3, focus: 4, cohesion: 4, sleepAvg: 6.2, notes: "Preparación de equipos en Quest." }
        ],
        alarmAcked: false,
        alarmAckInfo: null,
        checkedSteps: {},
        diagnosis: null,
        lastCode: "",
        lastPsychAlertDay: -1
      }
    ],
    logs: []
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();
    const parsed = JSON.parse(raw);
    const merged = { ...getDefaultState(), ...parsed, simSpeed: 1 };
    // Un test psicológico que quedó "en curso" al cerrar la página nunca terminaría: se reinicia.
    merged.crewStates.forEach(cs => { cs.autoPsychPending = false; });
    return merged;
  } catch (e) {
    return getDefaultState();
  }
}

let state = loadState();

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

const el = {
  fleetGrid: document.getElementById("fleetGrid"),
  fleetExpand: document.getElementById("fleetExpand"),
  fleetSummary: document.getElementById("fleetSummary"),
  detailCrewTitle: document.getElementById("detailCrewTitle"),
  solarBanner: document.getElementById("solarBanner"),
  crewSelect: document.getElementById("crewSelect"),
  valHr: document.getElementById("valHr"),
  valBp: document.getElementById("valBp"),
  valSpo2: document.getElementById("valSpo2"),
  valTemp: document.getElementById("valTemp"),
  valRr: document.getElementById("valRr"),
  valIop: document.getElementById("valIop"),
  valMuscle: document.getElementById("valMuscle"),
  valBone: document.getElementById("valBone"),
  valRadRate: document.getElementById("valRadRate"),
  valSleepLast: document.getElementById("valSleepLast"),
  valSleepAvg: document.getElementById("valSleepAvg"),
  rangeHr: document.getElementById("rangeHr"),
  rangeBp: document.getElementById("rangeBp"),
  rangeTemp: document.getElementById("rangeTemp"),
  rangeRr: document.getElementById("rangeRr"),
  cardHr: document.getElementById("cardHr"),
  cardBp: document.getElementById("cardBp"),
  cardSpo2: document.getElementById("cardSpo2"),
  cardTemp: document.getElementById("cardTemp"),
  cardRr: document.getElementById("cardRr"),
  cardSans: document.getElementById("cardSans"),
  cardMuscle: document.getElementById("cardMuscle"),
  cardBone: document.getElementById("cardBone"),
  cardSleep: document.getElementById("cardSleep"),
  cardRad: document.getElementById("cardRad"),
  isaStateBadge: document.getElementById("isaStateBadge"),
  diagBox: document.getElementById("diagBox"),
  diagTitle: document.getElementById("diagTitle"),
  diagDesc: document.getElementById("diagDesc"),
  ackBar: document.getElementById("ackBar"),
  ackInfo: document.getElementById("ackInfo"),
  ackBtn: document.getElementById("ackBtn"),
  diagAction: document.getElementById("diagAction"),
  systemLed: document.getElementById("systemLed"),
  ecgStatus: document.getElementById("ecgStatus"),
  ecgCanvas: document.getElementById("ecgCanvas"),
  eventLog: document.getElementById("eventLog"),
  missionClock: document.getElementById("missionClock"),
  trendCanvas: document.getElementById("trendCanvas"),
  trendLegend: document.getElementById("trendLegend"),
  viewTelemetry: document.getElementById("viewTelemetry"),
  viewMental: document.getElementById("viewMental"),
  viewDoppler: document.getElementById("viewDoppler"),
  psychPendingBadge: document.getElementById("psychPendingBadge"),
  mentalCrewName: document.getElementById("mentalCrewName"),
  psychDueBadge: document.getElementById("psychDueBadge"),
  psychBanner: document.getElementById("psychBanner"),
  psychBannerTitle: document.getElementById("psychBannerTitle"),
  psychBannerDesc: document.getElementById("psychBannerDesc"),
  lastTestDay: document.getElementById("lastTestDay"),
  nextTestDay: document.getElementById("nextTestDay"),
  mentalSleepContext: document.getElementById("mentalSleepContext"),
  psychScoreDisplay: document.getElementById("psychScoreDisplay"),
  valMentalIndex: document.getElementById("valMentalIndex"),
  valMentalSleepAvg: document.getElementById("valMentalSleepAvg"),
  cardMentalIndex: document.getElementById("cardMentalIndex"),
  cardMentalSleep: document.getElementById("cardMentalSleep"),
  psychHistoryList: document.getElementById("psychHistoryList"),
  dopplerEnvBadge: document.getElementById("dopplerEnvBadge"),
  dopplerVesselSelect: document.getElementById("dopplerVesselSelect"),
  sidebarMenu: document.getElementById("sidebarMenu"),
  sidebarToggle: document.getElementById("sidebarToggle"),
  sidebarClose: document.getElementById("sidebarClose"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  resetMissionBtn: document.getElementById("resetMissionBtn")
};

el.sidebarToggle.addEventListener("click", () => el.sidebarMenu.classList.add("open"));
el.sidebarClose.addEventListener("click", () => el.sidebarMenu.classList.remove("open"));

function renderLogs() {
  el.eventLog.innerHTML = state.logs
    .map(item => `<div class="log-entry ${item.level}"><strong>[Día ${item.metDay} | ${item.time}] ${item.crew}:</strong> ${item.msg}</div>`)
    .join("");
}

function addLog(crewId, msg, level = "info") {
  const now = new Date().toTimeString().split(" ")[0];
  const metDay = Math.floor(state.metSeconds / 86400);
  state.logs.unshift({ time: now, metDay, crew: crewId, msg, level });
  if (state.logs.length > 50) state.logs.pop();
  renderLogs();
  saveState();
}

function formatDelta(val) { return val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1); }
function getMissionDays() { return state.metSeconds / 86400; }
function getSleepStats(cs) {
  const arr = cs.sleepHistory7d;
  return { last: arr[arr.length - 1], avg: arr.reduce((a, b) => a + b, 0) / arr.length };
}
function isPsychDue(cs) { return Math.floor(getMissionDays()) - cs.lastPsychDay >= 10; }

// CATÁLOGO DE INCIDENTES AUTÓNOMOS
// Cada incidente afecta a UN solo tripulante; el turno rota entre los tres.
const RANDOM_INCIDENT_CATALOG = [
  {
    type: "co2_pocket",
    title: "Bolsa local de CO₂ en camarote",
    apply: (idx) => { state.crewStates[idx].localCo2 = 6.4; },
    stepsLogs: ["Sensor personal detecta ppCO₂ elevado junto al tripulante.", "Ventilador de camarote en máxima potencia."],
    resolve: (idx) => { state.crewStates[idx].localCo2 = 2.8; },
    resolveMsg: "ppCO₂ local estabilizado en 2.8 mmHg."
  },
  {
    type: "sans_venous",
    title: "Estasis Venosa Yugular (VYI)",
    apply: (idx) => { state.crewStates[idx].clinicalScenario = "sans"; },
    stepsLogs: ["Eco-Doppler detecta dilatación de VYI.", "Aplicación de contramedida LBNP."],
    resolve: (idx) => { state.crewStates[idx].clinicalScenario = "normal"; },
    resolveMsg: "Retorno venoso yugular normalizado."
  },
  {
    type: "solar_spe",
    title: "Exposición a Tormenta Solar (SPE)",
    apply: (idx) => {
      const cs = state.crewStates[idx];
      state.solarStorm = true;
      cs.solarExposure = true;     // solo este tripulante estaba en zona poco blindada
      cs.prevMode = cs.mode;
      cs.mode = "refugio";
    },
    stepsLogs: ["Pico de protones solares durante tarea en zona poco blindada.", "Tripulante derivado al Refugio Water Wall."],
    resolve: (idx) => {
      const cs = state.crewStates[idx];
      state.solarStorm = false;
      cs.solarExposure = false;
      cs.mode = cs.prevMode || "reposo";
    },
    resolveMsg: "Flujo solar seguro; retorno a actividades nominales."
  },
  {
    type: "psych_fatigue",
    title: "Fatiga Emocional / Enlace con Tierra",
    apply: (idx) => { state.crewStates[idx].psychScore = 58; },
    stepsLogs: ["Descenso temporal del índice bienestar.", "Activación de videoconferencia familiar de apoyo."],
    resolve: (idx) => {
      const cs = state.crewStates[idx];
      cs.psychScore = 85;
      cs.psychHistory.unshift({ day: Math.floor(getMissionDays()), score: 85, mood: 5, stress: 4, focus: 4, cohesion: 5, sleepAvg: getSleepStats(cs).avg, notes: "Apoyo familiar completado." });
    },
    resolveMsg: "Salud mental estabilizada (85/100)."
  }
];

function triggerRandomIncident(currentDay) {
  // Tipo de incidente al azar, pero distinto al anterior.
  const options = RANDOM_INCIDENT_CATALOG.filter(t => t.type !== state.lastIncidentType);
  const template = options[Math.floor(Math.random() * options.length)];
  state.lastIncidentType = template.type;

  // Turno rotativo: AST-01 → AST-02 → AST-03 → AST-01...
  const crewIdx = (state.nextSickIndex || 0) % CREW_PROFILES.length;
  state.nextSickIndex = (crewIdx + 1) % CREW_PROFILES.length;
  const c = CREW_PROFILES[crewIdx];
  const actor = c.id;

  template.apply(crewIdx);

  state.activeIncident = { type: template.type, title: template.title, crewIdx, actor, startMetSeconds: state.metSeconds, step1Logged: false, step2Logged: false };
  addLog(actor, `INCIDENTE (Día ${currentDay}): ${template.title}. Iniciando protocolo.`, "warning");
}

function progressAutonomousIncident() {
  const inc = state.activeIncident;
  if (!inc) return;
  const template = RANDOM_INCIDENT_CATALOG.find(t => t.type === inc.type);
  if (!template) { state.activeIncident = null; return; }

  const cs = state.crewStates[inc.crewIdx];
  // Unidades = segundos reales transcurridos: el protocolo dura ~20 s en pantalla a cualquier velocidad.
  inc.ticks = (inc.ticks || 0) + 1;
  const units = inc.ticks;

  if (units >= 6 && !inc.step1Logged) {
    inc.step1Logged = true;
    cs.alarmAcked = true;
    cs.alarmAckInfo = `Autónomo · Día ${Math.floor(getMissionDays())}`;
    cs.checkedSteps[0] = true;
    cs.checkedSteps[1] = true;
    addLog(inc.actor, `[Auto 1/2] ${template.stepsLogs[0]}`, "info");
  }
  if (units >= 13 && !inc.step2Logged) {
    inc.step2Logged = true;
    cs.checkedSteps[2] = true;
    cs.checkedSteps[3] = true;
    addLog(inc.actor, `[Auto 2/2] ${template.stepsLogs[1]}`, "info");
  }
  if (units >= 20) {
    template.resolve(inc.crewIdx);
    state.activeIncident = null;
    state.nextIncidentDay = Math.floor(getMissionDays()) + 2 + Math.floor(Math.random() * 3);
    addLog(inc.actor, `✓ ${template.resolveMsg}`, "info");
  }
}

function checkAutonomousPsychResolution() {
  CREW_PROFILES.forEach((c, idx) => {
    const cs = state.crewStates[idx];
    const currentDay = Math.floor(getMissionDays());
    if (currentDay - cs.lastPsychDay >= 10 && !cs.autoPsychPending) {
      cs.autoPsychPending = true;
      addLog(c.id, `Ciclo 10d cumplido (Día ${currentDay}): Autoevaluación psicológica en curso.`, "warning");
      setTimeout(() => {
        const stats = getSleepStats(cs);
        const score = Math.round((16 / 20) * 80 + Math.min(20, (stats.avg / 7.5) * 20));
        cs.lastPsychDay = Math.floor(getMissionDays());
        cs.psychScore = score;
        cs.autoPsychPending = false;
        cs.psychHistory.unshift({ day: cs.lastPsychDay, score, mood: 4, stress: 4, focus: 4, cohesion: 4, sleepAvg: stats.avg, notes: "Autogestión autónoma completada." });
        if (cs.psychHistory.length > 20) cs.psychHistory.pop();
        addLog(c.id, `✓ Cuestionario psicológico completado (Bienestar: ${score}/100).`, "info");
        if (state.activeView === "mental") renderMentalView();
      }, 3500);
    }
  });
}

function evaluateCrewDiagnosis(index) {
  const c = CREW_PROFILES[index];
  const cs = state.crewStates[index];
  const v = cs.vitals;
  const m = ORBIT_MODES[cs.mode];

  const hrStatus = v.hr < m.hrRange[0] || v.hr > m.hrRange[1] ? (v.hr > 135 ? "critical" : "warning") : "nominal";
  const bpStatus = v.sys > m.sysRange[1] || v.sys < m.sysRange[0] ? "warning" : "nominal";
  const spo2Status = v.spo2 < 90 ? "critical" : v.spo2 < 94 ? "warning" : "nominal";
  const tempStatus = v.temp > m.tempRange[1] ? "warning" : "nominal";
  const rrStatus = v.rr > m.rrRange[1] || v.rr < m.rrRange[0] ? "warning" : "nominal";
  const sansStatus = v.iop > 21.0 ? "warning" : "nominal";
  const muscleStatus = v.muscleDelta < -5.0 ? "warning" : "nominal";
  const boneStatus = v.boneDelta < -3.0 ? "warning" : "nominal";
  const radStatus = v.radRate > 45 ? "warning" : "nominal";
  const sleepStats = getSleepStats(cs);
  const sleepStatus = sleepStats.last < 6.0 ? "warning" : "nominal";
  const cardStates = { hrStatus, bpStatus, spo2Status, tempStatus, rrStatus, sansStatus, muscleStatus, boneStatus, sleepStatus, radStatus };

  let diag = {
    level: "nominal",
    shortStatus: cs.mode === "refugio" ? "EN REFUGIO" : `NOMINAL (${MODE_SHORT[cs.mode]})`,
    code: `NOMINAL_${cs.mode}`,
    title: "ESTADO NOMINAL EN ÓRBITA (0g)",
    desc: `Parámetros fisiológicos coherentes para ${c.name} · ${m.label}.`,
    steps: ["Monitoreo telemétrico continuo.", "Rutina diaria ARED completada."]
  };

  if (v.spo2 < 92) {
    diag = { level: "critical", shortStatus: "CRÍTICO: SpO₂", code: "HYPOXIA", title: "CRÍTICO: BAJA SATURACIÓN O₂", desc: `SpO₂ en ${v.spo2}%.`, steps: ["Colocar máscara O₂.", "Revisar ECLSS."] };
  } else if (cs.solarExposure) {
    diag = { level: "warning", shortStatus: "ALERTA: SPE", code: "SPE", title: "ALERTA: EXPOSICIÓN A TORMENTA SOLAR", desc: `Radiación elevada (${v.radRate} µSv/h).`, steps: ["Suspender EVA y tareas fuera de zona blindada.", "Permanecer en refugio Water Wall.", "Registrar dosis acumulada en dosímetro personal.", "Vigilar náuseas, fatiga y cefalea."] };
  } else if (hrStatus === "critical") {
    diag = { level: "critical", shortStatus: "CRÍTICO: FC", code: "TACHY", title: "ALERTA CLÍNICA: TAQUICARDIA", desc: `FC en ${v.hr} lpm.`, steps: ["Reposo neutro.", "Hidratación y ECG."] };
  } else if ((cs.localCo2 || 0) > 5.0) {
    diag = { level: "warning", shortStatus: "ALERTA: CO₂", code: "HYPERCAPNIA", title: "ADVERTENCIA: ppCO₂ ELEVADO EN CAMAROTE", desc: `ppCO₂ local en ${cs.localCo2.toFixed(1)} mmHg (${c.module}).`, steps: ["Ventilador de camarote al máximo.", "Reubicar saco de dormir junto a la toma de aire.", "Reportar cefalea o mareo.", "Confirmar ppCO₂ < 4 mmHg."] };
  } else if (sansStatus === "warning") {
    diag = { level: "warning", shortStatus: "ALERTA: SANS", code: "SANS", title: "ADVERTENCIA: RIESGO SANS / VYI", desc: `PIO en ${v.iop.toFixed(1)} mmHg.`, steps: ["Sesión LBNP preventiva.", "Eco-Doppler de vena yugular.", "Examen de agudeza visual.", "Reevaluar PIO en 12 h."] };
  }

  diag.cardStates = cardStates;
  cs.diagnosis = diag;
  if (diag.code !== cs.lastCode) {
    cs.lastCode = diag.code;
    cs.alarmAcked = false;
    cs.checkedSteps = {};
    addLog(c.id, `${diag.title}`, diag.level === "nominal" ? "info" : diag.level);
  }
}

// Avance de la fisiología: músculo, hueso, dosis acumulada, sueño diario e historial 24h.
function advancePhysiology(dtSeconds) {
  const currentHour = Math.floor(state.metSeconds / 3600);
  const newHours = Math.min(24, currentHour - state.lastProcessedHour);

  CREW_PROFILES.forEach((c, idx) => {
    const cs = state.crewStates[idx];
    const months = dtSeconds / (30 * 86400);
    cs.vitals.muscleDelta += c.orbit.muscleRatePerMonth * months;
    cs.vitals.boneDelta += c.orbit.boneRatePerMonth * months;
    cs.vitals.radTotal += (cs.vitals.radRate * dtSeconds) / 3600 / 1000; // µSv/h → mSv

    for (let h = 0; h < newHours; h++) {
      cs.history24h.hr.push(cs.vitals.hr);
      cs.history24h.temp.push(cs.vitals.temp);
      cs.history24h.hr.shift();
      cs.history24h.temp.shift();
    }
  });
  if (newHours > 0) state.lastProcessedHour = currentHour;
}

function stepAllCrewSimulation(dtSeconds = 0) {
  const noise = (amp) => (Math.random() - 0.5) * amp;
  const currentDay = Math.floor(getMissionDays());

  if (currentDay > state.lastProcessedDay) {
    const daysPassed = Math.min(7, currentDay - state.lastProcessedDay);
    state.lastProcessedDay = currentDay;
    CREW_PROFILES.forEach((c, idx) => {
      const cs = state.crewStates[idx];
      for (let d = 0; d < daysPassed; d++) {
        const night = Math.max(4.5, Math.min(9, c.sleepBase + noise(1.4)));
        cs.sleepHistory7d.push(+night.toFixed(1));
        cs.sleepHistory7d.shift();
      }
    });
    if (!state.activeIncident && currentDay >= state.nextIncidentDay) triggerRandomIncident(currentDay);
  }

  progressAutonomousIncident();
  checkAutonomousPsychResolution();
  advancePhysiology(dtSeconds);

  CREW_PROFILES.forEach((c, idx) => {
    const cs = state.crewStates[idx];
    const m = ORBIT_MODES[cs.mode];
    let baseRad = c.orbit.radRate;
    if (cs.solarExposure) baseRad = 350 * c.shieldFactor;

    cs.vitals.hr = Math.round(c.orbit.hr + m.hrOffset + noise(2));
    cs.vitals.sys = Math.round(c.orbit.sys + m.sysOffset + noise(3));
    cs.vitals.dia = Math.round(c.orbit.dia + noise(2));
    cs.vitals.spo2 = Math.min(100, Math.max(90, Math.round(98 + noise(1))));
    cs.vitals.temp = +(c.orbit.temp + m.tempOffset + noise(0.1)).toFixed(1);
    cs.vitals.rr = Math.round(c.orbit.rr + m.rrOffset + noise(1));
    cs.vitals.radRate = +(baseRad + noise(5)).toFixed(1);
    // El incidente SANS eleva la presión intraocular de forma GRADUAL (como en la realidad):
    // así la IA puede detectar el desvío antes de que cruce el umbral fijo de 21 mmHg.
    cs.sansLevel = cs.clinicalScenario === "sans" ? Math.min(1, (cs.sansLevel || 0) + 0.08) : Math.max(0, (cs.sansLevel || 0) - 0.15);
    cs.vitals.iop = +(c.orbit.iop + 4.6 * cs.sansLevel + noise(0.3)).toFixed(1);

    evaluateCrewDiagnosis(idx);
    runClinicalAI(idx);
  });
  renderAINavBadge();
  if (state.activeView === "ai") renderAIView();

  updateProfileUI();
  renderFleetBar();
  renderActiveCrewDetails();
  drawTrendChart();
  renderMentalView();
  renderDopplerMetrics();
}

function renderFleetBar() {
  let nominalCount = 0;
  let globalSeverity = "nominal";
  let pendingCount = 0;

  el.fleetGrid.innerHTML = CREW_PROFILES.map((c, idx) => {
    const cs = state.crewStates[idx];
    const v = cs.vitals;
    const diag = cs.diagnosis;
    const sleep = getSleepStats(cs);

    if (isPsychDue(cs)) pendingCount++;
    if (diag.level === "nominal") nominalCount++;
    if (diag.level === "critical") globalSeverity = "critical";
    else if (diag.level === "warning" && globalSeverity !== "critical") globalSeverity = "warning";

    const isSelected = idx === state.activeCrewIndex ? "selected" : "";
    const isExpanded = idx === state.expandedCrew;
    let unackClass = "";
    let isaPill = "";
    if (diag.level !== "nominal") {
      if (!cs.alarmAcked) {
        unackClass = diag.level === "critical" ? "unack-crit" : "unack-warn";
        isaPill = `<span class="isa-pill unack">UNACK</span>`;
      } else {
        isaPill = `<span class="isa-pill ack">ACK</span>`;
      }
    }

    return `
      <div class="fleet-card ${diag.level} ${unackClass} ${isSelected} ${isExpanded ? "expanded" : ""}" data-idx="${idx}" title="Clic para ${isExpanded ? "ocultar" : "ver"} todos los signos vitales">
        <div class="fleet-card-top"><strong>${escapeHtml(c.name)}</strong><span class="fleet-card-module">${c.id}<span class="fleet-card-chevron">${isExpanded ? "▲" : "▼"}</span></span></div>
        <div class="fleet-card-status"><span>● ${diag.shortStatus}</span><span>${cs.ai && cs.ai.anomalies.length ? `<span class="isa-pill ai" title="Anomalías detectadas por la IA">IA ${cs.ai.anomalies.length}</span> ` : ""}${isaPill}</span></div>
      </div>
    `;
  }).join("");

  renderFleetExpand();

  if (pendingCount > 0) {
    el.psychPendingBadge.style.display = "inline-block";
    el.psychPendingBadge.textContent = pendingCount;
  } else {
    el.psychPendingBadge.style.display = "none";
  }

  const total = CREW_PROFILES.length;
  el.fleetSummary.className = `fleet-hint ${globalSeverity}`;
  el.fleetSummary.textContent = nominalCount === total ? `${total}/${total} Tripulantes nominales` : "Atención: Protocolo autónomo activo";
  el.systemLed.className = `status-dot ${globalSeverity === "nominal" ? "" : globalSeverity}`;

  if (state.solarStorm) {
    el.solarBanner.className = "live-tag solar-alert";
    el.solarBanner.textContent = "☢ TORMENTA SOLAR SPE ACTIVA";
  } else {
    el.solarBanner.className = "live-tag";
    el.solarBanner.textContent = "● RADIACIÓN CÓSMICA (GCR)";
  }
}

// PANEL DESPLEGABLE: todos los signos vitales del tripulante elegido
function renderFleetExpand() {
  const idx = state.expandedCrew;
  if (idx === null || idx === undefined) {
    el.fleetExpand.classList.remove("open");
    return;
  }
  const c = CREW_PROFILES[idx];
  const cs = state.crewStates[idx];
  const v = cs.vitals;
  const m = ORBIT_MODES[cs.mode];
  const diag = cs.diagnosis;
  const st = diag.cardStates;
  const sleep = getSleepStats(cs);
  const co2 = cs.localCo2 || 2.8;
  const psychStatus = cs.psychScore < 65 ? "critical" : cs.psychScore < 78 ? "warning" : "nominal";
  const doseStatus = v.radTotal > 600 ? "critical" : v.radTotal > 450 ? "warning" : "nominal";
  const item = (label, value, unit, range, status = "nominal") => `
    <div class="expand-item ${status}">
      <span class="ei-label">${label}</span>
      <span class="ei-value mono">${value} <small>${unit}</small></span>
      <span class="ei-range">${range}</span>
    </div>`;

  el.fleetExpand.innerHTML = `
    <div class="expand-inner">
      <div class="expand-head">
        <div>
          <strong>${escapeHtml(c.name)} (${c.id})</strong>
          <div class="expand-sub">${CREW_ROLES[idx].long}${c.age ? ` · ${c.age} años` : ""} · ${c.module} · ${m.label} · Día de misión ${Math.floor(getMissionDays())}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <span class="badge ${diag.level === "critical" ? "crit-badge" : diag.level === "warning" ? "warn-badge" : "ok-badge"}">${diag.shortStatus}</span>
          <button class="expand-close" id="expandCloseBtn">✕ Cerrar</button>
        </div>
      </div>

      <div>
        <div class="expand-section-title">SIGNOS VITALES</div>
        <div class="expand-grid">
          ${item("FRECUENCIA CARDÍACA", v.hr, "lpm", `Rango ${m.hrRange[0]}–${m.hrRange[1]}`, st.hrStatus)}
          ${item("PRESIÓN ARTERIAL", `${v.sys}/${v.dia}`, "mmHg", `Sistólica ${m.sysRange[0]}–${m.sysRange[1]}`, st.bpStatus)}
          ${item("SATURACIÓN SpO₂", v.spo2, "%", "Normal 94–100", st.spo2Status)}
          ${item("TEMP. CENTRAL", v.temp.toFixed(1), "°C", `Rango ${m.tempRange[0]}–${m.tempRange[1]}`, st.tempStatus)}
          ${item("FREC. RESPIRATORIA", v.rr, "rpm", `Rango ${m.rrRange[0]}–${m.rrRange[1]}`, st.rrStatus)}
          ${item("ppCO₂ LOCAL", co2.toFixed(1), "mmHg", "Límite < 4", co2 > 5 ? "warning" : "nominal")}
        </div>
      </div>

      <div>
        <div class="expand-section-title">ADAPTACIÓN A MICROGRAVEDAD Y RADIACIÓN</div>
        <div class="expand-grid">
          ${item("PRESIÓN OCULAR (SANS)", v.iop.toFixed(1), "mmHg", "Límite < 21", st.sansStatus)}
          ${item("MASA MUSCULAR", formatDelta(v.muscleDelta), "%", `Límite > -5.0 · ${c.orbit.muscleRatePerMonth}%/mes`, st.muscleStatus)}
          ${item("DENSIDAD ÓSEA", formatDelta(v.boneDelta), "%", `Límite > -3.0 · ${c.orbit.boneRatePerMonth}%/mes`, st.boneStatus)}
          ${item("TASA DE RADIACIÓN", v.radRate.toFixed(1), "µSv/h", "Alerta > 45", st.radStatus)}
          ${item("DOSIS ACUMULADA", v.radTotal.toFixed(1), "mSv", "Límite carrera 600", doseStatus)}
          ${item("BLINDAJE MÓDULO", c.shieldFactor === 1 ? "Alto" : "Reducido", "", `Factor ×${c.shieldFactor}`, c.shieldFactor > 1 ? "warning" : "nominal")}
        </div>
      </div>

      <div>
        <div class="expand-section-title">SUEÑO Y SALUD MENTAL</div>
        <div class="expand-grid">
          ${item("SUEÑO ANOCHE", sleep.last.toFixed(1), "h", "Meta 7.5 · mín. 6", st.sleepStatus)}
          ${item("SUEÑO PROM. 7 DÍAS", sleep.avg.toFixed(1), "h", "Meta 7.5", sleep.avg < 6 ? "warning" : "nominal")}
          ${item("EFICIENCIA DEL SUEÑO", cs.sleepEfficiency, "%", "Normal > 85", cs.sleepEfficiency < 85 ? "warning" : "nominal")}
          ${item("SUEÑO REM", cs.sleepRemPercent, "%", "Referencia 20–45")}
          ${item("ÍNDICE BIENESTAR", cs.psychScore, "/100", "Meta > 75", psychStatus)}
          ${item("PRÓXIMA EVAL. PSICO.", `Día ${cs.lastPsychDay + 10}`, "", `Última: Día ${cs.lastPsychDay}`, isPsychDue(cs) ? "warning" : "nominal")}
        </div>
      </div>

      <div class="expand-diag ${diag.level}"><strong>${diag.title}:</strong> ${diag.desc}</div>
    </div>
  `;
  el.fleetExpand.classList.add("open");
}

// Las tarjetas se redibujan cada segundo; con "pointerdown" y un solo listener
// en el contenedor, el clic nunca se pierde aunque el elemento se reemplace.
el.fleetGrid.addEventListener("pointerdown", (e) => {
  const card = e.target.closest(".fleet-card");
  if (!card) return;
  const idx = Number(card.dataset.idx);
  // Clic en la misma tarjeta: se cierra. Clic en otra: se abre la de ese tripulante.
  state.expandedCrew = state.expandedCrew === idx ? null : idx;
  selectCrew(idx);
});

el.fleetExpand.addEventListener("pointerdown", (e) => {
  if (!e.target.closest("#expandCloseBtn")) return;
  state.expandedCrew = null;
  renderFleetBar();
  saveState();
});

function setCardState(card, status) {
  card.classList.remove("warning", "critical");
  if (status !== "nominal") card.classList.add(status);
}

function renderActiveCrewDetails() {
  const idx = state.activeCrewIndex;
  const c = CREW_PROFILES[idx];
  const cs = state.crewStates[idx];
  const v = cs.vitals;
  const diag = cs.diagnosis;
  const st = diag.cardStates;
  const sleep = getSleepStats(cs);

  el.detailCrewTitle.textContent = `${c.name.toUpperCase()} (${c.id})`;
  el.valHr.textContent = v.hr;
  el.valBp.textContent = `${v.sys}/${v.dia}`;
  el.valSpo2.textContent = v.spo2;
  el.valTemp.textContent = v.temp.toFixed(1);
  el.valRr.textContent = v.rr;
  el.valIop.textContent = v.iop.toFixed(1);
  el.valMuscle.textContent = formatDelta(v.muscleDelta);
  el.valBone.textContent = formatDelta(v.boneDelta);
  el.valSleepLast.textContent = sleep.last.toFixed(1);
  el.valSleepAvg.textContent = sleep.avg.toFixed(1);
  el.valRadRate.textContent = v.radRate.toFixed(1);

  setCardState(el.cardHr, st.hrStatus);
  setCardState(el.cardBp, st.bpStatus);
  setCardState(el.cardSpo2, st.spo2Status);
  setCardState(el.cardTemp, st.tempStatus);
  setCardState(el.cardRr, st.rrStatus);
  setCardState(el.cardSans, st.sansStatus);
  setCardState(el.cardMuscle, st.muscleStatus);
  setCardState(el.cardBone, st.boneStatus);
  setCardState(el.cardSleep, st.sleepStatus);
  setCardState(el.cardRad, st.radStatus);

  if (diag.level === "nominal") {
    el.isaStateBadge.textContent = "NORMALIZADO";
    el.isaStateBadge.className = "badge ok-badge";
    el.ackBar.style.display = "none";
  } else {
    el.ackBar.style.display = "flex";
    if (!cs.alarmAcked) {
      el.isaStateBadge.textContent = "NO RECONOCIDA";
      el.isaStateBadge.className = `badge ${diag.level === "critical" ? "crit-badge" : "warn-badge"}`;
      el.ackInfo.textContent = "Tripulación ejecutando protocolo autónomo.";
      el.ackBtn.className = `ack-btn ${diag.level === "critical" ? "critical" : ""}`;
      el.ackBtn.disabled = false;
    } else {
      el.isaStateBadge.textContent = "EN RESOLUCIÓN";
      el.isaStateBadge.className = "badge";
      el.ackInfo.textContent = cs.alarmAckInfo ? `✓ Reconocida · ${cs.alarmAckInfo}` : "✓ Reconocida";
      el.ackBtn.disabled = true;
    }
  }

  el.diagBox.className = `diag-box ${diag.level} ${diag.level !== "nominal" && !cs.alarmAcked ? (diag.level === "critical" ? "unack-crit" : "unack-warn") : ""}`;
  el.diagTitle.textContent = diag.title;
  el.diagDesc.textContent = diag.desc;

  const completed = diag.steps.filter((_, i) => !!cs.checkedSteps[i]).length;
  el.diagAction.innerHTML = `
    <div class="diag-steps">
      <div class="diag-steps-header">
        <span class="diag-steps-title">Checklist Automático:</span>
        <span class="diag-progress mono">${completed}/${diag.steps.length}</span>
      </div>
      <ul class="checklist-list">
        ${diag.steps.map((step, i) => `
          <li><label class="checklist-item ${cs.checkedSteps[i] ? "checked" : ""}">
            <input type="checkbox" class="step-checkbox" data-step-idx="${i}" ${cs.checkedSteps[i] ? "checked" : ""} />
            <span>${step}</span>
          </label></li>
        `).join("")}
      </ul>
    </div>
  `;

  document.querySelectorAll(".step-checkbox").forEach(cb => {
    cb.addEventListener("change", (e) => {
      const idxStep = Number(e.target.dataset.stepIdx);
      cs.checkedSteps[idxStep] = e.target.checked;
      if (e.target.checked && !cs.alarmAcked) { cs.alarmAcked = true; cs.alarmAckInfo = "Manual"; }
      renderActiveCrewDetails();
      renderFleetBar();
      saveState();
    });
  });

  el.ecgStatus.textContent = st.hrStatus === "critical" ? "TAQUICARDIA" : "RITMO SINUSAL";
  el.ecgStatus.style.color = st.hrStatus === "critical" ? "var(--critical)" : "";
}

el.ackBtn.addEventListener("click", () => {
  const cs = state.crewStates[state.activeCrewIndex];
  cs.alarmAcked = true;
  cs.alarmAckInfo = "Manual";
  addLog(CREW_PROFILES[state.activeCrewIndex].id, "Alarma reconocida por la tripulación (ACK).", "info");
  renderActiveCrewDetails();
  renderFleetBar();
  saveState();
});

function updateProfileUI() {
  const cs = state.crewStates[state.activeCrewIndex];
  const m = ORBIT_MODES[cs.mode];
  el.crewSelect.value = String(state.activeCrewIndex);
  el.rangeHr.textContent = `${m.hrRange[0]}–${m.hrRange[1]}`;
  el.rangeBp.textContent = `${m.sysRange[0]}–${m.sysRange[1]}`;
  el.rangeTemp.textContent = `${m.tempRange[0]}–${m.tempRange[1]}`;
  el.rangeRr.textContent = `${m.rrRange[0]}–${m.rrRange[1]}`;
}

function switchView(viewName) {
  state.activeView = viewName;
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.toggle("active", t.dataset.view === viewName));
  el.viewTelemetry.style.display = viewName === "telemetry" ? "grid" : "none";
  el.viewMental.style.display = viewName === "mental" ? "grid" : "none";
  el.viewDoppler.style.display = viewName === "doppler" ? "flex" : "none";
  document.getElementById("viewAI").style.display = viewName === "ai" ? "grid" : "none";
  el.sidebarMenu.classList.remove("open");
  if (viewName === "ai") { renderAIView(); aiResetChat(); }
  if (viewName === "telemetry") drawTrendChart();
  if (viewName === "mental") renderMentalView();
  if (viewName === "doppler") renderDopplerMetrics();
  saveState();
}

function selectCrew(idx) {
  state.activeCrewIndex = idx;
  updateProfileUI();
  renderFleetBar();
  renderActiveCrewDetails();
  drawTrendChart();
  renderMentalView();
  if (state.activeView === "ai") { renderAIView(); aiResetChat(); }
  saveState();
}

document.querySelectorAll(".nav-tab").forEach(t => t.addEventListener("click", () => switchView(t.dataset.view)));
el.crewSelect.addEventListener("change", (e) => selectCrew(Number(e.target.value)));

// VISTA PSICOLOGÍA
function renderMentalView() {
  const idx = state.activeCrewIndex;
  const c = CREW_PROFILES[idx];
  const cs = state.crewStates[idx];
  const sleep = getSleepStats(cs);
  const due = isPsychDue(cs);

  el.mentalCrewName.textContent = `${c.name.toUpperCase()} (${c.id})`;
  el.lastTestDay.textContent = `Día ${cs.lastPsychDay}`;
  el.nextTestDay.textContent = `Día ${cs.lastPsychDay + 10}`;
  el.psychScoreDisplay.textContent = `${cs.psychScore}/100`;
  el.valMentalIndex.textContent = cs.psychScore;
  el.valMentalSleepAvg.textContent = sleep.avg.toFixed(1);
  el.mentalSleepContext.textContent = `Sueño prom. ${sleep.avg.toFixed(1)} h/d`;

  setCardState(el.cardMentalIndex, cs.psychScore < 65 ? "critical" : cs.psychScore < 78 ? "warning" : "nominal");
  setCardState(el.cardMentalSleep, sleep.avg < 6.0 ? "warning" : "nominal");

  if (due || cs.autoPsychPending) {
    el.psychDueBadge.textContent = cs.autoPsychPending ? "PROCESANDO..." : "PENDIENTE";
    el.psychDueBadge.className = "badge warn-badge";
    el.psychBanner.className = "psych-status-banner warning";
    el.psychBannerTitle.textContent = cs.autoPsychPending ? "⚡ AUTOGESTIÓN PSICOLÓGICA EN CURSO" : "⏰ EVALUACIÓN PERIÓDICA REQUERIDA";
    el.psychBannerDesc.textContent = "El sistema autónomo ISS está registrando el test de bienestar.";
  } else {
    el.psychDueBadge.textContent = "AL DÍA";
    el.psychDueBadge.className = "badge ok-badge";
    el.psychBanner.className = "psych-status-banner";
    el.psychBannerTitle.textContent = "✓ SEGUIMIENTO AL DÍA";
    el.psychBannerDesc.textContent = `Próxima evaluación en el Día ${cs.lastPsychDay + 10}.`;
  }

  el.psychHistoryList.innerHTML = cs.psychHistory.map(h => `
    <div class="log-entry ${h.score < 65 ? "critical" : h.score < 78 ? "warning" : ""}">
      <strong>[Día ${h.day}] Bienestar: ${h.score}/100</strong> (Ánimo: ${h.mood}/5 · Estrés: ${h.stress}/5)<br/>
      <span style="color:var(--text-dim);">${escapeHtml(h.notes)}</span>
    </div>
  `).join("");
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

document.getElementById("psychForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const idx = state.activeCrewIndex;
  const cs = state.crewStates[idx];
  const currentDay = Math.floor(getMissionDays());
  const mood = Number(document.getElementById("qMood").value);
  const stress = Number(document.getElementById("qStress").value);
  const focus = Number(document.getElementById("qFocus").value);
  const cohesion = Number(document.getElementById("qCohesion").value);
  const notes = document.getElementById("qNotes").value.trim();
  const sleepAvg = getSleepStats(cs).avg;

  const score = Math.round(((mood + stress + focus + cohesion) / 20) * 80 + Math.min(20, (sleepAvg / 7.5) * 20));
  cs.lastPsychDay = currentDay;
  cs.psychScore = score;
  cs.psychHistory.unshift({ day: currentDay, score, mood, stress, focus, cohesion, sleepAvg, notes: notes || "Evaluación manual." });
  if (cs.psychHistory.length > 20) cs.psychHistory.pop();

  document.getElementById("qNotes").value = "";
  addLog(CREW_PROFILES[idx].id, `Evaluación manual registrada (Bienestar: ${score}/100).`, score < 65 ? "critical" : score < 78 ? "warning" : "info");
  renderMentalView();
  renderFleetBar();
  saveState();
});

// ECO-DOPPLER
const DOPPLER_BASE_DIAM = [11.2, 10.4, 12.1];

function getCrewDopplerState(idx) {
  const cs = state.crewStates[idx];
  const v = cs.vitals;
  const isJugular = state.dopplerVessel === "jugular";
  const isSans = cs.clinicalScenario === "sans" || v.iop > 21.0;

  if (isJugular) {
    const psv = cs.mode === "ejercicio" ? 43.5 : isSans ? 14.2 : 26.8;
    const diam = DOPPLER_BASE_DIAM[idx] + (isSans ? 2.4 : 0);
    const level = isSans ? "warning" : "nominal";
    const badgeText = isSans ? "ALERTA ESTASIS" : "FLUJO NOMINAL";
    const finding = isSans ? "Estasis yugular correlacionada con PIO elevada. Indicar LBNP." : cs.mode === "ejercicio" ? "Retorno venoso activo por ejercicio ARED." : "Drenaje anterógrado conservado en 0g.";
    return { psv, diam, ri: 0.64, stasis: isSans ? "GRADO 2" : cs.mode === "ejercicio" ? "GRADO 0" : "GRADO 1", level, badgeText, finding, wave: isSans ? "PLANA / LENTA" : cs.mode === "ejercicio" ? "HIPERDINÁMICA" : "MONOFÁSICA" };
  }
  const psv = 78.0 + (v.hr - 60) * 0.35;
  return { psv, diam: 6.3, ri: 0.68, stasis: "PERFUSIÓN OK", level: "nominal", badgeText: "PERFUSIÓN NOMINAL", finding: "Curva carotídea con pico sistólico nítido.", wave: "TRIFÁSICA" };
}

function renderDopplerMetrics() {
  const isJugular = state.dopplerVessel === "jugular";
  el.dopplerEnvBadge.textContent = isJugular ? "ÓRBITA (0g) — VENA YUGULAR" : "ÓRBITA (0g) — CARÓTIDA COMÚN";
  el.dopplerVesselSelect.value = state.dopplerVessel;

  CREW_PROFILES.forEach((c, idx) => {
    const cs = state.crewStates[idx];
    const d = getCrewDopplerState(idx);
    const card = document.getElementById(`dopplerCard${idx}`);
    const badge = document.getElementById(`dopplerBadge${idx}`);
    card.className = `doppler-card ${d.level}`;
    badge.textContent = d.badgeText;
    badge.className = `badge ${d.level === "warning" ? "warn-badge" : "ok-badge"}`;

    document.getElementById(`dopplerName${idx}`).textContent = `${c.name} (${c.id})`;
    document.getElementById(`dopplerMode${idx}`).textContent = `${c.module.split(" ").pop()} · ${MODE_SHORT[cs.mode]}`;
    document.getElementById(`dopplerWaveType${idx}`).textContent = d.wave;
    document.getElementById(`dopplerPsv${idx}`).textContent = `${d.psv.toFixed(1)} cm/s`;
    document.getElementById(`dopplerDiam${idx}`).textContent = `${d.diam.toFixed(1)} mm`;
    document.getElementById(`dopplerRi${idx}`).textContent = d.ri.toFixed(2);
    document.getElementById(`dopplerStasis${idx}`).textContent = d.stasis;
    document.getElementById(`dopplerFinding${idx}`).textContent = d.finding;
  });
}

el.dopplerVesselSelect.addEventListener("change", (e) => {
  state.dopplerVessel = e.target.value;
  renderDopplerMetrics();
  saveState();
});

// =====================================================================
//  IA CLÍNICA — modelo local, funciona sin conexión con la Tierra
//  1) Línea base personal: media y desviación móviles (EWMA) por
//     tripulante y por actividad (reposo, ejercicio, sueño...).
//  2) Detección de anomalías: puntuación Z respecto a SU propia línea base.
//  3) Predicción: regresión lineal sobre tendencias (sueño, bienestar)
//     y proyección de tasas (hueso, músculo, dosis de radiación).
//  4) Asistente: reglas clínicas basadas en los protocolos del SCADA.
// =====================================================================
const AI_METRICS = [
  { key: "hr", label: "Frecuencia cardíaca", unit: "lpm", floor: 3, dec: 0, card: "hrStatus", get: cs => cs.vitals.hr, expect: (c, m) => c.orbit.hr + m.hrOffset },
  { key: "sys", label: "Presión sistólica", unit: "mmHg", floor: 4, dec: 0, card: "bpStatus", get: cs => cs.vitals.sys, expect: (c, m) => c.orbit.sys + m.sysOffset },
  { key: "spo2", label: "Saturación SpO₂", unit: "%", floor: 1, dec: 0, card: "spo2Status", get: cs => cs.vitals.spo2, expect: () => 98 },
  { key: "temp", label: "Temperatura central", unit: "°C", floor: 0.15, dec: 1, card: "tempStatus", get: cs => cs.vitals.temp, expect: (c, m) => c.orbit.temp + m.tempOffset },
  { key: "rr", label: "Frec. respiratoria", unit: "rpm", floor: 1.5, dec: 0, card: "rrStatus", get: cs => cs.vitals.rr, expect: (c, m) => c.orbit.rr + m.rrOffset },
  { key: "iop", label: "Presión ocular (SANS)", unit: "mmHg", floor: 0.5, dec: 1, card: "sansStatus", get: cs => cs.vitals.iop, expect: c => c.orbit.iop },
  { key: "radRate", label: "Tasa de radiación", unit: "µSv/h", floor: 3, dec: 1, card: "radStatus", get: cs => cs.vitals.radRate, expect: c => c.orbit.radRate },
  { key: "co2", label: "ppCO₂ en camarote", unit: "mmHg", floor: 0.3, dec: 1, card: null, get: cs => cs.localCo2 || 2.8, expect: () => 2.8 }
];
const AI_ALPHA = 0.03;          // velocidad de aprendizaje de la línea base
const AI_Z_WARN = 3;            // desvío para marcar anomalía
const AI_Z_HIGH = 4.5;          // desvío para anomalía severa
const AI_CALIBRATION = 60;      // muestras para considerar la línea base "calibrada"

const AI_RECS = {
  hr: "Reposo de 15 min y repetir la medición; ECG de 12 derivaciones si persiste.",
  sys: "Control de presión cada 30 min e hidratación oral.",
  spo2: "Verificar el sensor y el ECLSS; O₂ suplementario si baja de 92 %.",
  temp: "Controlar la temperatura cada hora; descartar infección o virus latente reactivado.",
  rr: "Revisar el CO₂ ambiental y el nivel de ansiedad; ejercicios de respiración guiada.",
  iop: "Sesión LBNP preventiva y eco-Doppler de vena yugular.",
  radRate: "Trasladarse a la zona más blindada y registrar la dosis en el dosímetro personal.",
  co2: "Aumentar la ventilación del camarote y reubicar el saco de dormir junto a la toma de aire."
};

function getBaseline(idx, mode, metric) {
  if (!state.aiBaselines) state.aiBaselines = {};
  const key = `${idx}|${mode}|${metric.key}`;
  if (!state.aiBaselines[key]) {
    const c = CREW_PROFILES[idx];
    state.aiBaselines[key] = { mean: metric.expect(c, ORBIT_MODES[mode]), variance: metric.floor ** 2, n: 0 };
  }
  return state.aiBaselines[key];
}

function linreg(ys) {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] || 0 };
  const xm = (n - 1) / 2;
  const ym = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  ys.forEach((y, x) => { num += (x - xm) * (y - ym); den += (x - xm) ** 2; });
  const slope = den ? num / den : 0;
  return { slope, intercept: ym - slope * xm };
}

function aiPredictions(idx) {
  const c = CREW_PROFILES[idx];
  const cs = state.crewStates[idx];
  const v = cs.vitals;
  const day = Math.floor(getMissionDays());
  const preds = [];

  const crossing = (label, current, limit, ratePerMonth) => {
    const perDay = ratePerMonth / 30;
    if (current <= limit) return { title: label, value: "Límite superado", detail: `Actual ${formatDelta(current)}% (límite ${limit}%). Reforzar contramedidas.`, level: "warning", days: 0 };
    const days = Math.ceil((limit - current) / perDay);
    return {
      title: label,
      value: `${days} días`,
      detail: `Cruzará ${limit}% cerca del Día ${day + days} (${ratePerMonth}%/mes).`,
      level: days < 30 ? "warning" : "nominal",
      days
    };
  };
  preds.push(crossing("Densidad ósea → -3%", v.boneDelta, -3, c.orbit.boneRatePerMonth));
  preds.push(crossing("Masa muscular → -5%", v.muscleDelta, -5, c.orbit.muscleRatePerMonth));

  const perDay = (v.radRate * 24) / 1000;
  const doseDays = Math.max(0, (600 - v.radTotal) / perDay);
  preds.push({
    title: "Dosis → límite 600 mSv",
    value: doseDays > 365 ? `${(doseDays / 365).toFixed(1)} años` : `${Math.round(doseDays)} días`,
    detail: `Ritmo actual ${perDay.toFixed(2)} mSv/día · acumulado ${v.radTotal.toFixed(1)} mSv.`,
    level: doseDays < 120 ? "warning" : "nominal"
  });

  const sleep = cs.sleepHistory7d;
  const reg = linreg(sleep);
  const next3 = Math.max(3, Math.min(10, reg.intercept + reg.slope * (sleep.length - 1 + 3)));
  const trendTxt = reg.slope < -0.08 ? "en descenso" : reg.slope > 0.08 ? "en mejora" : "estable";
  preds.push({
    title: "Sueño en 3 días",
    value: `${next3.toFixed(1)} h`,
    detail: `Tendencia ${trendTxt} (${reg.slope >= 0 ? "+" : ""}${(reg.slope * 60).toFixed(0)} min/día).`,
    level: next3 < 6 ? "warning" : "nominal",
    slope: reg.slope
  });

  const hist = cs.psychHistory.slice(0, 4).reverse();
  if (hist.length >= 2) {
    const r = linreg(hist.map(h => h.score));
    const proj = Math.max(0, Math.min(100, Math.round(r.intercept + r.slope * hist.length)));
    preds.push({
      title: `Bienestar (Día ${cs.lastPsychDay + 10})`,
      value: `${proj}/100`,
      detail: `Proyección con las últimas ${hist.length} evaluaciones.`,
      level: proj < 65 ? "critical" : proj < 78 ? "warning" : "nominal"
    });
  } else {
    preds.push({ title: "Bienestar", value: `${cs.psychScore}/100`, detail: "Se necesitan 2 evaluaciones para proyectar la tendencia.", level: cs.psychScore < 78 ? "warning" : "nominal" });
  }
  return preds;
}

function runClinicalAI(idx) {
  const c = CREW_PROFILES[idx];
  const cs = state.crewStates[idx];
  const diag = cs.diagnosis;
  const anomalies = [];
  const rows = [];
  let samples = 0;

  AI_METRICS.forEach(metric => {
    const b = getBaseline(idx, cs.mode, metric);
    const value = metric.get(cs);
    const sd = Math.max(metric.floor, Math.sqrt(b.variance));
    const z = (value - b.mean) / sd;
    const inRange = metric.card ? diag.cardStates[metric.card] === "nominal" : value <= 4;
    rows.push({ metric, value, mean: b.mean, sd, z, inRange });
    if (Math.abs(z) >= AI_Z_WARN) anomalies.push({ metric, value, mean: b.mean, z, inRange, severe: Math.abs(z) >= AI_Z_HIGH });
    // Aprendizaje robusto: los valores anómalos no "contaminan" la línea base
    if (Math.abs(z) < 2.5) {
      const dev = value - b.mean;
      b.mean += AI_ALPHA * dev;
      b.variance = (1 - AI_ALPHA) * b.variance + AI_ALPHA * dev * dev;
      b.n++;
    }
    samples += b.n;
  });
  samples = Math.round(samples / AI_METRICS.length);

  // Registro en bitácora: solo cuando aparece o desaparece una anomalía
  const prevKeys = cs.aiActiveKeys || [];
  const nowKeys = anomalies.map(a => a.metric.key);
  anomalies.filter(a => !prevKeys.includes(a.metric.key)).forEach(a => {
    const anticip = a.inRange ? " Aún dentro del rango normal: ALERTA ANTICIPADA." : "";
    addLog(c.id, `IA · Anomalía en ${a.metric.label}: ${a.value.toFixed(a.metric.dec)} ${a.metric.unit} (${a.z >= 0 ? "+" : ""}${a.z.toFixed(1)}σ sobre su línea base ${a.mean.toFixed(a.metric.dec)}).${anticip}`, a.severe ? "critical" : "warning");
  });
  prevKeys.filter(k => !nowKeys.includes(k)).forEach(k => {
    const m = AI_METRICS.find(x => x.key === k);
    if (m) addLog(c.id, `IA · ${m.label} volvió a su línea base personal.`, "info");
  });
  cs.aiActiveKeys = nowKeys;

  // Riesgo predicho a 48 h (0–100) con los factores que lo explican
  const preds = aiPredictions(idx);
  const sleep = getSleepStats(cs);
  const sleepPred = preds.find(p => p.title.startsWith("Sueño"));
  const factors = [];
  const addF = (name, pts) => { if (pts > 0.5) factors.push({ name, pts: Math.round(pts) }); };
  addF("Déficit de sueño", Math.min(30, Math.max(0, 7.5 - sleep.avg) * 12) + (sleep.last < 6 ? 10 : 0));
  addF("Sueño en descenso", Math.min(10, Math.max(0, -(sleepPred.slope || 0)) * 25));
  addF("Bienestar psicológico bajo", Math.min(25, Math.max(0, 85 - cs.psychScore)));
  addF("Anomalías fisiológicas", Math.min(35, anomalies.reduce((s, a) => s + (a.severe ? 20 : 12), 0)));
  addF(diag.level === "critical" ? "Alarma crítica activa" : "Alarma activa", diag.level === "critical" ? 35 : diag.level === "warning" ? 15 : 0);
  addF("Hueso o músculo cerca del límite", preds.some(p => p.days !== undefined && p.days < 30) ? 8 : 0);
  factors.sort((a, b) => b.pts - a.pts);
  const risk = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.pts, 0)));
  const riskLevel = risk >= 60 ? "critical" : risk >= 30 ? "warning" : "nominal";

  // Aptitud para tareas críticas (EVA, pilotaje, brazo robótico)
  const reasons = [];
  let fit = "APTO";
  const vitalSevere = anomalies.some(a => a.severe && ["hr", "spo2", "temp", "radRate"].includes(a.metric.key));
  if (diag.level === "critical" || vitalSevere || sleep.last < 5) {
    fit = "NO APTO";
    if (diag.level === "critical") reasons.push(`Alarma crítica: ${diag.title.toLowerCase()}.`);
    if (vitalSevere) reasons.push("Anomalía severa en un signo vital clave.");
    if (sleep.last < 5) reasons.push(`Durmió solo ${sleep.last.toFixed(1)} h: alto riesgo de microsueños.`);
  } else {
    if (diag.level === "warning") reasons.push(`Alarma activa: ${diag.shortStatus}.`);
    if (anomalies.length) reasons.push(`${anomalies.length} anomalía(s) respecto a su línea base.`);
    if (sleep.last < 6) reasons.push(`Sueño insuficiente anoche (${sleep.last.toFixed(1)} h).`);
    if (cs.psychScore < 65) reasons.push(`Índice de bienestar bajo (${cs.psychScore}/100).`);
    if (risk >= 60) reasons.push(`Riesgo predicho alto (${risk}/100).`);
    if (reasons.length) fit = "CON RESTRICCIONES";
  }
  if (!reasons.length) reasons.push("Signos vitales dentro de su patrón personal y descanso adecuado.");

  cs.ai = { anomalies, rows, preds, risk, riskLevel, factors, fit, reasons, samples };
}

// ===================== VISTA: IA CLÍNICA =====================
const aiEl = {
  crewName: document.getElementById("aiCrewName"),
  gauge: document.getElementById("aiGauge"),
  riskLabel: document.getElementById("aiRiskLabel"),
  fitCard: document.getElementById("aiFitCard"),
  fitValue: document.getElementById("aiFitValue"),
  fitReasons: document.getElementById("aiFitReasons"),
  samples: document.getElementById("aiSamples"),
  learnFill: document.getElementById("aiLearnFill"),
  learnState: document.getElementById("aiLearnState"),
  anomalyCount: document.getElementById("aiAnomalyCount"),
  anomalyList: document.getElementById("aiAnomalyList"),
  predGrid: document.getElementById("aiPredGrid"),
  chat: document.getElementById("aiChat"),
  questions: document.getElementById("aiQuestions"),
  ranking: document.getElementById("aiRanking"),
  navBadge: document.getElementById("aiNavBadge")
};
const LEVEL_TXT = { nominal: "BAJO", warning: "MODERADO", critical: "ALTO" };

function renderAIView() {
  const idx = state.activeCrewIndex;
  const c = CREW_PROFILES[idx];
  const cs = state.crewStates[idx];
  if (!cs.ai) return;
  const ai = cs.ai;

  aiEl.crewName.textContent = `${c.name.toUpperCase()} (${c.id})`;
  drawAIGauge(ai.risk, ai.riskLevel);
  aiEl.riskLabel.textContent = `Riesgo ${LEVEL_TXT[ai.riskLevel].toLowerCase()}${ai.factors[0] ? ` · principal factor: ${ai.factors[0].name.toLowerCase()}` : ""}`;
  aiEl.riskLabel.className = `ai-risk-label ${ai.riskLevel}`;

  const fitLevel = ai.fit === "APTO" ? "nominal" : ai.fit === "NO APTO" ? "critical" : "warning";
  aiEl.fitCard.className = `ai-card ai-fit-card ${fitLevel}`;
  aiEl.fitValue.textContent = ai.fit;
  aiEl.fitReasons.innerHTML = ai.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join("");

  const progress = Math.min(1, ai.samples / AI_CALIBRATION);
  aiEl.samples.textContent = ai.samples;
  aiEl.learnFill.style.width = `${Math.round(progress * 100)}%`;
  aiEl.learnState.textContent = progress >= 1 ? `Calibrada · actividad: ${MODE_SHORT[cs.mode]}` : `Calibrando… ${Math.round(progress * 100)}% (${MODE_SHORT[cs.mode]})`;

  aiEl.anomalyCount.textContent = ai.anomalies.length ? `${ai.anomalies.length} ANOMALÍA(S)` : "SIN ANOMALÍAS";
  aiEl.anomalyCount.className = `badge ${ai.anomalies.length ? (ai.anomalies.some(a => a.severe) ? "crit-badge" : "warn-badge") : "ok-badge"}`;
  aiEl.anomalyList.innerHTML = ai.rows.map(r => {
    const zc = Math.max(-6, Math.min(6, r.z));
    const pos = 50 + (zc / 6) * 50;
    const lvl = Math.abs(r.z) >= AI_Z_HIGH ? "critical" : Math.abs(r.z) >= AI_Z_WARN ? "warning" : "nominal";
    return `
      <div class="ai-row ${lvl}">
        <div class="ai-row-name">${r.metric.label}</div>
        <div class="ai-row-val mono">${r.value.toFixed(r.metric.dec)} <small>${r.metric.unit}</small></div>
        <div class="ai-dev" title="Banda azul = su rango habitual (±2σ)">
          <div class="ai-dev-band"></div>
          <div class="ai-dev-center"></div>
          <div class="ai-dev-marker ${lvl}" style="left:${pos}%"></div>
        </div>
        <div class="ai-row-z mono ${lvl}">${r.z >= 0 ? "+" : ""}${r.z.toFixed(1)}σ</div>
        <div class="ai-row-base mono">base ${r.mean.toFixed(r.metric.dec)}</div>
      </div>`;
  }).join("");

  aiEl.predGrid.innerHTML = ai.preds.map(p => `
    <div class="ai-pred ${p.level}">
      <span class="ai-pred-title">${p.title}</span>
      <span class="ai-pred-value mono">${p.value}</span>
      <span class="ai-pred-detail">${p.detail}</span>
    </div>`).join("");

  const ranked = CREW_PROFILES.map((cc, i) => ({ cc, i, ai: state.crewStates[i].ai })).filter(r => r.ai).sort((a, b) => b.ai.risk - a.ai.risk);
  aiEl.ranking.innerHTML = ranked.map((r, pos) => `
    <div class="ai-rank ${r.i === idx ? "active" : ""}" data-crew="${r.i}">
      <span class="ai-rank-pos mono">${pos + 1}</span>
      <div class="ai-rank-info">
        <strong>${escapeHtml(r.cc.name)}</strong>
        <div class="ai-rank-bar"><div class="${r.ai.riskLevel}" style="width:${Math.max(3, r.ai.risk)}%"></div></div>
      </div>
      <span class="ai-rank-score mono">${r.ai.risk}</span>
      <span class="badge ${r.ai.fit === "APTO" ? "ok-badge" : r.ai.fit === "NO APTO" ? "crit-badge" : "warn-badge"}">${r.ai.fit}</span>
    </div>`).join("");
}

function renderAINavBadge() {
  const total = state.crewStates.reduce((s, cs) => s + (cs.ai ? cs.ai.anomalies.length : 0), 0);
  aiEl.navBadge.style.display = total ? "inline-block" : "none";
  aiEl.navBadge.textContent = total;
}

function drawAIGauge(score, level) {
  const fit = fitCanvas(aiEl.gauge);
  if (!fit) return;
  const { ctx, w, h } = fit;
  const cx = w / 2, cy = h - 12, r = Math.min(w / 2 - 14, h - 26);
  const col = level === "critical" ? COLORS.critical : level === "warning" ? COLORS.warning : COLORS.blue;
  ctx.clearRect(0, 0, w, h);

  ctx.lineWidth = 14;
  ctx.strokeStyle = "#e3eefa";
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI); ctx.stroke();
  // Zonas de referencia (bajo / moderado / alto) como marcas finas por fuera
  [[0, 0.3, COLORS.blueLight], [0.3, 0.6, "#f3c46b"], [0.6, 1, "#ef8f8f"]].forEach(([a, b, cc]) => {
    ctx.lineWidth = 3;
    ctx.strokeStyle = cc;
    ctx.beginPath(); ctx.arc(cx, cy, r + 11, Math.PI + a * Math.PI, Math.PI + b * Math.PI); ctx.stroke();
  });
  const grad = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
  grad.addColorStop(0, hexToRgba(col, 0.55));
  grad.addColorStop(1, col);
  ctx.lineWidth = 14;
  ctx.strokeStyle = grad;
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.max(0.01, score / 100) * Math.PI); ctx.stroke();

  const ang = Math.PI + (score / 100) * Math.PI;
  ctx.beginPath();
  ctx.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#fff"; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.navy;
  ctx.font = "800 26px 'JetBrains Mono', Consolas, monospace";
  ctx.fillText(String(score), cx, cy - 8);
  ctx.font = FONT;
  ctx.fillStyle = COLORS.dim;
  ctx.fillText("/100", cx, cy + 6);
  ctx.textAlign = "left";
}

// ---------- Asistente clínico (preguntas y respuestas sin conexión) ----------
const AI_QUESTIONS = [
  { id: "resumen", text: "¿Cómo está en general?" },
  { id: "apto", text: "¿Puede hacer tareas críticas hoy?" },
  { id: "sueno", text: "¿Cómo está su sueño?" },
  { id: "riesgo", text: "¿Cuál es su mayor riesgo?" },
  { id: "accion", text: "¿Qué debo hacer ahora?" },
  { id: "futuro", text: "¿Qué pasará en las próximas semanas?" }
];
let aiChatLog = [];
let aiChatCrew = null;

function firstName(idx) { return crewIdentities[idx] ? crewIdentities[idx].nombre : CREW_PROFILES[idx].name; }

function aiAnswer(q, idx) {
  const cs = state.crewStates[idx];
  const ai = cs.ai;
  const name = escapeHtml(firstName(idx));
  const sleep = getSleepStats(cs);
  const list = items => `<ul>${items.map(i => `<li>${i}</li>`).join("")}</ul>`;
  const anomTxt = a => `<b>${a.metric.label}</b>: ${a.value.toFixed(a.metric.dec)} ${a.metric.unit} (${a.z >= 0 ? "+" : ""}${a.z.toFixed(1)}σ; lo habitual en ${name} es ${a.mean.toFixed(a.metric.dec)})${a.inRange ? " — <i>todavía dentro del rango normal, aviso anticipado</i>" : ""}`;

  switch (q) {
    case "resumen":
      return `Analicé <b>${ai.samples} muestras</b> de ${name}. Su riesgo predicho para las próximas 48 h es <b>${ai.risk}/100 (${LEVEL_TXT[ai.riskLevel].toLowerCase()})</b>.` +
        (ai.anomalies.length ? ` Detecté ${ai.anomalies.length} desvío(s) respecto a su patrón personal:${list(ai.anomalies.map(anomTxt))}` : " Todos sus signos vitales están dentro de su patrón personal.") +
        ` Durmió <b>${sleep.last.toFixed(1)} h</b> anoche (promedio ${sleep.avg.toFixed(1)} h) y su bienestar es <b>${cs.psychScore}/100</b>.`;
    case "apto":
      return `Veredicto: <b>${ai.fit}</b> para tareas críticas (caminata espacial, pilotaje, brazo robótico).${list(ai.reasons.map(escapeHtml))}` +
        (ai.fit === "APTO" ? "Puede realizar la tarea con el monitoreo habitual." : ai.fit === "NO APTO" ? "Recomiendo reasignar la tarea a otro tripulante y priorizar su recuperación." : "Puede trabajar, pero conviene mover las tareas críticas para más tarde o asignar un compañero de apoyo.");
    case "sueno": {
      const p = ai.preds.find(x => x.title.startsWith("Sueño"));
      const tips = [];
      if (sleep.avg < 7) tips.push("Activar luz cálida (sin azul) en su camarote 1 h antes de dormir.");
      if (sleep.last < 6) tips.push("Evitar asignarle tareas críticas en las primeras horas del turno.");
      if (cs.sleepEfficiency < 85) tips.push("Revisar ruido y ventilación del camarote (despertares frecuentes).");
      tips.push("Mantener el mismo horario de sueño todos los días para estabilizar el ritmo circadiano.");
      return `${name} durmió <b>${sleep.last.toFixed(1)} h</b> anoche; su promedio de 7 días es <b>${sleep.avg.toFixed(1)} h</b> (meta 7.5 h) con eficiencia de ${cs.sleepEfficiency}%. ` +
        `${p.detail} Predicción para dentro de 3 días: <b>${p.value}</b>.${list(tips)}`;
    }
    case "riesgo":
      return ai.factors.length
        ? `Estos son los factores que más pesan en su riesgo (${ai.risk}/100):${list(ai.factors.map(f => `${escapeHtml(f.name)}: <b>+${f.pts}</b>`))}El principal es <b>${escapeHtml(ai.factors[0].name.toLowerCase())}</b>.`
        : `No encuentro factores de riesgo relevantes para ${name} en este momento.`;
    case "accion": {
      const acts = [];
      if (cs.diagnosis.level !== "nominal") cs.diagnosis.steps.forEach(s => acts.push(escapeHtml(s)));
      ai.anomalies.forEach(a => acts.push(AI_RECS[a.metric.key]));
      if (sleep.avg < 6.5) acts.push("Programar un período de descanso extra de 1–2 h.");
      if (cs.psychScore < 78) acts.push("Agendar una videollamada con su familia y una actividad que disfrute.");
      return acts.length ? `Recomendaciones para ${name}, en orden de prioridad:${list([...new Set(acts)])}` : `${name} está estable. Mantener el monitoreo continuo y su rutina diaria de ejercicio.`;
    }
    case "futuro":
      return `Proyecciones para ${name} con su ritmo actual:${list(ai.preds.map(p => `<b>${p.title}</b>: ${p.value} — ${p.detail}`))}`;
    default:
      return "No entendí la consulta.";
  }
}

function renderAIChat() {
  aiEl.chat.innerHTML = aiChatLog.map(m => `
    <div class="ai-msg ${m.role}">
      ${m.role === "ai" ? '<span class="ai-avatar">IA</span>' : ""}
      <div class="ai-bubble">${m.html}${m.role === "ai" && m.ms !== undefined ? `<span class="ai-meta">Calculado a bordo en ${m.ms} ms · sin conexión</span>` : ""}</div>
    </div>`).join("");
  aiEl.chat.scrollTop = aiEl.chat.scrollHeight;
}

function aiResetChat() {
  const idx = state.activeCrewIndex;
  if (aiChatCrew === idx && aiChatLog.length) return;
  aiChatCrew = idx;
  aiChatLog = [{ role: "ai", html: `Hola, soy el asistente clínico de a bordo. Estoy analizando a <b>${escapeHtml(CREW_PROFILES[idx].name)}</b>. Elige una pregunta.` }];
  if (state.crewStates[idx].ai) {
    const t0 = performance.now();
    const html = aiAnswer("resumen", idx);
    aiChatLog.push({ role: "ai", html, ms: Math.max(1, Math.round(performance.now() - t0)) });
  }
  renderAIChat();
}

aiEl.questions.innerHTML = AI_QUESTIONS.map(q => `<button type="button" class="ai-q" data-q="${q.id}">${q.text}</button>`).join("");
aiEl.questions.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-q]");
  if (!btn) return;
  const idx = state.activeCrewIndex;
  const q = AI_QUESTIONS.find(x => x.id === btn.dataset.q);
  aiChatLog.push({ role: "user", html: escapeHtml(q.text) });
  aiChatLog.push({ role: "ai", html: '<span class="ai-typing"><i></i><i></i><i></i></span>' });
  renderAIChat();
  setTimeout(() => {
    const t0 = performance.now();
    const html = aiAnswer(q.id, idx);
    aiChatLog[aiChatLog.length - 1] = { role: "ai", html, ms: Math.max(1, Math.round(performance.now() - t0)) };
    if (aiChatLog.length > 30) aiChatLog.splice(1, 2);
    renderAIChat();
  }, 450);
});

aiEl.ranking.addEventListener("pointerdown", (e) => {
  const row = e.target.closest("[data-crew]");
  if (row) selectCrew(Number(row.dataset.crew));
});

// ===================== CANVAS: utilidades =====================
function fitCanvas(canvas) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return null; // la vista está oculta
  const dpr = Math.max(2, window.devicePixelRatio || 1); // mínimo 2x: líneas nítidas en cualquier pantalla
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  return { ctx, w, h };
}

const COLORS = {
  navy: "#0b2545", navy2: "#1d4477", blue: "#1f6fd1", blueMid: "#3b8beb", blueLight: "#8fc1f2", bluePale: "#c4dff8",
  dim: "#5a7393", grid: "#e6eef8", axis: "#c9dbee",
  nominal: "#15a05a", warning: "#d98a06", critical: "#d92d2d",
  trace: "#7fd4ff", traceCrit: "#ff7070"
};
const FONT = "600 10px Inter, 'Segoe UI', sans-serif";
const FONT_BOLD = "700 10px Inter, 'Segoe UI', sans-serif";

// Cuadrícula de monitor (fondo oscuro): líneas finas y cada 5, líneas más marcadas.
function drawScreenGrid(ctx, w, h, step = 12) {
  for (let i = 0, x = 0; x < w; x += step, i++) {
    ctx.strokeStyle = i % 5 === 0 ? "rgba(143,193,242,0.20)" : "rgba(143,193,242,0.08)";
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
  }
  for (let i = 0, y = 0; y < h; y += step, i++) {
    ctx.strokeStyle = i % 5 === 0 ? "rgba(143,193,242,0.20)" : "rgba(143,193,242,0.08)";
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

// Línea suavizada (curvas entre puntos medios) para que las tendencias no se vean "quebradas".
function tracePath(ctx, pts) {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

function drawSeries(ctx, pts, color, baseY, { width = 2.4, fill = true, dashed = false } = {}) {
  if (pts.length < 2) return;
  if (fill) {
    // El degradado va desde el punto más alejado de la base hacia la base (sirve para curvas que suben o bajan).
    const far = pts.reduce((m, p) => (Math.abs(p.y - baseY) > Math.abs(m - baseY) ? p.y : m), pts[0].y);
    const grad = ctx.createLinearGradient(0, far === baseY ? baseY - 1 : far, 0, baseY);
    grad.addColorStop(0, hexToRgba(color, 0.28));
    grad.addColorStop(1, hexToRgba(color, 0.02));
    ctx.beginPath();
    tracePath(ctx, pts);
    ctx.lineTo(pts[pts.length - 1].x, baseY);
    ctx.lineTo(pts[0].x, baseY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dashed ? [5, 4] : []);
  ctx.beginPath();
  tracePath(ctx, pts);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawDot(ctx, x, y, color) {
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = color;
  ctx.stroke();
}

// Etiqueta tipo "píldora" con el valor actual.
function drawPill(ctx, text, x, y, bg, fg = "#ffffff", align = "left") {
  ctx.font = FONT_BOLD;
  const tw = ctx.measureText(text).width;
  const pw = tw + 12, ph = 17;
  let px = align === "right" ? x - pw : align === "center" ? x - pw / 2 : x;
  px = Math.max(2, Math.min(px, ctx.canvas.clientWidth - pw - 2));
  const py = y - ph / 2;
  ctx.fillStyle = bg;
  roundRect(ctx, px, py, pw, ph, 8.5);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, px + 6, y + 0.5);
  ctx.textBaseline = "alphabetic";
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ===================== GRÁFICO DE TENDENCIAS =====================
function setLegend(items) {
  el.trendLegend.innerHTML = items
    .map(i => `<span class="legend-item"><span class="legend-swatch" style="background:${i.color}${i.dashed ? ";background:repeating-linear-gradient(90deg," + i.color + " 0 4px,transparent 4px 7px)" : ""}"></span>${i.label}</span>`)
    .join("");
}

function drawAxes(ctx, w, pad, ph, ticks, yAt, fmt) {
  ctx.font = FONT;
  ctx.textAlign = "right";
  ticks.forEach(v => {
    const y = Math.round(yAt(v)) + 0.5;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(fmt(v), pad.l - 6, y + 3);
  });
  ctx.textAlign = "left";
}

function drawTrendChart() {
  const fit = fitCanvas(el.trendCanvas);
  if (!fit) return;
  const { ctx, w, h } = fit;
  const c = CREW_PROFILES[state.activeCrewIndex];
  const cs = state.crewStates[state.activeCrewIndex];
  const pad = { l: 38, r: state.activeChart === "daily" ? 34 : 14, t: 14, b: 20 };
  const pw = w - pad.l - pad.r;
  const ph = h - pad.t - pad.b;
  const baseY = pad.t + ph;

  ctx.clearRect(0, 0, w, h);
  const yScale = (val, min, max) => pad.t + ph - ((val - min) / (max - min)) * ph;

  if (state.activeChart === "mission") {
    const days = 180;
    const minY = -10, maxY = 0;
    const yAt = v => yScale(v, minY, maxY);
    const xAt = d => pad.l + (Math.min(d, days) / days) * pw;
    const today = getMissionDays();

    // Zonas de riesgo sombreadas
    ctx.fillStyle = "rgba(217,138,6,0.07)";
    ctx.fillRect(pad.l, yAt(-3), pw, yAt(-5) - yAt(-3));
    ctx.fillStyle = "rgba(217,45,45,0.06)";
    ctx.fillRect(pad.l, yAt(-5), pw, yAt(-10) - yAt(-5));

    drawAxes(ctx, w, pad, ph, [0, -2.5, -5, -7.5, -10], yAt, v => `${v}%`);
    ctx.font = FONT;
    ctx.fillStyle = COLORS.dim;
    [0, 45, 90, 135, 180].forEach(d => {
      ctx.textAlign = d === 0 ? "left" : d === 180 ? "right" : "center";
      ctx.fillText(`Día ${d}`, xAt(d), h - 5);
    });
    ctx.textAlign = "left";

    const series = [
      { val: cs.vitals.muscleDelta, color: COLORS.blue, name: "Músculo" },
      { val: cs.vitals.boneDelta, color: COLORS.navy, name: "Hueso" }
    ];
    const todayX = xAt(today);
    series.forEach(s => {
      const slope = today > 0 ? s.val / today : 0;
      const real = [];
      const steps = 24;
      for (let k = 0; k <= steps; k++) {
        const d = (Math.min(today, days) * k) / steps;
        real.push({ x: xAt(d), y: yAt(Math.max(minY, slope * d)) });
      }
      drawSeries(ctx, real, s.color, yAt(0), { fill: true });
      if (today < days) {
        drawSeries(ctx, [{ x: todayX, y: yAt(Math.max(minY, s.val)) }, { x: xAt(days), y: yAt(Math.max(minY, slope * days)) }], s.color, baseY, { fill: false, dashed: true, width: 1.8 });
      }
    });

    // Marcador "HOY"
    ctx.strokeStyle = "rgba(11,37,69,0.35)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(todayX, pad.t); ctx.lineTo(todayX, baseY); ctx.stroke();
    ctx.setLineDash([]);
    drawPill(ctx, `HOY · Día ${Math.floor(today)}`, todayX, baseY - 10, COLORS.navy, "#fff", "center");
    // Etiquetas de valor separadas al menos 20 px para que no se encimen
    const labels = series
      .map(s => ({ s, y: yAt(Math.max(minY, s.val)) }))
      .sort((a, b) => a.y - b.y);
    let lastY = -Infinity;
    labels.forEach(l => {
      drawDot(ctx, todayX, l.y, l.s.color);
      const ly = Math.max(l.y + 12, lastY + 20);
      lastY = ly;
      drawPill(ctx, `${l.s.name} ${formatDelta(l.s.val)}%`, todayX + 10, ly, l.s.color);
    });

    setLegend([
      { color: COLORS.blue, label: `Masa muscular (${c.orbit.muscleRatePerMonth}%/mes)` },
      { color: COLORS.navy, label: `Densidad ósea (${c.orbit.boneRatePerMonth}%/mes)` },
      { color: COLORS.dim, label: "Proyección", dashed: true },
      { color: "rgba(217,138,6,0.5)", label: "Zona de alerta (-3% a -5%)" },
      { color: "rgba(217,45,45,0.45)", label: "Zona crítica (< -5%)" }
    ]);
  } else if (state.activeChart === "daily") {
    const hr = cs.history24h.hr;
    const temp = cs.history24h.temp;
    const n = hr.length;
    const xAt = i => pad.l + (i / (n - 1)) * pw;
    const hrMin = 40, hrMax = 160, tMin = 36.0, tMax = 38.5;
    drawAxes(ctx, w, pad, ph, [40, 70, 100, 130, 160], v => yScale(v, hrMin, hrMax), v => `${v}`);
    // Eje derecho de temperatura
    ctx.font = FONT;
    ctx.fillStyle = COLORS.blueMid;
    [36, 37, 38].forEach(t => ctx.fillText(`${t}°`, w - 30, yScale(t, tMin, tMax) + 3));
    ctx.fillStyle = COLORS.dim;
    [["-24 h", 0], ["-12 h", (n - 1) / 2], ["Ahora", n - 1]].forEach(([lbl, i]) => {
      ctx.textAlign = i === 0 ? "left" : i === n - 1 ? "right" : "center";
      ctx.fillText(lbl, xAt(i), h - 5);
    });
    ctx.textAlign = "left";

    const hrPts = hr.map((v, i) => ({ x: xAt(i), y: yScale(Math.max(hrMin, Math.min(hrMax, v)), hrMin, hrMax) }));
    const tPts = temp.map((v, i) => ({ x: xAt(i), y: yScale(Math.max(tMin, Math.min(tMax, v)), tMin, tMax) }));
    drawSeries(ctx, tPts, COLORS.blueLight, baseY, { fill: true, width: 2 });
    drawSeries(ctx, hrPts, COLORS.blue, baseY, { fill: true, width: 2.6 });

    const lastHr = hrPts[n - 1], lastT = tPts[n - 1];
    drawDot(ctx, lastHr.x, lastHr.y, COLORS.blue);
    drawDot(ctx, lastT.x, lastT.y, COLORS.blueMid);
    // La etiqueta de la curva que está más arriba va encima; la otra, debajo (nunca se enciman).
    const hrOnTop = lastHr.y <= lastT.y;
    const upperY = Math.max(pad.t + 8, Math.min(lastHr.y, lastT.y) - 14);
    const lowerY = Math.max(upperY + 20, Math.max(lastHr.y, lastT.y) + 14);
    drawPill(ctx, `${hr[n - 1]} lpm`, lastHr.x - 10, hrOnTop ? upperY : lowerY, COLORS.blue, "#fff", "right");
    drawPill(ctx, `${temp[n - 1]} °C`, lastT.x - 10, hrOnTop ? lowerY : upperY, COLORS.blueMid, "#fff", "right");

    setLegend([
      { color: COLORS.blue, label: "Frecuencia cardíaca (lpm, eje izq.)" },
      { color: COLORS.blueLight, label: "Temperatura central (°C, eje der.)" }
    ]);
  } else {
    const arr = cs.sleepHistory7d;
    const maxY = 10, minY = 0, target = 7.5;
    const yAt = v => yScale(v, minY, maxY);
    const slot = pw / arr.length;

    drawAxes(ctx, w, pad, ph, [0, 2, 4, 6, 8, 10], yAt, v => `${v}h`);

    arr.forEach((v, i) => {
      const bw = Math.min(42, slot * 0.58);
      const x = pad.l + i * slot + (slot - bw) / 2;
      const y = yAt(v);
      const col = v < 6 ? COLORS.warning : v > 9 ? COLORS.navy : COLORS.blue;
      const grad = ctx.createLinearGradient(0, y, 0, baseY);
      grad.addColorStop(0, col);
      grad.addColorStop(1, hexToRgba(col === COLORS.blue ? COLORS.blueLight : col, 0.55));
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, bw, baseY - y, 6);
      ctx.fill();
      ctx.font = FONT_BOLD;
      ctx.fillStyle = COLORS.navy;
      ctx.textAlign = "center";
      ctx.fillText(v.toFixed(1), x + bw / 2, y - 4);
      ctx.font = FONT;
      ctx.fillStyle = COLORS.dim;
      ctx.fillText(i === arr.length - 1 ? "Anoche" : `-${arr.length - 1 - i}d`, x + bw / 2, h - 5);
      ctx.textAlign = "left";
    });

    [[target, COLORS.blueMid, "Meta 7.5 h"], [6, COLORS.warning, "Mínimo 6 h"]].forEach(([v, col, lbl]) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(pad.l, yAt(v)); ctx.lineTo(w - pad.r, yAt(v)); ctx.stroke();
      ctx.setLineDash([]);
      drawPill(ctx, lbl, w - pad.r, yAt(v), col, "#fff", "right");
    });

    const s = getSleepStats(cs);
    setLegend([
      { color: COLORS.blue, label: "Sueño adecuado" },
      { color: COLORS.warning, label: "Déficit (< 6 h)" },
      { color: COLORS.navy, label: "Exceso (> 9 h)" },
      { color: COLORS.dim, label: `Promedio 7 días: ${s.avg.toFixed(1)} h · Eficiencia ${cs.sleepEfficiency}%` }
    ]);
  }
}

document.querySelectorAll(".trend-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    state.activeChart = tab.dataset.chart;
    document.querySelectorAll(".trend-tab").forEach(t => t.classList.toggle("active", t === tab));
    drawTrendChart();
    saveState();
  });
});

// ===================== ECG Y DOPPLER ANIMADOS =====================
function gauss(x, mu, sigma, amp) { return amp * Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2)); }

function ecgShape(p) {
  return gauss(p, 0.10, 0.025, 0.12) +   // onda P
         gauss(p, 0.20, 0.008, -0.12) +  // Q
         gauss(p, 0.23, 0.010, 1.0) +    // R
         gauss(p, 0.26, 0.010, -0.25) +  // S
         gauss(p, 0.45, 0.045, 0.30);    // onda T
}

function drawEcg(nowSec) {
  const fit = fitCanvas(el.ecgCanvas);
  if (!fit) return;
  const { ctx, w, h } = fit;
  const cs = state.crewStates[state.activeCrewIndex];
  const crit = cs.diagnosis && cs.diagnosis.cardStates.hrStatus === "critical";
  const hr = cs.vitals.hr;
  const pxPerSec = 120;
  const color = crit ? COLORS.traceCrit : COLORS.trace;
  const yOf = x => {
    const t = nowSec - (w - x) / pxPerSec;
    const phase = ((t * hr) / 60) % 1;
    return h * 0.72 - ecgShape(phase) * h * 0.62;
  };

  ctx.clearRect(0, 0, w, h);
  drawScreenGrid(ctx, w, h, 8);

  // Trazo con brillo (glow) para que se vea como un monitor real
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= w; x++) {
    const y = yOf(x);
    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // Desvanecido a la izquierda (efecto barrido)
  const fade = ctx.createLinearGradient(0, 0, w * 0.18, 0);
  fade.addColorStop(0, "rgba(10,31,60,0.9)");
  fade.addColorStop(1, "rgba(10,31,60,0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w * 0.18, h);

  // Punto brillante en la cabeza del trazo
  const headY = yOf(w - 1);
  ctx.beginPath();
  ctx.arc(w - 3, headY, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Frecuencia en grande sobre el monitor
  ctx.font = "700 13px 'JetBrains Mono', Consolas, monospace";
  ctx.fillStyle = color;
  ctx.textAlign = "right";
  ctx.fillText(`♥ ${hr}`, w - 10, 15);
  ctx.textAlign = "left";
}

function drawDoppler(nowSec) {
  const isJugular = state.dopplerVessel === "jugular";
  CREW_PROFILES.forEach((c, idx) => {
    const canvas = document.getElementById(`dopplerCanvas${idx}`);
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const { ctx, w, h } = fit;
    const cs = state.crewStates[idx];
    const d = getCrewDopplerState(idx);
    const base = h * 0.84;
    const amp = Math.min(1, d.psv / 100) * h * 0.74;
    const hr = cs.vitals.hr;
    const rr = cs.vitals.rr;
    const col = d.level === "warning" ? "#ffb547" : COLORS.trace;

    ctx.clearRect(0, 0, w, h);
    drawScreenGrid(ctx, w, h, 10);
    ctx.strokeStyle = "rgba(196,223,248,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, base + 0.5); ctx.lineTo(w, base + 0.5); ctx.stroke();

    const pts = [];
    for (let x = 0; x <= w; x += 2) {
      const t = nowSec - (w - x) / 90;
      let y;
      if (isJugular) {
        const resp = 0.6 + 0.4 * Math.sin((t * rr / 60) * 2 * Math.PI);
        const pulse = 0.85 + 0.15 * Math.sin(((t * hr) / 60) * 2 * Math.PI);
        y = base - amp * resp * pulse;
      } else {
        const p = ((t * hr) / 60) % 1;
        y = base - amp * (gauss(p, 0.12, 0.035, 1.0) + gauss(p, 0.32, 0.05, 0.35) + 0.22);
      }
      pts.push({ x, y });
    }

    // Relleno espectral (degradado) + contorno brillante
    const grad = ctx.createLinearGradient(0, base - amp, 0, base);
    grad.addColorStop(0, hexToRgba(col, 0.85));
    grad.addColorStop(0.6, hexToRgba(col, 0.35));
    grad.addColorStop(1, hexToRgba(col, 0.04));
    ctx.beginPath();
    ctx.moveTo(0, base);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(w, base);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = "#e9f6ff";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.restore();

    // Escala de velocidad (cm/s)
    ctx.font = "600 9px 'JetBrains Mono', Consolas, monospace";
    ctx.fillStyle = "rgba(196,223,248,0.75)";
    ctx.fillText("0", 4, base - 3);
    ctx.fillText(`${Math.round(d.psv)} cm/s`, 4, Math.max(11, base - amp + 10));
  });
}

function animationLoop(ts) {
  const nowSec = ts / 1000;
  if (state.activeView === "telemetry") drawEcg(nowSec);
  if (state.activeView === "doppler") drawDoppler(nowSec);
  requestAnimationFrame(animationLoop);
}

// ===================== RELOJ, VELOCIDAD, EXPORTAR, REINICIAR =====================
function updateClock() {
  const s = Math.floor(state.metSeconds);
  const d = Math.floor(s / 86400);
  const hh = Math.floor((s % 86400) / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad2 = n => String(n).padStart(2, "0");
  el.missionClock.textContent = `${String(d).padStart(3, "0")}d ${pad2(hh)}h ${pad2(mm)}m ${pad2(ss)}s`;
}

document.querySelectorAll(".speed-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    state.simSpeed = Number(btn.dataset.speed);
    document.querySelectorAll(".speed-btn").forEach(b => b.classList.toggle("active", b === btn));
    addLog("SISTEMA", `Velocidad de simulación: ${btn.textContent}.`, "info");
  });
});

el.exportCsvBtn.addEventListener("click", () => {
  const csvCell = v => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [["dia_met", "hora", "tripulante", "nivel", "mensaje"]]
    .concat(state.logs.slice().reverse().map(l => [l.metDay, l.time, l.crew, l.level, l.msg]));
  const csv = "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bitacora_scada_dia${Math.floor(getMissionDays())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// Confirmación con doble toque: el primer toque pide confirmar en el mismo botón y el segundo ejecuta.
// (Reemplaza a confirm(), que algunos navegadores y paneles integrados bloquean sin mostrar nada.)
function confirmByDoubleTap(btn, askText) {
  if (btn.dataset.armed === "1") {
    clearTimeout(btn._armTimer);
    btn.dataset.armed = "";
    btn.textContent = btn.dataset.label;
    btn.classList.remove("armed");
    return true;
  }
  btn.dataset.label = btn.textContent;
  btn.dataset.armed = "1";
  btn.textContent = askText;
  btn.classList.add("armed");
  btn._armTimer = setTimeout(() => {
    btn.dataset.armed = "";
    btn.textContent = btn.dataset.label;
    btn.classList.remove("armed");
  }, 4000);
  return false;
}

el.resetMissionBtn.addEventListener("click", () => {
  if (!confirmByDoubleTap(el.resetMissionBtn, "⚠ Toca otra vez para reiniciar")) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  state = getDefaultState();
  state.crewSignature = crewSignature();   // reiniciar la misión no cierra las sesiones
  CREW_PROFILES.forEach((_, i) => evaluateCrewDiagnosis(i));
  document.querySelectorAll(".speed-btn").forEach(b => b.classList.toggle("active", b.dataset.speed === "1"));
  initialRender();
  addLog("SISTEMA", "Misión reiniciada al Día 42.", "info");
});

window.addEventListener("resize", () => drawTrendChart());

// ===================== ARRANQUE =====================
function initialRender() {
  CREW_PROFILES.forEach((_, i) => { if (state.crewStates[i].diagnosis) runClinicalAI(i); });
  aiChatCrew = null;   // el asistente vuelve a saludar con los datos actuales
  renderAINavBadge();
  updateProfileUI();
  renderLogs();
  document.querySelectorAll(".trend-tab").forEach(t => t.classList.toggle("active", t.dataset.chart === state.activeChart));
  switchView(state.activeView);
  renderFleetBar();
  renderActiveCrewDetails();
  drawTrendChart();
  renderMentalView();
  renderDopplerMetrics();
  updateClock();
}

// ===================== PANTALLA DE INICIO DE SESIÓN =====================
const loginEl = {
  screen: document.getElementById("loginScreen"),
  grid: document.getElementById("loginGrid"),
  status: document.getElementById("loginStatus"),
  startBtn: document.getElementById("startMissionBtn"),
  logoutBtn: document.getElementById("logoutBtn")
};

function loginCardHtml(i) {
  const c = CREW_PROFILES[i];
  {
    const p = crewIdentities[i];
    const head = `
      <div class="login-card-top">
        <div><strong>Tripulante ${i + 1} · ${c.id}</strong><div class="login-role">${CREW_ROLES[i].long} · ${c.module}</div></div>
        <span class="badge ${p ? "ok-badge" : "warn-badge"}">${p ? "SESIÓN INICIADA" : "PENDIENTE"}</span>
      </div>`;
    if (p) {
      return `
        <div class="login-card done">
          ${head}
          <div class="login-done-name">${escapeHtml(p.nombre)} ${escapeHtml(p.apellido)}</div>
          <div class="login-done-info">Edad: ${p.edad} años</div>
          <button type="button" class="small-btn" data-edit="${i}">Cambiar tripulante</button>
        </div>`;
    }
    return `
      <form class="login-card" data-slot="${i}" novalidate>
        ${head}
        <div class="login-field"><label for="nombre${i}">NOMBRE</label><input id="nombre${i}" name="nombre" autocomplete="off" maxlength="30" placeholder="Ej. Ana" /></div>
        <div class="login-field"><label for="apellido${i}">APELLIDO</label><input id="apellido${i}" name="apellido" autocomplete="off" maxlength="30" placeholder="Ej. Torres" /></div>
        <div class="login-field"><label for="edad${i}">EDAD</label><input id="edad${i}" name="edad" type="number" min="18" max="70" placeholder="18 – 70" /></div>
        <div class="login-error" id="loginError${i}"></div>
        <button type="submit" class="login-btn">Iniciar sesión</button>
      </form>`;
  }
}

// Dibuja las 3 tarjetas (solo al abrir la pantalla de registro).
function renderLogin() {
  loginEl.grid.innerHTML = CREW_PROFILES.map((_, i) => `<div class="login-slot" id="loginSlot${i}">${loginCardHtml(i)}</div>`).join("");
  updateLoginFooter();
}

// Redibuja SOLO la tarjeta que cambió, así no se borra lo que otro tripulante está escribiendo.
function renderLoginSlot(i) {
  document.getElementById(`loginSlot${i}`).innerHTML = loginCardHtml(i);
  updateLoginFooter();
}

function updateLoginFooter() {
  const count = crewIdentities.filter(Boolean).length;
  loginEl.status.textContent = count === 3 ? "✓ 3/3 sesiones iniciadas · tripulación lista" : `${count}/3 sesiones iniciadas`;
  loginEl.status.classList.toggle("ready", count === 3);
  loginEl.startBtn.disabled = count !== 3;
}

loginEl.grid.addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target.closest("form[data-slot]");
  if (!form) return;
  const i = Number(form.dataset.slot);
  const nombre = form.nombre.value.trim().replace(/\s+/g, " ");
  const apellido = form.apellido.value.trim().replace(/\s+/g, " ");
  const edad = Number(form.edad.value);
  const err = document.getElementById(`loginError${i}`);

  if (!NAME_PATTERN.test(nombre)) { err.textContent = "Escribe un nombre válido (solo letras, 2 a 30)."; form.nombre.focus(); return; }
  if (!NAME_PATTERN.test(apellido)) { err.textContent = "Escribe un apellido válido (solo letras, 2 a 30)."; form.apellido.focus(); return; }
  if (!Number.isInteger(edad) || edad < 18 || edad > 70) { err.textContent = "La edad debe estar entre 18 y 70 años."; form.edad.focus(); return; }

  crewIdentities[i] = { nombre, apellido, edad };
  saveCrewIdentities();
  renderLoginSlot(i);
  // Lleva el cursor al primer campo vacío de otro tripulante que falte
  const next = [...loginEl.grid.querySelectorAll("form[data-slot] input")].find(inp => !inp.value);
  if (next) next.focus();
});

loginEl.grid.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-edit]");
  if (!btn) return;
  const i = Number(btn.dataset.edit);
  const prev = crewIdentities[i];
  crewIdentities[i] = null;
  saveCrewIdentities();
  renderLoginSlot(i);
  // Al cambiar de tripulante, los datos anteriores quedan escritos para corregirlos
  const form = loginEl.grid.querySelector(`form[data-slot='${i}']`);
  if (prev && form) {
    form.nombre.value = prev.nombre;
    form.apellido.value = prev.apellido;
    form.edad.value = prev.edad;
    form.nombre.focus();
  }
});

function startMission() {
  applyCrewIdentities();
  // Si es una tripulación distinta a la de la misión guardada, empieza una misión nueva.
  if (state.crewSignature !== crewSignature()) {
    const keepView = state.activeView;
    state = getDefaultState();
    state.activeView = keepView;
    state.crewSignature = crewSignature();
    CREW_PROFILES.forEach((_, i) => evaluateCrewDiagnosis(i));
    addLog("SISTEMA", `Tripulación registrada: ${CREW_PROFILES.map(c => c.name).join(", ")}.`, "info");
  }
  missionStarted = true;
  loginEl.screen.classList.add("hidden");
  initialRender();
  saveState();
}

loginEl.startBtn.addEventListener("click", () => { if (allCrewLoggedIn()) startMission(); });

loginEl.logoutBtn.addEventListener("click", () => {
  if (!confirmByDoubleTap(loginEl.logoutBtn, "⚠ Toca otra vez para cerrar sesión")) return;
  crewIdentities = [null, null, null];
  saveCrewIdentities();
  missionStarted = false;
  el.sidebarMenu.classList.remove("open");
  renderLogin();
  loginEl.screen.classList.remove("hidden");
});

// ===================== INICIO =====================
loadCrewIdentities();
CREW_PROFILES.forEach((_, i) => evaluateCrewDiagnosis(i));
if (allCrewLoggedIn()) {
  startMission();          // las sesiones quedan guardadas: no hay que volver a escribirlas
} else {
  renderLogin();
  initialRender();
}

setInterval(() => {
  if (!missionStarted) return;   // la misión no avanza hasta que inicien sesión los 3
  state.metSeconds += state.simSpeed;
  updateClock();
  stepAllCrewSimulation(state.simSpeed);
  saveState();
}, 1000);

requestAnimationFrame(animationLoop);
