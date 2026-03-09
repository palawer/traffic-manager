import { state, COLORS } from "./state.js";
import { SPAWN_BATCH,
  DEBUG_PATH_ALPHA, DEBUG_PATH_SEGMENT_WIDTH,
  CAR_BODY_HALF_LENGTH, CAR_BODY_HALF_WIDTH, CAR_CORNER_RADIUS,
  CAR_SELECTION_RADIUS, CAR_SELECTION_STROKE, CAR_SELECTION_ALPHA,
  CAR_STROKE_WIDTH, CAR_STROKE_SELECTED_WIDTH,
  SPEED_LABEL_BG_COLOR,
  ROUTE_GLOW_WIDTH, ROUTE_LINE_WIDTH, ROUTE_GLOW_ALPHA, ROUTE_LINE_ALPHA,
  ROUTE_PIN_RADIUS, ROUTE_PIN_SHADOW_ALPHA, ROUTE_PIN_FILL_ALPHA,
  ROUTE_PIN_BORDER_WIDTH, ROUTE_PIN_BORDER_ALPHA, ROUTE_PIN_DOT_ALPHA,
  NODE_STROKE_COLOR } from "./config.js";
import { pointAtPath, headingAtPath } from "./geometry.js";
import { buildLanePath } from "./traversal.js";

const app = new PIXI.Application();
export let canvas = null;
let camera = null;

// En modo lite se omiten elementos decorativos pesados para redes grandes como la importación OSM.
let liteMode = false;
export function setLiteMode(v) { liteMode = v; }

// Referencia al mapa MapLibre (si está disponible).
let maplibreMap = null;
export function setMaplibreMap(map) { maplibreMap = map; }

// Escala actual: screen px por world px. Se actualiza en applyCameraTransform.
let mapScale = 1;
let roadsGraphics = null;
let routeGraphics = null;
let routePinGraphics = null;
let carsGraphics = null;
let carLabelsContainer = null;
let routeLabelContainer = null;

export async function initRenderer() {
  const stageEl  = document.getElementById("pixi-canvas");
  const parentEl = stageEl.parentElement;
  await app.init({
    canvas: stageEl,
    resizeTo: parentEl,
    antialias: true,
    backgroundAlpha: 0,   // transparente — MapLibre dibuja debajo
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  canvas = stageEl;

  camera = new PIXI.Container();
  roadsGraphics      = new PIXI.Graphics();
  routeGraphics      = new PIXI.Graphics();
  routePinGraphics   = new PIXI.Graphics();
  carsGraphics       = new PIXI.Graphics();
  carLabelsContainer = new PIXI.Container();
  routeLabelContainer = new PIXI.Container();

  camera.addChild(roadsGraphics);
  camera.addChild(routeGraphics);
  camera.addChild(carsGraphics);
  camera.addChild(carLabelsContainer);
  camera.addChild(routePinGraphics);
  app.stage.addChild(camera);
  app.stage.addChild(routeLabelContainer);

  return { app };
}

function rendererSize() {
  return { width: app.renderer.width, height: app.renderer.height };
}

export function worldToScreen(x, y) {
  if (maplibreMap) {
    const { BBOX, SCALE } = _osmParams;
    const lon = BBOX.minLon + x / SCALE;
    const lat = BBOX.maxLat - y / SCALE;
    const pt  = maplibreMap.project([lon, lat]);
    return { x: pt.x, y: pt.y };
  }
  const { width, height } = rendererSize();
  return {
    x: (x - state.view.x) * state.view.zoom + width / 2,
    y: (y - state.view.y) * state.view.zoom + height / 2,
  };
}

export function screenToWorld(x, y) {
  if (maplibreMap) {
    const { BBOX, SCALE } = _osmParams;
    const ll = maplibreMap.unproject([x, y]);
    return {
      x: (ll.lng - BBOX.minLon) * SCALE,
      y: (BBOX.maxLat - ll.lat) * SCALE,
    };
  }
  const { width, height } = rendererSize();
  return {
    x: (x - width / 2) / state.view.zoom + state.view.x,
    y: (y - height / 2) / state.view.zoom + state.view.y,
  };
}

// Parámetros OSM importados dinámicamente para evitar dependencia circular.
let _osmParams = { BBOX: null, SCALE: 1 };
export function setOsmParams(bbox, scale) { _osmParams = { BBOX: bbox, SCALE: scale }; }

export function applyCameraTransform() {
  if (maplibreMap) {
    const center = maplibreMap.getCenter();
    const lat    = center.lat * Math.PI / 180;
    const zoom   = maplibreMap.getZoom();
    mapScale = Math.pow(2, zoom) / (156543 * Math.cos(lat));
    camera.scale.set(1);
    camera.position.set(0, 0);
    return;
  }
  const { width, height } = rendererSize();
  camera.scale.set(state.view.zoom, state.view.zoom);
  camera.position.set(
    width / 2 - state.view.x * state.view.zoom,
    height / 2 - state.view.y * state.view.zoom
  );
}


/** Dibuja los paths reales de carril en screen-space (modo debug). */
export function drawDebugRoads() {
  if (!maplibreMap) return;

  roadsGraphics.clear();
  if (!state.debugLanes) return;

  function drawPath(points) {
    if (!points || points.length < 2) return;
    const s0 = worldToScreen(points[0].x, points[0].y);
    roadsGraphics.moveTo(s0.x, s0.y);
    for (let i = 1; i < points.length; i++) {
      const s = worldToScreen(points[i].x, points[i].y);
      roadsGraphics.lineTo(s.x, s.y);
    }
  }

  // Color por velocidad (speedLimit en m/s)
  function speedColor(mps) {
    if (mps >= 30)  return 0xe74c3c; // motorway  ≥108 km/h — rojo
    if (mps >= 25)  return 0xe67e22; // primary    ~90 km/h — naranja
    if (mps >= 20)  return 0xf1c40f; // secondary  ~80 km/h — amarillo
    if (mps >= 14)  return 0x2ecc71; // tertiary   ~60 km/h — verde
    return           0x3498db;        // residential ≤50 km/h — azul
  }

  for (const seg of state.segments.values()) {
    const path = buildLanePath(seg, state.nodes, "AtoB", 0);
    if (!path || path.points.length < 2) continue;
    drawPath(path.points);
    roadsGraphics.stroke({ width: DEBUG_PATH_SEGMENT_WIDTH, color: speedColor(seg.speedLimit), alpha: DEBUG_PATH_ALPHA, pixelLine: true });
  }
}


export function drawSelectedCarRoute() {
  routeGraphics.clear();
  routePinGraphics.clear();
  routeLabelContainer.removeChildren();
  if (state.selectedCarId === null) return;
  const car = state.cars.find(c => c.id === state.selectedCarId);
  if (!car) { state.selectedCarId = null; return; }

  const color = car.color;
  const glow = ROUTE_GLOW_WIDTH;
  const thin = ROUTE_LINE_WIDTH;

  function strokePolyline(path, fromS = 0) {
    if (!path || path.points.length < 2) return;
    const currPos = pointAtPath(path, fromS);
    let idx = 0;
    while (idx < path.cumulative.length - 1 && path.cumulative[idx] <= fromS) idx++;
    const worldPts = [currPos, ...path.points.slice(idx)];
    if (worldPts.length < 2) return;
    const pts = maplibreMap
      ? worldPts.map(p => worldToScreen(p.x, p.y))
      : worldPts;
    const w = maplibreMap ? Math.max(2, glow * mapScale) : glow;
    const wt = maplibreMap ? Math.max(1, thin * mapScale) : thin;
    routeGraphics.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) routeGraphics.lineTo(pts[i].x, pts[i].y);
    routeGraphics.stroke({ width: w, color, alpha: ROUTE_GLOW_ALPHA });
    routeGraphics.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) routeGraphics.lineTo(pts[i].x, pts[i].y);
    routeGraphics.stroke({ width: wt, color, alpha: ROUTE_LINE_ALPHA });
  }

  // Current segment path remainder
  if (car.path) {
    strokePolyline(car.path, car.s);
  }

  if (!car.laneSeq) return;
  const nextStepIdx = car.routeStep + 1;

  // All future laneSeq steps
  for (let i = nextStepIdx; i < car.laneSeq.length; i++) {
    const step = car.laneSeq[i];
    const seg = state.segments.get(step.segId);
    if (!seg) continue;
    strokePolyline(buildLanePath(seg, state.nodes, step.dir, step.laneIdx), 0);
  }

  // Destination pin
  if (car.route && car.route.length > 0) {
    const destNode = state.nodes.get(car.route[car.route.length - 1]);
    if (destNode) {
      const dp = maplibreMap ? worldToScreen(destNode.x, destNode.y) : destNode;
      const pinR = maplibreMap ? Math.max(8, ROUTE_PIN_RADIUS * mapScale) : ROUTE_PIN_RADIUS;
      routePinGraphics.circle(dp.x, dp.y, pinR * 1.1);
      routePinGraphics.fill({ color: NODE_STROKE_COLOR, alpha: ROUTE_PIN_SHADOW_ALPHA });
      routePinGraphics.circle(dp.x, dp.y, pinR);
      routePinGraphics.fill({ color, alpha: ROUTE_PIN_FILL_ALPHA });
      routePinGraphics.stroke({ width: ROUTE_PIN_BORDER_WIDTH, color: SPEED_LABEL_BG_COLOR, alpha: ROUTE_PIN_BORDER_ALPHA });
      routePinGraphics.circle(dp.x, dp.y, pinR * 0.35);
      routePinGraphics.fill({ color: SPEED_LABEL_BG_COLOR, alpha: ROUTE_PIN_DOT_ALPHA });
    }
  }

  // Label: distancia y tiempo restantes junto al coche
  if (car.path && car.laneSeq) {
    let remainM = car.path.length - car.s;
    for (let i = car.routeStep + 1; i < car.laneSeq.length; i++) {
      const step = car.laneSeq[i];
      const seg  = state.segments.get(step.segId);
      if (!seg) continue;
      const p = buildLanePath(seg, state.nodes, step.dir, step.laneIdx);
      if (p) remainM += p.length;
    }
    const avgSpeed = Math.max(car.speed, car.desiredSpeed || 1, 1);
    const timeSec  = remainM / avgSpeed;

    const distTxt = remainM >= 1000
      ? `${(remainM / 1000).toFixed(1)} km`
      : `${Math.round(remainM)} m`;
    const timeTxt = timeSec >= 3600
      ? `${Math.floor(timeSec / 3600)}h ${Math.floor((timeSec % 3600) / 60)}min`
      : timeSec >= 60
        ? `${Math.floor(timeSec / 60)}min`
        : `${Math.round(timeSec)}s`;

    const carScreenPos = maplibreMap
      ? worldToScreen(pointAtPath(car.path, car.s).x, pointAtPath(car.path, car.s).y)
      : pointAtPath(car.path, car.s);

    const label = new PIXI.Text({
      text: `${distTxt}  ·  ${timeTxt}`,
      style: {
        fontSize: 13,
        fill: 0xffffff,
        fontFamily: "sans-serif",
        fontWeight: "bold",
        stroke: { color: 0x000000, width: 3 },
      },
    });
    label.x = carScreenPos.x + 14;
    label.y = carScreenPos.y - 10;
    routeLabelContainer.addChild(label);
  }
}

function getCarPose(car) {
  return {
    p: pointAtPath(car.path, car.s),
    h: headingAtPath(car.path, car.s),
    path: car.path,
    s: car.s,
  };
}

function clearDebugCarLabels() {
  for (const ch of carLabelsContainer.removeChildren()) ch.destroy();
}

export function drawCars() {
  carsGraphics.clear();
  clearDebugCarLabels();

  const halfL   = maplibreMap ? Math.max(3, CAR_BODY_HALF_LENGTH * mapScale) : CAR_BODY_HALF_LENGTH;
  const halfW   = maplibreMap ? Math.max(2, CAR_BODY_HALF_WIDTH  * mapScale) : CAR_BODY_HALF_WIDTH;
  const cornerR = maplibreMap ? Math.max(0.5, CAR_CORNER_RADIUS  * mapScale) : CAR_CORNER_RADIUS;
  const selR    = maplibreMap ? Math.max(4, CAR_SELECTION_RADIUS  * mapScale) : CAR_SELECTION_RADIUS;

  for (const car of state.cars) {
    const pose = getCarPose(car);
    const wp   = pose.p;

    const p = maplibreMap ? worldToScreen(wp.x, wp.y) : wp;

    let h = pose.h;
    if (maplibreMap && pose.path) {
      const aheadS = Math.min(pose.s + 2, pose.path.length - 0.001);
      const aheadW = pointAtPath(pose.path, aheadS);
      const aheadP = worldToScreen(aheadW.x, aheadW.y);
      const dx = aheadP.x - p.x, dy = aheadP.y - p.y;
      if (dx * dx + dy * dy > 0.1) h = Math.atan2(dy, dx);
    }

    // Smooth heading with exponential filter
    if (car._renderH === undefined) car._renderH = h;
    let diff = h - car._renderH;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    car._renderH += diff * 0.25;
    h = car._renderH;

    const selected   = car.id === state.selectedCarId;
    const spawnAlpha = 1;

    if (selected) {
      carsGraphics.circle(p.x, p.y, selR);
      carsGraphics.stroke({ width: CAR_SELECTION_STROKE, color: SPEED_LABEL_BG_COLOR, alpha: CAR_SELECTION_ALPHA * spawnAlpha });
    }

    const bodyPts = buildRoundedCarBodyPoints(p.x, p.y, h, halfL, halfW, cornerR);
    carsGraphics.poly(bodyPts);
    carsGraphics.fill({ color: car.color, alpha: spawnAlpha });
    carsGraphics.stroke({
      width: selected ? CAR_STROKE_SELECTED_WIDTH : CAR_STROKE_WIDTH,
      color: selected ? SPEED_LABEL_BG_COLOR : COLORS.carStroke,
      alpha: spawnAlpha,
    });
  }
}

function buildRoundedCarBodyPoints(cx, cy, heading, halfL, halfW, radius) {
  const r = Math.max(0, Math.min(radius, halfL, halfW));
  const innerL = halfL - r;
  const innerW = halfW - r;
  const cornerSteps = 3;
  const local = [];

  function addArc(centerX, centerY, a0, a1) {
    for (let i = 0; i <= cornerSteps; i++) {
      const t = i / cornerSteps;
      const a = a0 + (a1 - a0) * t;
      local.push({ x: centerX + Math.cos(a) * r, y: centerY + Math.sin(a) * r });
    }
  }

  addArc(innerL, -innerW, -Math.PI / 2, 0);
  addArc(innerL, innerW, 0, Math.PI / 2);
  addArc(-innerL, innerW, Math.PI / 2, Math.PI);
  addArc(-innerL, -innerW, Math.PI, (3 * Math.PI) / 2);

  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const world = [];
  for (const q of local) {
    world.push(cx + q.x * c - q.y * s, cy + q.x * s + q.y * c);
  }
  return world;
}

export function updatePropertiesPanel() {}

export function updateStatus() {
  updateSpawnButtonLabel();
  const statusEl = document.getElementById("status");
  statusEl.textContent = `Coches: ${state.cars.length + state.pendingSpawns} · Segmentos: ${state.segments.size}`;
}

export function updateSpawnButtonLabel() {
  const btn = document.getElementById("spawnCarBtn");
  if (btn) btn.textContent = `Spawn coche (${state.cars.length}) [+${state.pendingSpawns}]`;
}

export function setupUi() {
  const pauseBtn      = document.getElementById("pauseBtn");
  const spawnCarBtn   = document.getElementById("spawnCarBtn");
  const debugLanesBtn = document.getElementById("debugLanesBtn");
  const clearCarsBtn  = document.getElementById("clearCarsBtn");

  pauseBtn.addEventListener("click", () => {
    state.paused = !state.paused;
    pauseBtn.textContent = state.paused ? "▶ Reanudar" : "⏸ Pausa";
    pauseBtn.classList.toggle("active", state.paused);
  });

  spawnCarBtn.addEventListener("click", () => {
    const input = document.getElementById("spawnBatchInput");
    const batch = Math.max(1, parseInt(input?.value) || SPAWN_BATCH);
    state.pendingSpawns += batch;
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
}

export function fitViewToNetwork() {
  if (state.nodes.size === 0) return false;

  if (maplibreMap) {
    const { BBOX } = _osmParams;
    if (BBOX) {
      maplibreMap.fitBounds(
        [[BBOX.minLon, BBOX.minLat], [BBOX.maxLon, BBOX.maxLat]],
        { padding: 40, duration: 800 }
      );
    }
    return true;
  }

  return false;
}
