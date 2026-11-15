# SCADA Biomédico Orbital · Control Vital

Sistema SCADA de monitoreo de la salud física y mental de una tripulación en misiones espaciales de larga duración (estación espacial, Luna y Marte). Proyecto para el hackathon de la NASA.

Funciona **sin conexión con la Tierra**: en el espacio profundo un mensaje puede tardar hasta 40 minutos en ir y volver, así que la detección, la IA clínica y las contramedidas se ejecutan a bordo.

## Qué hace

- **Registro de tripulación:** 3 tripulantes inician sesión con nombre, apellido y edad.
- **Puente de mando:** los 3 tripulantes lado a lado con avatar, actividad, ubicación en la nave, riesgo de la IA, bienestar, sueño, mini gráficos y alertas.
- **Telemetría en vivo:** ECG, frecuencia cardíaca, presión, SpO₂, temperatura, respiración, presión ocular (SANS), masa muscular, densidad ósea, sueño y radiación, con alarmas en colores según la norma ISA-101.
- **Salud mental:** evaluación psicológica periódica e índice de bienestar.
- **Eco-Doppler:** flujo de la vena yugular y la carótida de cada tripulante.
- **Ecocardiograma Doppler color:** vista apical de 4 cámaras con el corazón latiendo, flujo en rojo y azul, Doppler espectral mitral y aórtico con ECG, y mediciones (FEVI, gasto cardíaco, ondas E y A, masa ventricular) según los datos de cada tripulante.
- **IA clínica (local, sin internet):** aprende la línea base de cada tripulante, detecta anomalías antes que los umbrales fijos, predice riesgos a 48 h, evalúa la aptitud para tareas críticas y responde preguntas.
- **Enlace con la Tierra:** simula el retardo de comunicación (ISS, Luna, Marte), los mensajes a Houston y a la familia, y el envío automático de alarmas y contramedidas. Mientras esperan la respuesta, los tripulantes pueden consultar a la IA de a bordo, que responde al instante.
- **Modelo anatómico:** silueta del cuerpo con 10 sistemas que se iluminan según su estado, con explicación y acciones.
- **Contramedidas:** ejercicio, suplementos, descanso, videollamada familiar, LBNP y programas de 30 días. Cada una dura un tiempo, bloquea a las demás mientras está en curso y se reporta a Houston.
- **Sonido de alarmas** (ISA-18.2), con botón para silenciar.
- **Visual:** modo oscuro "sala de control", mini gráficos y flechas de tendencia en cada signo vital, medidores circulares, avisos animados, despegue al iniciar la misión y efecto de tormenta solar.
- **Chaleco GPS biométrico** (`chaleco.html`): inspirado en los chalecos GPS del fútbol. Vibra con parámetros altos, ubica a cada tripulante dentro de la nave (balizas UWB) y muestra métricas de rendimiento.

## Cómo ejecutarlo

No necesita instalación ni servidor.

1. Descargar o clonar el repositorio.
2. Abrir `index.html` en Chrome o Edge (doble clic), o en Visual Studio Code con la extensión **Live Server** (clic derecho → *Open with Live Server*).
3. Registrar a los 3 tripulantes y presionar **Comenzar misión**.
4. Presionar **🔈 Activar sonido**. El chaleco se abre con el botón **🦺 Chaleco**.

> Para ver un incidente rápido: **☰ Opciones → Velocidad → 1d/s**, y luego volver a **1x**.

## Estructura

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de la interfaz y pestañas |
| `styles.css` | Diseño general (paleta azul y blanca) |
| `app.js` | Núcleo: simulación, signos vitales, diagnóstico, gráficos, salud mental, Doppler, IA clínica y tripulación |
| `link.js` / `link.css` | Pestaña 5: enlace con la Tierra y retardo de comunicación |
| `body.js` / `body.css` | Pestaña 6: modelo anatómico |
| `countermeasures.js` | Contramedidas y programas de tratamiento |
| `sound.js` / `sound.css` | Sonido de alarmas |
| `vest-link.js` | Conexión entre el SCADA y el chaleco |
| `bridge.js` / `bridge.css` | Puente de mando (vista general de la tripulación) |
| `echo.js` / `echo.css` | Pestaña 4: ecocardiograma Doppler color |
| `animations.js` / `animations.css` | Avisos animados, transiciones, despegue y tormenta solar |
| `sparklines.js` / `sparklines.css` | Mini gráficos en las tarjetas de signos vitales |
| `gauges.js` / `gauges.css` | Medidores circulares |
| `theme.js` / `theme.css` | Modo oscuro "sala de control" |
| `watermark.css` | Marca de agua del logo (`logo-lbdln.png`, si está en la carpeta) |
| `chaleco.html` | Chaleco GPS biométrico (página independiente) |

## Notas

- Los datos son **simulados** para la demostración. En una misión real provendrían de sensores (chaleco, dosímetro, actigrafía) conectados a la red de la nave.
- La misión y las sesiones se guardan en el navegador (`localStorage`).
- Las tipografías se cargan desde Google Fonts; sin internet se usan las fuentes del sistema.
