// =====================================================================
//  VÍNCULO SCADA ↔ CHALECO BIOMÉTRICO CON LOCALIZACIÓN (chaleco.html)
//  Archivo aparte: agrega el botón «🦺 Chaleco» en la barra superior y
//  envía los datos de la tripulación al chaleco cada segundo.
//  Si el tripulante toca el chaleco para reconocer una alerta, el SCADA
//  la marca como reconocida (igual que presionar ACK).
// =====================================================================
(function () {
  let vestWin = null;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sound-btn";
  btn.id = "vestBtn";
  btn.textContent = "🦺 Chaleco";
  btn.title = "Abrir el chaleco biométrico con localización vinculado a este SCADA";
  document.querySelector(".topbar-right").insertBefore(btn, document.getElementById("sidebarToggle"));

  btn.addEventListener("click", () => {
    if (vestWin && !vestWin.closed) { vestWin.focus(); return; }
    vestWin = window.open(`chaleco.html?crew=${state.activeCrewIndex}`, "chalecoBiometrico", "width=1100,height=900");
    setTimeout(send, 300);
  });

  function send() {
    if (!vestWin || vestWin.closed || typeof state === "undefined") return;
    try {
      vestWin.postMessage({
        type: "scada-vest",
        names: CREW_PROFILES.map(c => ({ id: c.id, name: c.name })),
        // JSON quita las funciones internas para que el mensaje se pueda enviar
        crewStates: JSON.parse(JSON.stringify(state.crewStates)),
        met: state.metSeconds,
        activeCrew: state.activeCrewIndex
      }, "*");
    } catch (e) {}
  }
  setInterval(() => {
    if (typeof missionStarted !== "undefined" && !missionStarted) return;
    send();
  }, 1000);

  // Reconocimiento desde el chaleco → ACK en el SCADA
  window.addEventListener("message", e => {
    // Solo se aceptan mensajes del chaleco que abrió este SCADA
    if (!e.data || e.data.type !== "vest-ack" || !vestWin || e.source !== vestWin) return;
    const i = Number(e.data.crew);
    const cs = state.crewStates[i];
    if (!cs || !cs.diagnosis) return;
    if (cs.diagnosis.level !== "nominal" && !cs.alarmAcked) {
      cs.alarmAcked = true;
      cs.alarmAckInfo = "Chaleco";
      addLog(CREW_PROFILES[i].id, "Alarma reconocida tocando el chaleco biométrico.", "info");
    } else {
      addLog(CREW_PROFILES[i].id, "El tripulante reconoció la vibración del chaleco.", "info");
    }
  });
})();
