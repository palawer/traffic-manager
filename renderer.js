import { state, ROAD_WIDTH, LANE_WIDTH, LANE_OFFSET, GRID, COLORS } from "./state.js";
import { PIECES } from "./pieces.js";
import { normalizeAngle, getRoundaboutLaneRadii, rightNormalForHeading, pointAtPath, headingAtPath } from "./geometry.js";
import { getWorldConnectors, transformLocalPoint, rebuildNetwork, markNetworkDirty, pieceById } from "./network.js";
import {
  buildTrafficLightPath,
  buildRoundaboutPath,
  buildTurnaroundTransition,
  buildTraversal,
  buildRoundaboutDeadEndTurnaround,
  roundaboutExitOrdinal,
  junctionExitOrdinal,
} from "./traversal.js";
import { isTrafficLightGreen } from "./simulation.js";

const app = new PIXI.Application();
export let canvas = null;
let camera = null;
let gridGraphics = null;
let roadsGraphics = null;
let debugGraphics = null;
let connectorsGraphics = null;
let carsGraphics = null;
let carLabelsContainer = null;
const carDebugLabels = new Map();

export async function initRenderer() {
  const worldEl = document.getElementById("world");
  await app.init({
    resizeTo: worldEl,
    antialias: true,
    background: COLORS.bg,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  worldEl.appendChild(app.canvas);
  canvas = app.canvas;

  camera = new PIXI.Container();
  gridGraphics = new PIXI.Graphics();
  roadsGraphics = new PIXI.Graphics();
  debugGraphics = new PIXI.Graphics();
  connectorsGraphics = new PIXI.Graphics();
  carsGraphics = new PIXI.Graphics();
  carLabelsContainer = new PIXI.Container();

  camera.addChild(gridGraphics);
  camera.addChild(roadsGraphics);
  camera.addChild(debugGraphics);
  camera.addChild(connectorsGraphics);
  camera.addChild(carsGraphics);
  camera.addChild(carLabelsContainer);
  app.stage.addChild(camera);

  return { app };
}

function rendererSize() {
  return { width: app.renderer.width, height: app.renderer.height };
}

export function worldToScreen(x, y) {
  const { width, height } = rendererSize();
  return {
    x: (x - state.view.x) * state.view.zoom + width / 2,
    y: (y - state.view.y) * state.view.zoom + height / 2,
  };
}

export function screenToWorld(x, y) {
  const { width, height } = rendererSize();
  return {
    x: (x - width / 2) / state.view.zoom + state.view.x,
    y: (y - height / 2) / state.view.zoom + state.view.y,
  };
}

export function updateSpawnButtonLabel() {
  const spawnCarBtn = document.getElementById("spawnCarBtn");
  spawnCarBtn.textContent = `Spawn coche (${state.cars.length}) [+${state.pendingSpawns}]`;
}

export function setPaletteSelection(type) {
  const paletteEl = document.getElementById("palette");
  state.placingType = type;
  state.tool = type ? "place" : "select";
  if (!type) state.placeRotation = 0;

  const buttons = paletteEl.querySelectorAll("button");
  buttons.forEach((b) => {
    const isSelect = b.dataset.tool === "select";
    const isPiece = b.dataset.piece === type;
    b.classList.toggle("active", (isSelect && !type) || isPiece);
  });

  if (canvas) canvas.style.cursor = type ? "crosshair" : "default";
}

export function setupUi() {
  const paletteEl = document.getElementById("palette");
  const spawnCarBtn = document.getElementById("spawnCarBtn");
  const debugLanesBtn = document.getElementById("debugLanesBtn");
  const clearCarsBtn = document.getElementById("clearCarsBtn");
  const clearAllBtn = document.getElementById("clearAllBtn");

  paletteEl.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest("button");
    if (!(btn instanceof HTMLButtonElement) || !paletteEl.contains(btn)) return;

    if (btn.dataset.tool === "select") {
      setPaletteSelection(null);
      return;
    }
    setPaletteSelection(btn.dataset.piece || null);
  });

  spawnCarBtn.addEventListener("click", () => {
    state.pendingSpawns += 1;
    updateSpawnButtonLabel();
  });

  debugLanesBtn.addEventListener("click", () => {
    state.debugLanes = !state.debugLanes;
    debugLanesBtn.textContent = `Debug carriles: ${state.debugLanes ? "ON" : "OFF"}`;
    debugLanesBtn.classList.toggle("active", state.debugLanes);
  });
  debugLanesBtn.textContent = `Debug carriles: ${state.debugLanes ? "ON" : "OFF"}`;
  debugLanesBtn.classList.toggle("active", state.debugLanes);

  clearCarsBtn.addEventListener("click", () => {
    state.cars = [];
    state.pendingSpawns = 0;
    updateSpawnButtonLabel();
  });

  clearAllBtn.addEventListener("click", () => {
    state.pieces = [];
    state.selectedId = null;
    state.cars = [];
    state.pendingSpawns = 0;
    updateSpawnButtonLabel();
    markNetworkDirty();
  });
}

export function applyCameraTransform() {
  const { width, height } = rendererSize();
  camera.scale.set(state.view.zoom, state.view.zoom);
  camera.position.set(width / 2 - state.view.x * state.view.zoom, height / 2 - state.view.y * state.view.zoom);
}

export function drawGrid() {
  const min = screenToWorld(0, 0);
  const { width, height } = rendererSize();
  const max = screenToWorld(width, height);
  const major = GRID * 5;

  gridGraphics.clear();

  for (let x = Math.floor(min.x / GRID) * GRID; x <= max.x; x += GRID) {
    const majorLine = Math.abs(x % major) < 0.0001;
    gridGraphics.moveTo(x, min.y);
    gridGraphics.lineTo(x, max.y);
    gridGraphics.stroke({
      width: 1 / state.view.zoom,
      color: majorLine ? COLORS.gridMajor : COLORS.gridMinor,
      alpha: 1,
    });
  }

  for (let y = Math.floor(min.y / GRID) * GRID; y <= max.y; y += GRID) {
    const majorLine = Math.abs(y % major) < 0.0001;
    gridGraphics.moveTo(min.x, y);
    gridGraphics.lineTo(max.x, y);
    gridGraphics.stroke({
      width: 1 / state.view.zoom,
      color: majorLine ? COLORS.gridMajor : COLORS.gridMinor,
      alpha: 1,
    });
  }
}

function strokeRoadPath(g, buildPath) {
  buildPath();
  g.stroke({ width: ROAD_WIDTH, color: COLORS.road, cap: "round" });
  buildPath();
  g.stroke({ width: 2, color: COLORS.divider, cap: "round" });
}

function strokeArcPath(g, cx, cy, radius, start, end, anticlockwise, style) {
  g.moveTo(cx + Math.cos(start) * radius, cy + Math.sin(start) * radius);
  g.arc(cx, cy, radius, start, end, anticlockwise);
  g.stroke(style);
}

function strokePolyline(g, points, style) {
  if (!points || points.length < 2) return;
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
  g.stroke(style);
}

function drawOpenEndCaps(g, piece) {
  if (piece.type === "roundabout_s" || piece.type === "roundabout_m" || piece.type === "roundabout_l") return;
  const worldConnectors = getWorldConnectors(piece);
  for (const c of worldConnectors) {
    if (state.connections.has(c.key)) continue;
    g.circle(c.x, c.y, ROAD_WIDTH * 0.5);
    g.fill(COLORS.road);
    g.circle(c.x, c.y, 1.4);
    g.fill(COLORS.divider);
  }
}

function drawPiece(g, piece) {
  const def = PIECES[piece.type];

  if (piece.type === "straight") {
    strokeRoadPath(g, () => {
      g.moveTo(piece.x - 100 * Math.cos(piece.rot), piece.y - 100 * Math.sin(piece.rot));
      g.lineTo(piece.x + 100 * Math.cos(piece.rot), piece.y + 100 * Math.sin(piece.rot));
    });
  } else if (piece.type === "curve") {
    const center = transformLocalPoint(piece, def.center);
    const start = Math.PI / 2 + piece.rot;
    const end = piece.rot;
    strokeArcPath(g, center.x, center.y, def.radius, start, end, true, {
      width: ROAD_WIDTH,
      color: COLORS.road,
      cap: "round",
    });
    strokeArcPath(g, center.x, center.y, def.radius, start, end, true, {
      width: 2,
      color: COLORS.divider,
      cap: "round",
    });
  } else if (piece.type === "traffic_light_cross") {
    const dx = Math.cos(piece.rot);
    const dy = Math.sin(piece.rot);
    const ux = -dy;
    const uy = dx;

    strokeRoadPath(g, () => {
      g.moveTo(piece.x - dx * 100, piece.y - dy * 100);
      g.lineTo(piece.x + dx * 100, piece.y + dy * 100);
    });
    strokeRoadPath(g, () => {
      g.moveTo(piece.x - ux * 100, piece.y - uy * 100);
      g.lineTo(piece.x + ux * 100, piece.y + uy * 100);
    });

    const worldConnectors = getWorldConnectors(piece);
    for (const c of worldConnectors) {
      const headingIn = normalizeAngle(c.dir + Math.PI);
      const normal = rightNormalForHeading(headingIn);
      const lampPos = {
        x: c.x + Math.cos(headingIn) * 18 + normal.x * 9,
        y: c.y + Math.sin(headingIn) * 18 + normal.y * 9,
      };
      g.circle(lampPos.x, lampPos.y, 4.6);
      g.fill(COLORS.trafficPole);
      g.circle(lampPos.x, lampPos.y, 3.1);
      g.fill(isTrafficLightGreen(piece, c.connectorIndex) ? COLORS.trafficGreen : COLORS.trafficRed);
    }
  } else {
    const radii = getRoundaboutLaneRadii(def);

    for (const c of def.connectors) {
      const c0 = transformLocalPoint(piece, c);
      const d = Math.hypot(c.x, c.y) || 1;
      const p0 = transformLocalPoint(piece, {
        x: (c.x / d) * (radii.outerEdge + 2),
        y: (c.y / d) * (radii.outerEdge + 2),
      });
      strokeRoadPath(g, () => {
        g.moveTo(p0.x, p0.y);
        g.lineTo(c0.x, c0.y);
      });
    }

    strokeArcPath(
      g,
      piece.x,
      piece.y,
      (radii.inner + radii.outer) * 0.5,
      0,
      Math.PI * 2,
      false,
      { width: LANE_WIDTH * 2, color: COLORS.road }
    );

    strokeArcPath(g, piece.x, piece.y, radii.divider, 0, Math.PI * 2, false, {
      width: 2,
      color: COLORS.divider,
    });
  }

  drawOpenEndCaps(g, piece);

  if (state.selectedId === piece.id) {
    g.circle(piece.x, piece.y, def.pickRadius - 8);
    g.stroke({ width: 3 / state.view.zoom, color: COLORS.selected });
  }
}

export function drawRoadsAndConnectors() {
  if (state.networkDirty) rebuildNetwork();

  roadsGraphics.clear();
  connectorsGraphics.clear();

  for (const piece of state.pieces) drawPiece(roadsGraphics, piece);

  for (const c of state.connectors) {
    const linked = state.connections.has(c.key);
    connectorsGraphics.circle(c.x, c.y, 3.5 / state.view.zoom);
    connectorsGraphics.fill(linked ? COLORS.connectorLinked : COLORS.connectorOpen);
  }
}

export function drawDebugLanes() {
  debugGraphics.clear();
  if (!state.debugLanes) return;

  const style = { width: 1.6 / state.view.zoom, color: COLORS.debugLane, alpha: 0.95 };
  const arcStyle = { width: 1.6 / state.view.zoom, color: COLORS.debugLane, alpha: 0.95 };
  const turnStyle = { width: 1.6 / state.view.zoom, color: COLORS.debugLane, alpha: 0.95 };

  for (const piece of state.pieces) {
    const def = PIECES[piece.type];
    if (piece.type === "straight") {
      strokePolyline(
        debugGraphics,
        [
          transformLocalPoint(piece, { x: -100, y: -LANE_OFFSET }),
          transformLocalPoint(piece, { x: 100, y: -LANE_OFFSET }),
        ],
        style
      );
      strokePolyline(
        debugGraphics,
        [
          transformLocalPoint(piece, { x: -100, y: LANE_OFFSET }),
          transformLocalPoint(piece, { x: 100, y: LANE_OFFSET }),
        ],
        style
      );
    } else if (piece.type === "curve") {
      const center = transformLocalPoint(piece, def.center);
      const start = Math.PI / 2 + piece.rot;
      const end = piece.rot;
      strokeArcPath(debugGraphics, center.x, center.y, def.radius - LANE_OFFSET, start, end, true, arcStyle);
      strokeArcPath(debugGraphics, center.x, center.y, def.radius + LANE_OFFSET, start, end, true, arcStyle);
    } else if (piece.type === "traffic_light_cross") {
      for (let from = 0; from < 4; from++) {
        for (let to = 0; to < 4; to++) {
          if (to === from) continue;
          const p = buildTrafficLightPath(piece, from, to);
          strokePolyline(debugGraphics, p, { width: 1.5 / state.view.zoom, color: COLORS.debugLane, alpha: 0.7 });
        }
      }
    } else {
      const radii = getRoundaboutLaneRadii(def);
      strokeArcPath(debugGraphics, piece.x, piece.y, radii.inner, 0, Math.PI * 2, false, arcStyle);
      strokeArcPath(debugGraphics, piece.x, piece.y, radii.outer, 0, Math.PI * 2, false, arcStyle);

      for (const c of def.connectors) {
        const d = Math.hypot(c.x, c.y) || 1;
        const ux = c.x / d;
        const uy = c.y / d;
        const px = -uy;
        const py = ux;
        const startDist = radii.outerEdge + 2;

        for (const side of [-1, 1]) {
          const p0 = transformLocalPoint(piece, {
            x: ux * startDist + px * side * LANE_OFFSET,
            y: uy * startDist + py * side * LANE_OFFSET,
          });
          const p1 = transformLocalPoint(piece, {
            x: ux * d + px * side * LANE_OFFSET,
            y: uy * d + py * side * LANE_OFFSET,
          });
          strokePolyline(debugGraphics, [p0, p1], style);
        }
      }

      const roundPathStyle = { width: 1.5 / state.view.zoom, color: COLORS.debugLane, alpha: 0.55 };
      for (let from = 0; from < 4; from++) {
        for (let to = 0; to < 4; to++) {
          if (to === from) continue;
          const p = buildRoundaboutPath(piece, from, to);
          strokePolyline(debugGraphics, p, roundPathStyle);
        }
      }

      const worldConnectors = getWorldConnectors(piece);
      const turnaroundStyle = { width: 1.8 / state.view.zoom, color: COLORS.debugLane, alpha: 0.95 };
      for (const wc of worldConnectors) {
        if (state.connections.has(wc.key)) continue;
        const turn = buildRoundaboutDeadEndTurnaround(piece, wc.connectorIndex);
        strokePolyline(debugGraphics, turn, turnaroundStyle);
      }
    }

    if (!def.isRoundabout && def.connectors.length === 2) {
      const worldConnectors = getWorldConnectors(piece);
      for (const c of worldConnectors) {
        if (state.connections.has(c.key)) continue;
        const deadIdx = c.connectorIndex;
        const fromIdx = deadIdx === 0 ? 1 : 0;
        const inPath = buildTraversal(piece, fromIdx);
        const outPath = buildTraversal(piece, deadIdx);
        if (!inPath || !outPath || inPath.path.length < 1 || outPath.path.length < 1) continue;
        const pStart = pointAtPath(inPath.path, inPath.path.length);
        const hStart = headingAtPath(inPath.path, Math.max(0, inPath.path.length - 1));
        const pEnd = outPath.path.points[0];
        const hEnd = headingAtPath(outPath.path, 1);
        const turn = buildTurnaroundTransition(piece, deadIdx, pStart, hStart, pEnd, hEnd);
        strokePolyline(debugGraphics, turn, turnStyle);
      }
    }
  }
}

export function drawCars() {
  carsGraphics.clear();
  const activeLabelIds = new Set();

  for (const car of state.cars) {
    const p = pointAtPath(car.path, car.s);
    const h = headingAtPath(car.path, car.s);

    const c = Math.cos(h);
    const s = Math.sin(h);

    const pts = [
      { x: -6, y: -3.5 },
      { x: 6, y: -3.5 },
      { x: 6, y: 3.5 },
      { x: -6, y: 3.5 },
    ].map((q) => ({ x: p.x + q.x * c - q.y * s, y: p.y + q.x * s + q.y * c }));

    carsGraphics.poly([pts[0].x, pts[0].y, pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y]);
    carsGraphics.fill(car.color);
    carsGraphics.stroke({ width: 1.5 / state.view.zoom, color: COLORS.carStroke });

    if (state.debugLanes) {
      const piece = pieceById(car.pieceId);
      if (piece && (PIECES[piece.type].isRoundabout || PIECES[piece.type].isTrafficLightCross)) {
        let label = carDebugLabels.get(car.id);
        if (!label) {
          label = new PIXI.Text({
            text: "",
            style: {
              fontFamily: "monospace",
              fontSize: 11,
              fill: 0xffffff,
              stroke: { color: 0x172028, width: 3 },
              align: "center",
            },
          });
          label.anchor.set(0.5);
          carDebugLabels.set(car.id, label);
          carLabelsContainer.addChild(label);
        }
        const fallbackOrdinal = PIECES[piece.type].isRoundabout
          ? roundaboutExitOrdinal(car.fromConnectorIdx, car.toConnectorIdx)
          : junctionExitOrdinal(car.fromConnectorIdx, car.toConnectorIdx);
        label.text = `${car.exitOrdinal || fallbackOrdinal}`;
        label.position.set(p.x, p.y - 12 / state.view.zoom);
        label.scale.set(1 / state.view.zoom);
        label.visible = true;
        activeLabelIds.add(car.id);
      }
    }
  }

  for (const [carId, label] of carDebugLabels.entries()) {
    const keep = state.debugLanes && activeLabelIds.has(carId);
    if (!keep) {
      carLabelsContainer.removeChild(label);
      label.destroy();
      carDebugLabels.delete(carId);
    }
  }
}

export function updateStatus() {
  updateSpawnButtonLabel();
  const statusEl = document.getElementById("status");

  if (state.tool === "select") {
    statusEl.textContent = "Simulando siempre · Herramienta: Seleccionar";
    return;
  }

  const deg = ((Math.round((state.placeRotation * 180) / Math.PI) % 360) + 360) % 360;
  statusEl.textContent = `Simulando siempre · Colocando: ${PIECES[state.placingType].label} (${deg}º)`;
}
