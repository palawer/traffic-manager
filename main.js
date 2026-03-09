import { state } from "./state.js";
import { MAX_DT } from "./config.js";
import { loadState } from "./persistence.js";
import { rebuildJunctions } from "./network.js";
import { importOSM } from "./osm-import.js";
import {
  initRenderer,
  setupUi,
  applyCameraTransform,
  drawGrid,
  drawRoads,
  drawPreview,
  drawCars,
  drawExplosions,
  drawSelectedCarRoute,
  drawConnectorTool,
  drawSignals,
  drawSpeedLabels,
  setLiteMode,
  fitViewToNetwork,
  updateStatus,
  updatePropertiesPanel,
} from "./renderer.js";
import { setupInput } from "./editor.js";
import { updateCars } from "./simulation.js";

init().catch(err => {
  console.error(err);
  document.getElementById("status").textContent = "Error inicializando PixiJS";
});

async function init() {
  const { app } = await initRenderer();
  setupUi();
  if (loadState()) {
    if (state.nodes.size > 500) setLiteMode(true);
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
  drawGrid();
  drawRoads();
  drawPreview();
  drawSelectedCarRoute();
  drawConnectorTool();
  drawSignals();
  drawSpeedLabels();
  drawCars();
  drawExplosions(dt);
}
