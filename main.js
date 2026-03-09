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
  initCoastline,
  fitViewToNetwork,
  updateStatus,
  updatePropertiesPanel,
  worldToScreen,
} from "./renderer.js";
import { BBOX, SCALE } from "./osm-import.js";
import { updateCars } from "./simulation.js";
import { pointAtPath } from "./geometry.js";

init().catch(err => {
  console.error(err);
  document.getElementById("status").textContent = "Error inicializando PixiJS";
});

async function init() {
  // Inicializar MapLibre
  const map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [4.075, 39.965],
    zoom: 10,
  });
  await new Promise(resolve => map.once("load", resolve));

  // Pasar mapa al renderer y registrar parámetros de proyección OSM
  setMaplibreMap(map);
  setOsmParams(BBOX, SCALE);
  setLiteMode(true);

  const { app } = await initRenderer();
  setupUi();

  const statusEl = document.getElementById("importStatus");
  statusEl.style.display = "";

  try {
    const res  = await fetch("./fixtures/menorca-sample.json");
    const data = await res.json();
    await importOSMData(data, msg => { statusEl.textContent = msg; });
    await initCoastline();
    fitViewToNetwork();
  } catch (err) {
    statusEl.textContent = "Error cargando red: " + err.message;
    console.error(err);
  }

  statusEl.style.display = "none";

  // Detectar click en coches via MapLibre
  map.on("click", e => {
    const { x: sx, y: sy } = e.point;
    const THRESHOLD_PX2 = 25 * 25; // 25px de radio
    let best = null;
    let bestDist2 = Infinity;
    for (const car of state.cars) {
      const carPos = getCarScreenPos(car);
      if (!carPos) continue;
      const dx = carPos.x - sx;
      const dy = carPos.y - sy;
      const d2 = dx * dx + dy * dy;
      if (d2 < THRESHOLD_PX2 && d2 < bestDist2) {
        bestDist2 = d2;
        best = car;
      }
    }
    state.selectedCarId = best ? best.id : null;
  });

  app.ticker.add(ticker => {
    const dt = Math.min(ticker.deltaMS / 1000, MAX_DT);
    frame(dt);
  });
}


function getCarScreenPos(car) {
  if (!car.path) return null;
  const worldPt = pointAtPath(car.path, car.s);
  return worldToScreen(worldPt.x, worldPt.y);
}

function frame(dt) {
  if (!state.paused) updateCars(dt);
  updateStatus();
  updatePropertiesPanel();
  applyCameraTransform();
  drawDebugRoads();
  drawCars();
  drawSelectedCarRoute();
}
