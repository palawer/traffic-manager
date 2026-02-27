import { state, LANE_WIDTH, GRID, COLORS } from "./state.js";
import { SPEED_PRESETS, MAX_LANES, SPAWN_BATCH, EXPLOSION_MAX_RADIUS } from "./config.js";
import { pointAtPath, headingAtPath, junctionInset, buildConnectorBezier, hslToHex } from "./geometry.js";
import { rebuildJunctions, markNetworkDirty, getNodeSegments, findConnector } from "./network.js";
import { buildLanePath } from "./traversal.js";
import { saveState } from "./persistence.js";

const app = new PIXI.Application();
export let canvas = null;
let camera = null;
let gridGraphics = null;
let junctionGraphics = null;
let roadsGraphics = null;
let laneMarkingsGraphics = null;
let tmpeOverlayGraphics = null;
let connectorOverlayGraphics = null;
let routeGraphics = null;
let signalGraphics = null;
let nodeGraphics = null;
let previewGraphics = null;
let carsGraphics = null;
let explosionGraphics = null;
let carLabelsContainer = null;
let speedLabelsContainer = null;

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
  connectorOverlayGraphics = new PIXI.Graphics();
  routeGraphics        = new PIXI.Graphics();
  signalGraphics       = new PIXI.Graphics();
  nodeGraphics       = new PIXI.Graphics();
  previewGraphics    = new PIXI.Graphics();
  carsGraphics       = new PIXI.Graphics();
  explosionGraphics  = new PIXI.Graphics();
  carLabelsContainer = new PIXI.Container();
  speedLabelsContainer = new PIXI.Container();

  camera.addChild(gridGraphics);
  camera.addChild(junctionGraphics);
  camera.addChild(roadsGraphics);
  camera.addChild(laneMarkingsGraphics);
  camera.addChild(speedLabelsContainer);
  camera.addChild(tmpeOverlayGraphics);
  camera.addChild(connectorOverlayGraphics);
  camera.addChild(routeGraphics);
  camera.addChild(signalGraphics);
  camera.addChild(nodeGraphics);
  camera.addChild(previewGraphics);
  camera.addChild(carsGraphics);
  camera.addChild(explosionGraphics);
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

/**
 * For a node where exactly two segments meet, fill the bend by stroking
 * a bezier along the road centreline with the full road width.
 */
function drawBendJunction(g, nodeId, segs) {
  const node = state.nodes.get(nodeId);
  if (!node) return;
  const [s1, s2] = segs;

  const other1 = state.nodes.get(s1.nodeA === nodeId ? s1.nodeB : s1.nodeA);
  const other2 = state.nodes.get(s2.nodeA === nodeId ? s2.nodeB : s2.nodeA);
  if (!other1 || !other2) return;

  // Angle from node outward along each segment
  const a1 = Math.atan2(other1.y - node.y, other1.x - node.x);
  const a2 = Math.atan2(other2.y - node.y, other2.x - node.x);

  const inset1 = junctionInset(s1, segs);
  const inset2 = junctionInset(s2, segs);

  // Stop-line centres (road axis, no lane offset)
  const from = {
    x: node.x + Math.cos(a1) * inset1,
    y: node.y + Math.sin(a1) * inset1,
    heading: a1 + Math.PI,   // direction of travel arriving from s1
  };
  const to = {
    x: node.x + Math.cos(a2) * inset2,
    y: node.y + Math.sin(a2) * inset2,
    heading: a2,              // direction of travel departing into s2
  };

  const pts = buildConnectorBezier(from, to);
  const w = Math.max(
    (s1.lanesAtoB + s1.lanesBtoA) * LANE_WIDTH,
    (s2.lanesAtoB + s2.lanesBtoA) * LANE_WIDTH
  );

  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.stroke({ width: w, color: COLORS.road, cap: "round", join: "round" });
}

export function drawRoads() {
  if (state.networkDirty) rebuildJunctions();

  roadsGraphics.clear();
  laneMarkingsGraphics.clear();
  junctionGraphics.clear();

  const lw = 1.5 / state.view.zoom;

  // Draw junctions
  for (const [nodeId, junc] of state.junctions) {
    const segsAtNode = getNodeSegments(nodeId);

    if (segsAtNode.length === 2) {
      // Two-road bend: stroke the road-centre bezier with full road width
      drawBendJunction(junctionGraphics, nodeId, segsAtNode);
    } else if (junc.polygon && junc.polygon.length >= 3) {
      // Three+ roads: filled convex polygon
      const flat = junc.polygon.flatMap(p => [p.x, p.y]);
      junctionGraphics.poly(flat);
      junctionGraphics.fill(COLORS.junction);
    }
  }

  // Draw segment bodies
  for (const seg of state.segments.values()) {
    const ip = segmentInsetPoints(seg);
    if (!ip) continue;
    const { pA, pB, totalWidth } = ip;

    roadsGraphics.moveTo(pA.x, pA.y).lineTo(pB.x, pB.y);
    roadsGraphics.stroke({ width: totalWidth, color: COLORS.road, cap: "butt" });
  }

  // Speed-tool hover highlight
  if (state.tool === "speed" && state.hoveredSegId !== null) {
    const hSeg = state.segments.get(state.hoveredSegId);
    if (hSeg) {
      const hip = segmentInsetPoints(hSeg);
      if (hip) {
        roadsGraphics.moveTo(hip.pA.x, hip.pA.y).lineTo(hip.pB.x, hip.pB.y);
        roadsGraphics.stroke({ width: hip.totalWidth + 6, color: 0xffffff, alpha: 0.25, cap: "butt" });
      }
    }
  }

  // Draw lane markings
  for (const seg of state.segments.values()) {
    const ip = segmentInsetPoints(seg);
    if (!ip) continue;
    const { pA, pB, ux, uy, totalWidth, heading } = ip;

    // Perpendicular (right normal)
    const nx = -uy, ny = ux;
    const halfW = totalWidth / 2;

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
  const invalid = !!state.drawingSegment.invalid;
  previewGraphics.moveTo(fromNode.x, fromNode.y).lineTo(to.x, to.y);
  previewGraphics.stroke({ width: totalWidth, color: invalid ? 0xdd3333 : COLORS.previewRoad, alpha: 0.55, cap: "round" });

  // Show snap circle at destination
  if (state.drawingSegment.snapNodeId) {
    previewGraphics.circle(to.x, to.y, 8 / state.view.zoom);
    previewGraphics.stroke({ width: 2 / state.view.zoom, color: COLORS.nodeSelected });
  }
}

export function drawSelectedCarRoute() {
  routeGraphics.clear();
  if (state.selectedCarId === null) return;
  const car = state.cars.find(c => c.id === state.selectedCarId);
  if (!car) { state.selectedCarId = null; return; }

  const color = car.color;
  const glow = 8 / state.view.zoom;
  const thin = 3 / state.view.zoom;

  function strokePolyline(path, fromS = 0) {
    if (!path || path.points.length < 2) return;
    const currPos = pointAtPath(path, fromS);
    // Find first point index strictly after fromS
    let idx = 0;
    while (idx < path.cumulative.length - 1 && path.cumulative[idx] <= fromS) idx++;
    const pts = [currPos, ...path.points.slice(idx)];
    if (pts.length < 2) return;
    // Glow pass
    routeGraphics.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) routeGraphics.lineTo(pts[i].x, pts[i].y);
    routeGraphics.stroke({ width: glow, color, alpha: 0.25 });
    // Line pass
    routeGraphics.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) routeGraphics.lineTo(pts[i].x, pts[i].y);
    routeGraphics.stroke({ width: thin, color, alpha: 0.9 });
  }

  // 1. Remaining current phase path
  if (car.phase === "segment" && car.path) {
    strokePolyline(car.path, car.s);
  } else if (car.phase === "junction" && car.junctionPath) {
    strokePolyline(car.junctionPath, car.junctionS);
  }

  if (!car.laneSeq) return;
  const nextStepIdx = car.routeStep + 1;

  // 2. Connector from current segment to next step (segment phase only)
  if (car.phase === "segment" && nextStepIdx < car.laneSeq.length) {
    const currStep = car.laneSeq[car.routeStep];
    const nextStep = car.laneSeq[nextStepIdx];
    const seg = state.segments.get(currStep.segId);
    if (seg) {
      const destNodeId = (currStep.dir === "AtoB") ? seg.nodeB : seg.nodeA;
      const conn = findConnector(destNodeId, currStep.segId, currStep.dir, currStep.laneIdx,
                                 nextStep.segId, nextStep.dir, nextStep.laneIdx);
      if (conn) strokePolyline(conn.path, 0);
    }
  }

  // 3. All future laneSeq steps + connectors between them
  for (let i = nextStepIdx; i < car.laneSeq.length; i++) {
    const step = car.laneSeq[i];
    const seg = state.segments.get(step.segId);
    if (!seg) continue;
    strokePolyline(buildLanePath(seg, state.nodes, step.dir, step.laneIdx), 0);

    if (i + 1 < car.laneSeq.length) {
      const nextStep = car.laneSeq[i + 1];
      const destNodeId = (step.dir === "AtoB") ? seg.nodeB : seg.nodeA;
      const conn = findConnector(destNodeId, step.segId, step.dir, step.laneIdx,
                                 nextStep.segId, nextStep.dir, nextStep.laneIdx);
      if (conn) strokePolyline(conn.path, 0);
    }
  }

  // 4. Destination marker
  if (car.route && car.route.length > 0) {
    const destNode = state.nodes.get(car.route[car.route.length - 1]);
    if (destNode) {
      const r = 10 / state.view.zoom;
      routeGraphics.circle(destNode.x, destNode.y, r);
      routeGraphics.fill({ color, alpha: 0.25 });
      routeGraphics.stroke({ width: 2.5 / state.view.zoom, color, alpha: 0.9 });
    }
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

export function drawExplosions(dt) {
  explosionGraphics.clear();
  state.explosions = state.explosions.filter(ex => {
    ex.age += dt;
    if (ex.age >= ex.duration) return false;

    const t = ex.age / ex.duration;          // 0 → 1
    const easeOut = 1 - (1 - t) * (1 - t);  // ease-out quad

    // Expanding ring: orange → transparent
    const ringRadius = EXPLOSION_MAX_RADIUS * easeOut;
    const ringAlpha  = (1 - t) * 0.9;
    const ringWidth  = (1 - t) * 6 + 1;
    const ringColor  = t < 0.4 ? 0xffdd00 : 0xff6600;
    explosionGraphics.circle(ex.x, ex.y, ringRadius);
    explosionGraphics.stroke({ color: ringColor, width: ringWidth, alpha: ringAlpha });

    // Inner flash (first 30% only)
    if (t < 0.3) {
      const flashAlpha = (1 - t / 0.3) * 0.6;
      explosionGraphics.circle(ex.x, ex.y, ringRadius * 0.55);
      explosionGraphics.fill({ color: 0xffffff, alpha: flashAlpha });
    }

    // Sparks
    const sparkLen  = EXPLOSION_MAX_RADIUS * 1.1 * easeOut;
    const sparkAlpha = (1 - t) * 0.85;
    for (const angle of ex.sparkAngles) {
      const x1 = ex.x + Math.cos(angle) * ringRadius * 0.4;
      const y1 = ex.y + Math.sin(angle) * ringRadius * 0.4;
      const x2 = ex.x + Math.cos(angle) * sparkLen;
      const y2 = ex.y + Math.sin(angle) * sparkLen;
      explosionGraphics.moveTo(x1, y1).lineTo(x2, y2);
      explosionGraphics.stroke({ color: 0xffaa00, width: 1.5, alpha: sparkAlpha });
    }

    return true;
  });
}

export function updatePropertiesPanel() {
  const panel = document.getElementById("propertiesPanel");
  const seg = state.selectedSegId !== null ? state.segments.get(state.selectedSegId) : null;
  if (!seg) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "";
  document.getElementById("atobVal").textContent = seg.lanesAtoB;
  document.getElementById("btoaVal").textContent = seg.lanesBtoA;
  document.getElementById("propSpeedBtn").textContent = `${seg.speedLimit} km/h`;
}

export function updateStatus() {
  updateSpawnButtonLabel();
  const statusEl = document.getElementById("status");
  const toolName = { segment: "Carretera", select: "Seleccionar", speed: "Velocidad", arrow: "Flechas", signal: "Semáforos" }[state.tool] || state.tool;
  statusEl.textContent = `Herramienta: ${toolName} · Nodos: ${state.nodes.size} · Segmentos: ${state.segments.size} · Coches: ${state.cars.length}`;
  const crashEl = document.getElementById("crashCount");
  if (crashEl) crashEl.textContent = `Siniestros: ${state.crashes}`;
}

export function updateSpawnButtonLabel() {
  const btn = document.getElementById("spawnCarBtn");
  if (btn) btn.textContent = `Spawn coche (${state.cars.length}) [+${state.pendingSpawns}]`;
}

export function setupUi() {
  const pauseBtn      = document.getElementById("pauseBtn");
  const spawnCarBtn   = document.getElementById("spawnCarBtn");
  const debugLanesBtn = document.getElementById("debugLanesBtn");

  // Properties panel
  function withSeg(fn) {
    const seg = state.selectedSegId !== null ? state.segments.get(state.selectedSegId) : null;
    if (!seg) return;
    fn(seg);
    markNetworkDirty();
    saveState();
  }
  const SPEED_CYCLE = SPEED_PRESETS;
  document.getElementById("atobMinus").addEventListener("click", () => withSeg(s => { if (s.lanesAtoB + s.lanesBtoA > 1) s.lanesAtoB = Math.max(0, s.lanesAtoB - 1); }));
  document.getElementById("atobPlus") .addEventListener("click", () => withSeg(s => { if (s.lanesAtoB < MAX_LANES) s.lanesAtoB++; }));
  document.getElementById("btoaMinus").addEventListener("click", () => withSeg(s => { if (s.lanesAtoB + s.lanesBtoA > 1) s.lanesBtoA = Math.max(0, s.lanesBtoA - 1); }));
  document.getElementById("btoaPlus") .addEventListener("click", () => withSeg(s => { if (s.lanesBtoA < MAX_LANES) s.lanesBtoA++; }));
  document.getElementById("propSpeedBtn").addEventListener("click", () => withSeg(s => {
    s.speedLimit = SPEED_CYCLE[(SPEED_CYCLE.indexOf(s.speedLimit) + 1) % SPEED_CYCLE.length];
  }));
  const clearCarsBtn  = document.getElementById("clearCarsBtn");
  const clearAllBtn   = document.getElementById("clearAllBtn");
  document.querySelector(".panel").addEventListener("click", e => {
    const btn = e.target.closest("button[data-tool]");
    if (btn) setTool(btn.dataset.tool);
  });

  pauseBtn.addEventListener("click", () => {
    state.paused = !state.paused;
    pauseBtn.textContent = state.paused ? "▶ Reanudar" : "⏸ Pausa";
    pauseBtn.classList.toggle("active", state.paused);
  });

  spawnCarBtn.addEventListener("click", () => {
    state.pendingSpawns += SPAWN_BATCH;
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
    state.explosions = [];
    state.pendingSpawns = 0;
    updateSpawnButtonLabel();
  });

  clearAllBtn.addEventListener("click", () => {
    state.nodes.clear();
    state.segments.clear();
    state.junctions.clear();
    state.signals.clear();
    state.laneArrows.clear();
    state.userConnectors.clear();
    state.cars = [];
    state.explosions = [];
    state.crashes = 0;
    state.pendingSpawns = 0;
    state.selectedNodeId = null;
    state.selectedSegId = null;
    state.selectedCarId = null;
    state.drawingSegment = null;
    state.connectorTool.editingNodeId = null;
    state.connectorTool.selectedInKey = null;
    state.nextNodeId = 1;
    state.nextSegmentId = 1;
    state.nextConnectorId = 1;
    updateSpawnButtonLabel();
    markNetworkDirty();
    saveState();
  });

  setTool("segment");
}

function drawArrowGlyphs(g, cx, cy, laneHeading, arrowSet) {
  const types = [...arrowSet];
  const count = types.length;
  const perpX = -Math.sin(laneHeading), perpY = Math.cos(laneHeading);

  types.forEach((type, i) => {
    const offset = (i - (count - 1) / 2) * 7;
    const ox = cx + perpX * offset;
    const oy = cy + perpY * offset;

    let ah = laneHeading;
    if (type === "right") ah = laneHeading + Math.PI / 2.2;
    if (type === "left")  ah = laneHeading - Math.PI / 2.2;

    const cos = Math.cos(ah), sin = Math.sin(ah);
    const px = -Math.sin(ah), py = Math.cos(ah);
    const h = 8, w = 4.5;

    const tip = { x: ox + cos * h,                    y: oy + sin * h };
    const bl  = { x: ox - cos * h * 0.25 - px * w,   y: oy - sin * h * 0.25 - py * w };
    const br  = { x: ox - cos * h * 0.25 + px * w,   y: oy - sin * h * 0.25 + py * w };

    g.poly([tip.x, tip.y, bl.x, bl.y, br.x, br.y]);
    g.fill({ color: 0xffffff, alpha: 0.9 });
  });
}

export function drawLaneArrows() {
  tmpeOverlayGraphics.clear();

  // Hover highlight
  if (state.tool === "arrow" && state.hoveredLane) {
    const { segId, dir, laneIdx } = state.hoveredLane;
    const seg = state.segments.get(segId);
    if (seg) {
      const ip = segmentInsetPoints(seg);
      if (ip) {
        const { pA, pB, ux, uy } = ip;
        const nx = -uy, ny = ux;
        const lateralSign = (dir === "AtoB") ? 1 : -1;
        const center = lateralSign * (laneIdx + 0.5) * LANE_WIDTH;
        tmpeOverlayGraphics.moveTo(pA.x + nx * center, pA.y + ny * center)
          .lineTo(pB.x + nx * center, pB.y + ny * center);
        tmpeOverlayGraphics.stroke({ width: LANE_WIDTH - 2, color: 0xffffff, alpha: 0.18 });
      }
    }
  }

  // Draw arrow glyphs for each configured lane
  for (const [key, arrowSet] of state.laneArrows) {
    if (arrowSet.size === 0) continue;
    const parts = key.split(":");
    const segId = parseInt(parts[0]);
    const dir = parts[1];
    const laneIdx = parseInt(parts[2]);
    const seg = state.segments.get(segId);
    if (!seg) continue;

    const nodeA = state.nodes.get(seg.nodeA);
    const nodeB = state.nodes.get(seg.nodeB);
    if (!nodeA || !nodeB) continue;

    const heading = Math.atan2(nodeB.y - nodeA.y, nodeB.x - nodeA.x);
    const rightX = -Math.sin(heading), rightY = Math.cos(heading);
    const lateralSign = (dir === "AtoB") ? 1 : -1;
    const laneHeading = (dir === "AtoB") ? heading : heading + Math.PI;
    const lateralOff = lateralSign * (laneIdx + 0.5) * LANE_WIDTH;

    const mx = (nodeA.x + nodeB.x) / 2 + rightX * lateralOff;
    const my = (nodeA.y + nodeB.y) / 2 + rightY * lateralOff;

    drawArrowGlyphs(tmpeOverlayGraphics, mx, my, laneHeading, arrowSet);
  }
}

export function drawSignals() {
  signalGraphics.clear();

  for (const [nodeId, signal] of state.signals) {
    const junc = state.junctions.get(nodeId);
    if (!junc) continue;
    const phase = signal.phases[signal.currentPhase];
    const drawnLanes = new Set();

    for (const conn of junc.connectors) {
      const laneKey = `${conn.inSegId}:${conn.inDir}:${conn.inLane}`;
      if (drawnLanes.has(laneKey)) continue;
      drawnLanes.add(laneKey);
      if (conn.path.points.length === 0) continue;

      const pt = conn.path.points[0];
      const armKey = `${conn.inSegId}:${conn.inDir}`;
      const isManaged = signal?.phases.some(p => p.greenConnectors.has(armKey));
      const isGreen = !isManaged || (phase?.greenConnectors.has(armKey) ?? true);
      const color = isGreen ? COLORS.trafficGreen : COLORS.trafficRed;
      const r = 5;

      signalGraphics.circle(pt.x, pt.y, r).fill(color);
      signalGraphics.circle(pt.x, pt.y, r).stroke({ width: 1.5, color: 0x000000, alpha: 0.5 });
    }

    // In signal tool mode: ring around nodes that have a signal
    if (state.tool === "signal") {
      const node = state.nodes.get(nodeId);
      if (node) {
        const r = 14 / state.view.zoom;
        signalGraphics.circle(node.x, node.y, r).stroke({ width: 2 / state.view.zoom, color: 0xffdd00, alpha: 0.85 });
      }
    }
  }
}

export function drawSpeedLabels() {
  const segIds = new Set(state.segments.keys());

  // Remove labels for deleted segments
  for (let i = speedLabelsContainer.children.length - 1; i >= 0; i--) {
    if (!segIds.has(speedLabelsContainer.children[i]._segId)) {
      speedLabelsContainer.removeChildAt(i);
    }
  }

  for (const seg of state.segments.values()) {
    const nodeA = state.nodes.get(seg.nodeA);
    const nodeB = state.nodes.get(seg.nodeB);
    if (!nodeA || !nodeB) continue;

    const mx = (nodeA.x + nodeB.x) / 2;
    const my = (nodeA.y + nodeB.y) / 2;

    // Find or create sign container
    let sign = null;
    for (const child of speedLabelsContainer.children) {
      if (child._segId === seg.id) { sign = child; break; }
    }
    if (!sign) {
      sign = new PIXI.Container();
      sign._segId = seg.id;
      sign._lastSpeed = null;

      const bg = new PIXI.Graphics();
      bg.label = "bg";
      sign.addChild(bg);

      const txt = new PIXI.Text({ text: "", style: { fontSize: 13, fill: 0x111111, fontWeight: "bold" } });
      txt.label = "lbl";
      txt.anchor.set(0.5, 0.5);
      sign.addChild(txt);

      speedLabelsContainer.addChild(sign);
    }

    // Redraw background only when speed changes
    if (sign._lastSpeed !== seg.speedLimit) {
      sign._lastSpeed = seg.speedLimit;

      const bg = sign.getChildByLabel("bg");
      const R = 13;
      bg.clear();
      bg.circle(0, 0, R).fill(0xffffff);
      bg.circle(0, 0, R).stroke({ width: 2.5, color: 0xcc0000 });

      sign.getChildByLabel("lbl").text = String(seg.speedLimit);
    }

    sign.x = mx;
    sign.y = my;
    sign.scale.set(1 / state.view.zoom);
    sign.alpha = (state.tool === "speed") ? 1.0 : 0.8;
  }
}

export function setTool(tool) {
  state.tool = tool;
  state.drawingSegment = null;
  state.hoveredSegId = null;
  state.hoveredLane = null;
  state.connectorTool.editingNodeId = null;
  state.connectorTool.selectedInKey = null;
  if (canvas) canvas.style.cursor = tool === "select" ? "default" : "crosshair";

  document.querySelectorAll("button[data-tool]").forEach(b => {
    b.classList.toggle("active", b.dataset.tool === tool);
  });
}

function laneEndpointColor(segId) {
  return hslToHex((segId * 137.5 % 360) / 360, 0.65, 0.58);
}

export function drawConnectorTool() {
  connectorOverlayGraphics.clear();
  if (state.tool !== "connector") return;

  if (state.networkDirty) rebuildJunctions();

  const ct = state.connectorTool;

  if (ct.editingNodeId === null) {
    // Highlight all nodes that have junctions (hoverable)
    for (const [nodeId, junc] of state.junctions) {
      if (junc.connectors.length === 0) continue;
      const node = state.nodes.get(nodeId);
      if (!node) continue;
      const hovered = state.hoveredNodeId === nodeId;
      connectorOverlayGraphics.circle(node.x, node.y, 18);
      connectorOverlayGraphics.stroke({ color: hovered ? 0xffd700 : 0x88bbdd, width: 2 / state.view.zoom, alpha: 0.7 });
    }
    return;
  }

  const junc = state.junctions.get(ct.editingNodeId);
  if (!junc) return;

  const [selSegIdStr, selDir, selLaneStr] = ct.selectedInKey ? ct.selectedInKey.split(":") : [];
  const selSegId = selSegIdStr ? parseInt(selSegIdStr) : null;
  const selLane  = selLaneStr  ? parseInt(selLaneStr)  : null;

  // Draw all connectors
  for (const conn of junc.connectors) {
    const isFromSelected = ct.selectedInKey &&
      conn.inSegId === selSegId && conn.inDir === selDir && conn.inLane === selLane;
    const color = conn.userDefined ? COLORS.selected : 0x3399ff;
    const alpha = isFromSelected ? 1.0 : (conn.userDefined ? 0.75 : 0.3);
    const width = isFromSelected ? 4 : 2.5;
    const pts = conn.path.points;
    connectorOverlayGraphics.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) connectorOverlayGraphics.lineTo(pts[i].x, pts[i].y);
    connectorOverlayGraphics.stroke({ color, width, alpha });
  }

  // Draw outgoing endpoints
  for (const out of junc.outgoingLanes) {
    const outKey = `${out.segId}:${out.dir}:${out.laneIdx}`;
    const color = laneEndpointColor(out.segId);
    const isTarget = ct.selectedInKey !== null && out.segId !== selSegId;
    const hasConn = ct.selectedInKey && junc.connectors.some(c =>
      c.inSegId === selSegId && c.inDir === selDir && c.inLane === selLane &&
      c.outSegId === out.segId && c.outDir === out.dir && c.outLane === out.laneIdx
    );
    const r = isTarget ? 9 : 6;
    connectorOverlayGraphics.circle(out.ep.x, out.ep.y, r);
    if (isTarget) {
      connectorOverlayGraphics.fill({ color: hasConn ? COLORS.selected : color, alpha: 0.85 });
      connectorOverlayGraphics.circle(out.ep.x, out.ep.y, r + 2);
      connectorOverlayGraphics.stroke({ color: hasConn ? 0xffffff : 0xaaaaaa, width: 1.5 });
    } else {
      connectorOverlayGraphics.stroke({ color, width: 1.5, alpha: 0.5 });
    }
  }

  // Draw incoming endpoints
  for (const inc of junc.incomingLanes) {
    const inKey = `${inc.segId}:${inc.dir}:${inc.laneIdx}`;
    const selected = ct.selectedInKey === inKey;
    const color = laneEndpointColor(inc.segId);
    const r = selected ? 10 : 7;
    connectorOverlayGraphics.circle(inc.ep.x, inc.ep.y, r);
    connectorOverlayGraphics.fill({ color: selected ? 0xffd700 : color });
    if (selected) {
      connectorOverlayGraphics.circle(inc.ep.x, inc.ep.y, r + 3);
      connectorOverlayGraphics.stroke({ color: 0xffffff, width: 2 });
    }
  }
}
