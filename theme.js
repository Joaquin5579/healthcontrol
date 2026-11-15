// =====================================================================
//  MODO OSCURO "SALA DE CONTROL"
//  Archivo aparte: agrega un botón en la barra superior para cambiar entre
//  modo claro y oscuro, recuerda la elección y adapta los colores de los
//  gráficos dibujados (tendencias, medidor de riesgo de la IA).
// =====================================================================
(function () {
  const KEY = "orbital_med_scada_theme_v1";
  const root = document.documentElement;

  // Colores de los gráficos para cada tema (se copian sobre COLORS de app.js)
  const CHART = {
    light: null, // se guarda el original al cargar
    dark: { navy: "#6fa3e8", navy2: "#93b8e6", dim: "#8fa9c9", grid: "#16294a", axis: "#27466f", blue: "#4c9cf0", blueMid: "#6fb3ff" }
  };
  if (typeof COLORS !== "undefined") {
    CHART.light = Object.fromEntries(Object.keys(CHART.dark).map(k => [k, COLORS[k]]));
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sound-btn";
  btn.id = "themeBtn";
  document.querySelector(".topbar-right").insertBefore(btn, document.getElementById("sidebarToggle"));

  function apply(theme, animate) {
    if (animate) {
      root.classList.add("theme-anim");
      setTimeout(() => root.classList.remove("theme-anim"), 450);
    }
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    btn.textContent = theme === "dark" ? "☀️ Modo claro" : "🌙 Modo oscuro";
    btn.title = theme === "dark" ? "Volver al modo claro" : "Cambiar al modo oscuro (sala de control)";
    if (typeof COLORS !== "undefined" && CHART.light) Object.assign(COLORS, theme === "dark" ? CHART.dark : CHART.light);
    // Redibujar los gráficos con los nuevos colores
    try { if (typeof drawTrendChart === "function") drawTrendChart(); } catch (e) {}
    try { if (typeof renderAIView === "function" && state.activeView === "ai") renderAIView(); } catch (e) {}
  }

  let theme = "light";
  try { theme = localStorage.getItem(KEY) === "dark" ? "dark" : "light"; } catch (e) {}
  apply(theme, false);

  btn.addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, theme); } catch (e) {}
    apply(theme, true);
  });
})();
