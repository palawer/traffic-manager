import { state } from "./state.js";
import { MAX_DT } from "./config.js";
import { loadState } from "./persistence.js";
import { rebuildJunctions } from "./network.js";
import { importOSM } from "./osm-import.js";
import {
  initRenderer,
  setupUi,
  applyCameraTransform,
  drawCars,
  drawExplosions,
  setLiteMode,
  setMaplibreMap,
  setOsmParams,
  initCoastline,
  fitViewToNetwork,
  updateStatus,
  updatePropertiesPanel,
} from "./renderer.js";
import { BBOX, SCALE } from "./osm-import.js";
import { setupInput } from "./editor.js";
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

  if (loadState()) {
    if (state.nodes.size > 500) initCoastline().catch(console.warn);
    rebuildJunctions();
    fitViewToNetwork();
  }
  setupInput();
  setupImportButton();

  app.ticker.add(ticker => {
    const dt = Math.min(ticker.deltaMS / 1000, MAX_DT);
    frame(dt);
  });
}

function setupImportButton() {
  const btn = document.getElementById("importOsmBtn");
  const statusEl = document.getElementById("importStatus");

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    statusEl.style.display = "";

    try {
      setLiteMode(true);
      await importOSM(msg => {
        statusEl.textContent = msg;
      });
      await initCoastline();
      fitViewToNetwork();
    } catch (err) {
      statusEl.textContent = "Error: " + err.message;
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  });
}

function frame(dt) {
  if (!state.paused) updateCars(dt);
  updateStatus();
  updatePropertiesPanel();
  applyCameraTransform();
  drawCars();
  drawExplosions(dt);
}
