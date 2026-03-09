import { state } from "./state.js";
import { MAX_DT } from "./config.js";
import { loadState } from "./persistence.js";
import { rebuildJunctions } from "./network.js";
import { importOSMData } from "./osm-import.js";
import {
  initRenderer,
  setupUi,
  applyCameraTransform,
  drawCars,
  drawDebugRoads,
  setLiteMode,
  setMaplibreMap,
  setOsmParams,
  initCoastline,
  fitViewToNetwork,
  updateStatus,
  updatePropertiesPanel,
} from "./renderer.js";
import { BBOX, SCALE } from "./osm-import.js";
import { updateCars } from "./simulation.js";

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

  if (loadState() && state.nodes.size > 500) {
    // Red ya en localStorage — usar directamente
    statusEl.textContent = "Red cargada desde caché.";
    initCoastline().catch(console.warn);
    rebuildJunctions();
    fitViewToNetwork();
  } else {
    // Primera carga: importar desde el fixture local
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
  }

  statusEl.style.display = "none";

  app.ticker.add(ticker => {
    const dt = Math.min(ticker.deltaMS / 1000, MAX_DT);
    frame(dt);
  });
}


function frame(dt) {
  if (!state.paused) updateCars(dt);
  updateStatus();
  updatePropertiesPanel();
  applyCameraTransform();
  drawDebugRoads();
  drawCars();
}
