import { state } from "./state.js";
import {
  initRenderer,
  setupUi,
  applyCameraTransform,
  drawGrid,
  drawRoads,
  drawPreview,
  drawCars,
  drawSelectedCarRoute,
  drawSpeedLabels,
  updateStatus,
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
  setupInput();

  app.ticker.add(ticker => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    frame(dt);
  });
}

function frame(dt) {
  if (!state.paused) updateCars(dt);
  updateStatus();
  applyCameraTransform();
  drawGrid();
  drawRoads();
  drawPreview();
  drawSelectedCarRoute();
  drawSpeedLabels();
  drawCars();
}
