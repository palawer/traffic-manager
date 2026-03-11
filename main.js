import { state } from "./state.js";
import { MAX_DT } from "./config.js";
import { importOSMData } from "./osm-import.js";
import {
  initRenderer,
  setupUi,
  applyCameraTransform,
  drawCars,
  drawDebugRoads,
  drawSelectedCarRoute,
  setLiteMode,
  setMaplibreMap,
  setOsmParams,
  fitViewToNetwork,
  updateStatus,
  updatePropertiesPanel,
  worldToScreen,
  setRenderFrame,
  getLastRenderFrame,
  drawCongestionLayer,
} from "./renderer.js";
import { BBOX, SCALE } from "./osm-import.js";
import { initLanePathCache } from "./traversal.js";

let simWorker = null;

init().catch(err => {
  console.error(err);
  document.getElementById("status").textContent = "Error inicializando PixiJS";
});

async function init() {
  // Inicializar MapLibre
  const map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/bright",
    center: [4.075, 39.965],
    zoom: 10,
  });
  // Silenciar warnings de sprites faltantes del estilo base (antes del load)
  map.on("styleimagemissing", id => {
    if (!map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
  });

  await new Promise(resolve => map.once("load", resolve));

  // Pasar mapa al renderer y registrar parámetros de proyección OSM
  setMaplibreMap(map);
  setOsmParams(BBOX, SCALE);
  setLiteMode(true);

  const { app } = await initRenderer();
  setupUi();

  // Crear worker de simulación
  simWorker = new Worker("./simulation-worker.js", { type: "module" });
  simWorker.onmessage = ({ data }) => {
    if (data.type === "frame") setRenderFrame(data);
  };

  // Reenviar "limpiar coches" al worker
  document.addEventListener("sim:clearCars", () => {
    simWorker?.postMessage({ type: "clearCars" });
  });

  const statusEl = document.getElementById("importStatus");
  statusEl.style.display = "";

  try {
    const res  = await fetch("./fixtures/menorca-sample.json");
    const data = await res.json();
    await importOSMData(data, msg => { statusEl.textContent = msg; });

    // Cache de paths en el hilo principal (para dibujar rutas del coche seleccionado)
    initLanePathCache(state.segments, state.nodes);

    // Enviar la red al worker para que inicialice sus propias caches
    simWorker.postMessage({
      type: "init",
      nodes:          [...state.nodes],
      segments:       [...state.segments],
      nextNodeId:     state.nextNodeId,
      nextSegmentId:  state.nextSegmentId,
    });

    fitViewToNetwork();
  } catch (err) {
    statusEl.textContent = "Error cargando red: " + err.message;
    console.error(err);
  }

  statusEl.style.display = "none";

  // Detectar click en coches via MapLibre
  map.on("click", e => {
    const { x: sx, y: sy } = e.point;
    const THRESHOLD_PX2 = 25 * 25;
    const { positions, ids, carCount } = getLastRenderFrame();
    if (!positions) return;
    let best = null, bestDist2 = Infinity;
    for (let i = 0; i < carCount; i++) {
      const sp = worldToScreen(positions[i * 4], positions[i * 4 + 1]);
      const dx = sp.x - sx, dy = sp.y - sy;
      const d2 = dx * dx + dy * dy;
      if (d2 < THRESHOLD_PX2 && d2 < bestDist2) { bestDist2 = d2; best = ids[i]; }
    }
    state.selectedCarId = best ?? null;
  });

  app.ticker.add(ticker => {
    const dt = Math.min(ticker.deltaMS / 1000, MAX_DT);
    frame(dt);
  });
}

function frame(dt) {
  // Enviar tick al worker (fire-and-forget; los pendingSpawns se transfieren)
  simWorker?.postMessage({
    type: "tick",
    dt:            dt * state.simSpeed,
    paused:        state.paused,
    addSpawns:     state.pendingSpawns,
    selectedCarId: state.selectedCarId,
  });
  state.pendingSpawns = 0;

  updateStatus();
  updatePropertiesPanel();
  applyCameraTransform();
  drawDebugRoads();
  drawCongestionLayer();
  drawCars();
  drawSelectedCarRoute();
}
