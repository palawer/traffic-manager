import { state, LANE_WIDTH, GRID, COLORS } from "./state.js";
import { pointAtPath, headingAtPath, junctionInset } from "./geometry.js";
import { rebuildJunctions, markNetworkDirty, getNodeSegments } from "./network.js";

const app = new PIXI.Application();
export let canvas = null;
let camera = null;
let gridGraphics = null;
let junctionGraphics = null;
let roadsGraphics = null;
let laneMarkingsGraphics = null;
let tmpeOverlayGraphics = null;
let nodeGraphics = null;
let previewGraphics = null;
let carsGraphics = null;
let carLabelsContainer = null;

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
  gridGraphics       = new PIXI.Graphics();
  junctionGraphics   = new PIXI.Graphics();
  roadsGraphics      = new PIXI.Graphics();
  laneMarkingsGraphics = new PIXI.Graphics();
  tmpeOverlayGraphics  = new PIXI.Graphics();
  nodeGraphics       = new PIXI.Graphics();
  previewGraphics    = new PIXI.Graphics();
  carsGraphics       = new PIXI.Graphics();
  carLabelsContainer = new PIXI.Container();

  camera.addChild(gridGraphics);
  camera.addChild(junctionGraphics);
  camera.addChild(roadsGraphics);
  camera.addChild(laneMarkingsGraphics);
  camera.addChild(tmpeOverlayGraphics);
  camera.addChild(nodeGraphics);
  camera.addChild(previewGraphics);
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

export function applyCameraTransform() {
  const { width, height } = rendererSize();
  camera.scale.set(state.view.zoom, state.view.zoom);
  camera.position.set(
    width / 2 - state.view.x * state.view.zoom,
    height / 2 - state.view.y * state.view.zoom
  );
}

export function drawGrid() {
  const min = screenToWorld(0, 0);
  const { width, height } = rendererSize();
  const max = screenToWorld(width, height);
  const major = GRID * 5;

  gridGraphics.clear();
  for (let x = Math.floor(min.x / GRID) * GRID; x <= max.x; x += GRID) {
    const majorLine = Math.abs(x % major) < 0.001;
    gridGraphics.moveTo(x, min.y).lineTo(x, max.y);
    gridGraphics.stroke({ width: 1 / state.view.zoom, color: majorLine ? COLORS.gridMajor : COLORS.gridMinor });
  }
  for (let y = Math.floor(min.y / GRID) * GRID; y <= max.y; y += GRID) {
    const majorLine = Math.abs(y % major) < 0.001;
    gridGraphics.moveTo(min.x, y).lineTo(max.x, y);
    gridGraphics.stroke({ width: 1 / state.view.zoom, color: majorLine ? COLORS.gridMajor : COLORS.gridMinor });
  }
}

/** Get start/end points of a segment, inset from each node */
function segmentInsetPoints(seg) {
  const nodeA = state.nodes.get(seg.nodeA);
  const nodeB = state.nodes.get(seg.nodeB);
  if (!nodeA || !nodeB) return null;

  const dx = nodeB.x - nodeA.x;
  const dy = nodeB.y - nodeA.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;

  const segsAtA = getNodeSegments(seg.nodeA);
  const segsAtB = getNodeSegments(seg.nodeB);
  const insetA = junctionInset(seg, segsAtA);
  const insetB = junctionInset(seg, segsAtB);

  // Ensure insets don't exceed segment length
  const maxInset = (len - 10) / 2;
  const ia = Math.min(insetA, maxInset);
  const ib = Math.min(insetB, maxInset);

  return {
    pA: { x: nodeA.x + ux * ia, y: nodeA.y + uy * ia },
    pB: { x: nodeB.x - ux * ib, y: nodeB.y - uy * ib },
    ux, uy,
    totalWidth: (seg.lanesAtoB + seg.lanesBtoA) * LANE_WIDTH,
    heading: Math.atan2(dy, dx),
  };
}

export function drawRoads() {
  if (state.networkDirty) rebuildJunctions();

  roadsGraphics.clear();
  laneMarkingsGraphics.clear();
  junctionGraphics.clear();

  const lw = 1.5 / state.view.zoom;

  // Draw junction polygons
  for (const [nodeId, junc] of state.junctions) {
    if (!junc.polygon || junc.polygon.length < 3) continue;
    const pts = junc.polygon;
    const flat = [];
    for (const p of pts) { flat.push(p.x, p.y); }
    junctionGraphics.poly(flat);
    junctionGraphics.fill(COLORS.junction);
  }

  // Draw segment bodies
  for (const seg of state.segments.values()) {
    const ip = segmentInsetPoints(seg);
    if (!ip) continue;
    const { pA, pB, totalWidth } = ip;

    roadsGraphics.moveTo(pA.x, pA.y).lineTo(pB.x, pB.y);
    roadsGraphics.stroke({ width: totalWidth, color: COLORS.road, cap: "butt" });
  }

  // Draw lane markings
  for (const seg of state.segments.values()) {
    const ip = segmentInsetPoints(seg);
    if (!ip) continue;
    const { pA, pB, ux, uy, totalWidth, heading } = ip;

    // Perpendicular (right normal)
    const nx = -uy, ny = ux;
    const halfW = totalWidth / 2;

    // Edge lines (both sides)
    const leftEdgeX = pA.x - nx * halfW;
    const leftEdgeY = pA.y - ny * halfW;
    const rightEdgeX = pA.x + nx * halfW;
    const rightEdgeY = pA.y + ny * halfW;

    laneMarkingsGraphics.moveTo(leftEdgeX, leftEdgeY)
      .lineTo(pB.x - nx * halfW, pB.y - ny * halfW);
    laneMarkingsGraphics.stroke({ width: lw, color: COLORS.edgeLine });

    laneMarkingsGraphics.moveTo(rightEdgeX, rightEdgeY)
      .lineTo(pB.x + nx * halfW, pB.y + ny * halfW);
    laneMarkingsGraphics.stroke({ width: lw, color: COLORS.edgeLine });

    // Centerline (yellow dashes if 2-way)
    if (seg.lanesAtoB > 0 && seg.lanesBtoA > 0) {
      drawDashedLine(laneMarkingsGraphics, pA, pB, 0, lw * 1.2, COLORS.centerline, 16, 8);
    }

    // Inner lane dividers (AtoB side)
    for (let i = 1; i < seg.lanesAtoB; i++) {
      const off = i * LANE_WIDTH;
      const ax = pA.x + nx * off, ay = pA.y + ny * off;
      const bx = pB.x + nx * off, by = pB.y + ny * off;
      drawDashedLine(laneMarkingsGraphics, { x: ax, y: ay }, { x: bx, y: by }, 0, lw, COLORS.laneDivider, 12, 10);
    }

    // Inner lane dividers (BtoA side)
    for (let i = 1; i < seg.lanesBtoA; i++) {
      const off = -i * LANE_WIDTH;
      const ax = pA.x + nx * off, ay = pA.y + ny * off;
      const bx = pB.x + nx * off, by = pB.y + ny * off;
      drawDashedLine(laneMarkingsGraphics, { x: ax, y: ay }, { x: bx, y: by }, 0, lw, COLORS.laneDivider, 12, 10);
    }

    // Stop lines at each end
    drawStopLine(laneMarkingsGraphics, pA, nx, ny, halfW, lw * 2);
    drawStopLine(laneMarkingsGraphics, pB, nx, ny, halfW, lw * 2);
  }

  // Debug: draw connector paths
  if (state.debugLanes) {
    for (const [, junc] of state.junctions) {
      for (const conn of junc.connectors) {
        const pts = conn.path.points;
        if (pts.length < 2) continue;
        laneMarkingsGraphics.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) laneMarkingsGraphics.lineTo(pts[i].x, pts[i].y);
        laneMarkingsGraphics.stroke({ width: lw, color: COLORS.connectorPath, alpha: 0.6 });
      }
    }
  }

  // Draw node handles
  drawNodes();
}

function drawStopLine(g, pt, nx, ny, halfW, lw) {
  g.moveTo(pt.x - nx * halfW, pt.y - ny * halfW);
  g.lineTo(pt.x + nx * halfW, pt.y + ny * halfW);
  g.stroke({ width: lw, color: COLORS.stopLine, alpha: 0.7 });
}

function drawDashedLine(g, pA, pB, offset, lw, color, dashLen, gapLen) {
  const dx = pB.x - pA.x, dy = pB.y - pA.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len;
  const period = dashLen + gapLen;
  let t = offset;
  while (t < len) {
    const dashEnd = Math.min(t + dashLen, len);
    g.moveTo(pA.x + ux * t, pA.y + uy * t);
    g.lineTo(pA.x + ux * dashEnd, pA.y + uy * dashEnd);
    g.stroke({ width: lw, color });
    t += period;
  }
}

function drawNodes() {
  nodeGraphics.clear();
  for (const node of state.nodes.values()) {
    const isSelected = (node.id === state.selectedNodeId);
    const isHovered = (node.id === state.hoveredNodeId);
    const color = isSelected ? COLORS.nodeSelected : isHovered ? COLORS.nodeHover : COLORS.nodeDefault;
    const radius = isSelected ? 7 : 5;
    nodeGraphics.circle(node.x, node.y, radius / state.view.zoom * 1.5);
    nodeGraphics.fill(color);
    nodeGraphics.stroke({ width: 1.5 / state.view.zoom, color: 0x000000, alpha: 0.4 });
  }
}

export function drawPreview() {
  previewGraphics.clear();
  if (!state.drawingSegment) return;

  const fromNode = state.nodes.get(state.drawingSegment.fromNodeId);
  if (!fromNode) return;

  const to = state.drawingSegment.toWorld || state.lastMouse;
  if (!to) return;

  const totalWidth = 2 * LANE_WIDTH; // default 1+1
  previewGraphics.moveTo(fromNode.x, fromNode.y).lineTo(to.x, to.y);
  previewGraphics.stroke({ width: totalWidth, color: COLORS.previewRoad, alpha: 0.5, cap: "round" });

  // Show snap circle at destination
  if (state.drawingSegment.snapNodeId) {
    previewGraphics.circle(to.x, to.y, 8 / state.view.zoom);
    previewGraphics.stroke({ width: 2 / state.view.zoom, color: COLORS.nodeSelected });
  }
}

export function drawCars() {
  carsGraphics.clear();
  for (const car of state.cars) {
    let p, h;
    if (car.phase === "junction" && car.junctionPath) {
      p = pointAtPath(car.junctionPath, car.junctionS);
      h = headingAtPath(car.junctionPath, car.junctionS);
    } else {
      p = pointAtPath(car.path, car.s);
      h = headingAtPath(car.path, car.s);
    }

    const c = Math.cos(h), s = Math.sin(h);
    const pts = [
      { x: -6, y: -3.5 }, { x: 6, y: -3.5 },
      { x: 6, y: 3.5 }, { x: -6, y: 3.5 },
    ].map(q => ({ x: p.x + q.x * c - q.y * s, y: p.y + q.x * s + q.y * c }));

    carsGraphics.poly([pts[0].x, pts[0].y, pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y]);
    carsGraphics.fill(car.color);
    carsGraphics.stroke({ width: 1.5 / state.view.zoom, color: COLORS.carStroke });
  }
}

export function updateStatus() {
  updateSpawnButtonLabel();
  const statusEl = document.getElementById("status");
  const toolName = { segment: "Carretera", select: "Seleccionar" }[state.tool] || state.tool;
  statusEl.textContent = `Herramienta: ${toolName} · Nodos: ${state.nodes.size} · Segmentos: ${state.segments.size} · Coches: ${state.cars.length}`;
}

export function updateSpawnButtonLabel() {
  const btn = document.getElementById("spawnCarBtn");
  if (btn) btn.textContent = `Spawn coche (${state.cars.length}) [+${state.pendingSpawns}]`;
}

export function setupUi() {
  const spawnCarBtn   = document.getElementById("spawnCarBtn");
  const debugLanesBtn = document.getElementById("debugLanesBtn");
  const clearCarsBtn  = document.getElementById("clearCarsBtn");
  const clearAllBtn   = document.getElementById("clearAllBtn");
  const toolbar       = document.getElementById("toolbar");

  toolbar.addEventListener("click", e => {
    const btn = e.target.closest("button[data-tool]");
    if (!btn) return;
    const tool = btn.dataset.tool;
    setTool(tool);
  });

  spawnCarBtn.addEventListener("click", () => {
    state.pendingSpawns += 5;
    updateSpawnButtonLabel();
  });

  debugLanesBtn.addEventListener("click", () => {
    state.debugLanes = !state.debugLanes;
    debugLanesBtn.textContent = `Debug: ${state.debugLanes ? "ON" : "OFF"}`;
    debugLanesBtn.classList.toggle("active", state.debugLanes);
  });
  debugLanesBtn.textContent = `Debug: ${state.debugLanes ? "ON" : "OFF"}`;
  debugLanesBtn.classList.toggle("active", state.debugLanes);

  clearCarsBtn.addEventListener("click", () => {
    state.cars = [];
    state.pendingSpawns = 0;
    updateSpawnButtonLabel();
  });

  clearAllBtn.addEventListener("click", () => {
    state.nodes.clear();
    state.segments.clear();
    state.junctions.clear();
    state.cars = [];
    state.pendingSpawns = 0;
    state.selectedNodeId = null;
    state.selectedSegId = null;
    state.drawingSegment = null;
    state.nextNodeId = 1;
    state.nextSegmentId = 1;
    updateSpawnButtonLabel();
    markNetworkDirty();
  });

  setTool("segment");
}

export function setTool(tool) {
  state.tool = tool;
  state.drawingSegment = null;
  if (canvas) canvas.style.cursor = tool === "select" ? "default" : "crosshair";

  const toolbar = document.getElementById("toolbar");
  if (toolbar) {
    toolbar.querySelectorAll("button[data-tool]").forEach(b => {
      b.classList.toggle("active", b.dataset.tool === tool);
    });
  }
}
