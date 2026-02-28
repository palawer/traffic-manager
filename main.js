import { state } from "./state.js";
import { MAX_DT } from "./config.js";
import { loadState } from "./persistence.js";
import { rebuildJunctions } from "./network.js";
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
    rebuildJunctions();
    fitViewToNetwork();
  }
  setupInput();

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
