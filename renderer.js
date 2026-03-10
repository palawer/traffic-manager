import { state } from "./state.js";
import { SPAWN_BATCH,
  DEBUG_PATH_ALPHA, DEBUG_PATH_SEGMENT_WIDTH,
  CAR_BODY_HALF_LENGTH, CAR_BODY_HALF_WIDTH, CAR_CORNER_RADIUS,
  CAR_SELECTION_RADIUS, CAR_SELECTION_STROKE, CAR_SELECTION_ALPHA,
  SPEED_LABEL_BG_COLOR,
  ROUTE_GLOW_WIDTH, ROUTE_LINE_WIDTH, ROUTE_GLOW_ALPHA, ROUTE_LINE_ALPHA,
  ROUTE_PIN_RADIUS, ROUTE_PIN_SHADOW_ALPHA, ROUTE_PIN_FILL_ALPHA,
  ROUTE_PIN_BORDER_WIDTH, ROUTE_PIN_BORDER_ALPHA, ROUTE_PIN_DOT_ALPHA,
  NODE_STROKE_COLOR } from "./config.js";
import { pointAtPath } from "./geometry.js";
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
// Caché de transformación afín: evita llamadas project() por coche en cada frame.
let _affine = null; // { kxx, kxy, kyx, kyy, tx, ty }
let roadsGraphics = null;
let routeGraphics = null;
let routePinGraphics = null;
let particleContainer = null;
let selectionGraphics = null;
let routeLabelContainer = null;

let carTexture = null;
const _carParticles = new Map(); // id → PIXI.Sprite
const _particlePool  = [];
const _carRenderH    = new Map(); // id → ángulo suavizado

// Último frame de simulación recibido del worker
let _renderFrame = { carCount: 0, pendingSpawns: 0, positions: null, ids: null, colors: null, graces: null, selectedCar: null };

export function setRenderFrame(data) { _renderFrame = data; }
export function getLastRenderFrame() { return _renderFrame; }

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
  roadsGraphics       = new PIXI.Graphics();
  routeGraphics       = new PIXI.Graphics();
  routePinGraphics    = new PIXI.Graphics();
  selectionGraphics   = new PIXI.Graphics();
  routeLabelContainer = new PIXI.Container();

  // Build car texture: borde negro + relleno blanco (tintado por coche al dibujar)
  const tg = new PIXI.Graphics();
  tg.roundRect(0, 0, CAR_BODY_HALF_LENGTH * 2, CAR_BODY_HALF_WIDTH * 2, CAR_CORNER_RADIUS);
  tg.fill(0xffffff);
  tg.stroke({ width: 0.4, color: 0x000000 });
  carTexture = app.renderer.generateTexture(tg);
  tg.destroy();

  // Container for car sprites — PixiJS v8 auto-batches same-texture sprites
  particleContainer = new PIXI.Container();

  camera.addChild(roadsGraphics);
  camera.addChild(routeGraphics);
  camera.addChild(particleContainer);
  camera.addChild(selectionGraphics);
  camera.addChild(routePinGraphics);
  app.stage.addChild(camera);
  app.stage.addChild(routeLabelContainer);

  return { app };
}

function rendererSize() {
  return { width: app.renderer.width, height: app.renderer.height };
}

export function worldToScreen(x, y) {
  if (_affine) {
    return {
      x: x * _affine.kxx + y * _affine.kxy + _affine.tx,
      y: x * _affine.kyx + y * _affine.kyy + _affine.ty,
    };
  }
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
    // Derivar transformación afín desde 3 llamadas project().
    // Centrada en el viewport actual para minimizar el error de aproximación lineal.
    // Paso de 0.01° (~1.1 km) para buena precisión numérica.
    if (_osmParams.BBOX) {
      const { BBOX, SCALE } = _osmParams;
      const center = maplibreMap.getCenter();
      const refLon = center.lng;
      const refLat = center.lat;
      const refWx  = (refLon - BBOX.minLon) * SCALE;
      const refWy  = (BBOX.maxLat - refLat) * SCALE;
      const dLon = 0.01, dLat = 0.01; // grados — da ~14 px de diferencia a zoom 10
      const p00 = maplibreMap.project([refLon,        refLat       ]);
      const p10 = maplibreMap.project([refLon + dLon, refLat       ]);
      const p01 = maplibreMap.project([refLon,        refLat - dLat]);
      const kxx = (p10.x - p00.x) / (dLon * SCALE);
      const kxy = (p01.x - p00.x) / (dLat * SCALE);
      const kyx = (p10.y - p00.y) / (dLon * SCALE);
      const kyy = (p01.y - p00.y) / (dLat * SCALE);
      _affine = {
        kxx, kxy, kyx, kyy,
        tx: p00.x - kxx * refWx - kxy * refWy,
        ty: p00.y - kyx * refWx - kyy * refWy,
      };
      mapScale = Math.hypot(p01.x - p00.x, p01.y - p00.y) / (dLat * SCALE);
    }
    camera.scale.set(1);
    camera.position.set(0, 0);
    return;
  }
  // Sin mapa — invalidar caché afín
  _affine = null;
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
  const car = _renderFrame.selectedCar;
  // Solo deseleccionar si el worker confirmó que buscó este ID y no lo encontró
  // (evita deselección prematura por el delay de 1 frame entre tick y frame)
  if (!car) {
    if (_renderFrame.echoSelectedCarId === state.selectedCarId) state.selectedCarId = null;
    return;
  }

  const color = 0x000000;
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
    // Tiempo del segmento actual (usar velocidad real o deseada)
    let timeSec = remainM / Math.max(car.speed, car.desiredSpeed || 1, 1);
    // Tiempo de cada segmento futuro usando su propio límite de velocidad
    for (let i = car.routeStep + 1; i < car.laneSeq.length; i++) {
      const step = car.laneSeq[i];
      const seg  = state.segments.get(step.segId);
      if (!seg) continue;
      const p = buildLanePath(seg, state.nodes, step.dir, step.laneIdx);
      if (!p) continue;
      remainM += p.length;
      timeSec += p.length / Math.max(seg.speedLimit * car.speedFactor, 1);
    }

    const distTxt = remainM >= 1000
      ? `${(remainM / 1000).toFixed(1)} km`
      : `${Math.round(remainM)} m`;
    const displaySec = timeSec / state.simSpeed;
    const timeTxt = displaySec >= 3600
      ? `${Math.floor(displaySec / 3600)}h ${Math.floor((displaySec % 3600) / 60)}min`
      : displaySec >= 60
        ? `${Math.floor(displaySec / 60)}min`
        : `${Math.round(displaySec)}s`;

    const carScreenPos = maplibreMap
      ? worldToScreen(pointAtPath(car.path, car.s).x, pointAtPath(car.path, car.s).y)
      : pointAtPath(car.path, car.s);

    const displaySpeed = Math.round(car.speed * 3.6 * state.simSpeed);
    const label = new PIXI.Text({
      text: `${displaySpeed} km/h  ·  ${distTxt}  ·  ${timeTxt}`,
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

export function drawCars() {
  selectionGraphics.clear();

  const { positions, ids, colors, graces, carCount } = _renderFrame;
  if (!positions || carCount === 0) {
    for (const [, sprite] of _carParticles) particleContainer.removeChild(sprite);
    _carParticles.clear();
    _carRenderH.clear();
    return;
  }

  const scaleX = maplibreMap ? Math.max(1.5, CAR_BODY_HALF_LENGTH * mapScale) / CAR_BODY_HALF_LENGTH : 1;
  const scaleY = maplibreMap ? Math.max(1.0, CAR_BODY_HALF_WIDTH  * mapScale) / CAR_BODY_HALF_WIDTH  : 1;
  const selR   = maplibreMap ? Math.max(4, CAR_SELECTION_RADIUS * mapScale) : CAR_SELECTION_RADIUS;

  // Eliminar sprites de coches que ya no existen
  const currentIds = new Set();
  for (let i = 0; i < carCount; i++) currentIds.add(ids[i]);
  for (const [id, sprite] of _carParticles) {
    if (!currentIds.has(id)) {
      particleContainer.removeChild(sprite);
      _particlePool.push(sprite);
      _carParticles.delete(id);
      _carRenderH.delete(id);
    }
  }

  for (let i = 0; i < carCount; i++) {
    const id     = ids[i];
    const p      = worldToScreen(positions[i * 4],     positions[i * 4 + 1]);
    const aheadP = worldToScreen(positions[i * 4 + 2], positions[i * 4 + 3]);
    const dx = aheadP.x - p.x, dy = aheadP.y - p.y;
    // Ángulo en screen-space: compensa anisotropía kxx≠kyy del transform afín
    const rawH = (dx * dx + dy * dy > 0.01) ? Math.atan2(dy, dx)
      : (_carRenderH.get(id) ?? 0);

    // Suavizar ángulo de rotación en el hilo de render
    let h = _carRenderH.get(id);
    if (h === undefined) h = rawH;
    let diff = rawH - h;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    _carRenderH.set(id, h + diff * 0.25);

    let sprite = _carParticles.get(id);
    if (!sprite) {
      sprite = _particlePool.pop() ?? new PIXI.Sprite(carTexture);
      sprite.anchor.set(0.5);
      particleContainer.addChild(sprite);
      _carParticles.set(id, sprite);
    }

    sprite.x        = p.x;
    sprite.y        = p.y;
    sprite.rotation = h + diff * 0.25;
    sprite.scale.set(scaleX, scaleY);
    sprite.tint     = colors[i];
    sprite.alpha    = 1.0;

    if (id === state.selectedCarId) {
      selectionGraphics.circle(p.x, p.y, selR);
      selectionGraphics.stroke({ width: CAR_SELECTION_STROKE, color: SPEED_LABEL_BG_COLOR, alpha: CAR_SELECTION_ALPHA });
    }
  }
}

export function updatePropertiesPanel() {}

export function updateStatus() {
  updateSpawnButtonLabel();
  const statusEl = document.getElementById("status");
  const { carCount, pendingSpawns } = _renderFrame;
  statusEl.textContent = `Coches: ${carCount + pendingSpawns} · Segmentos: ${state.segments.size}`;
}

export function updateSpawnButtonLabel() {
  const btn = document.getElementById("spawnCarBtn");
  if (btn) btn.textContent = `Spawn coche (${_renderFrame.carCount}) [+${_renderFrame.pendingSpawns + state.pendingSpawns}]`;
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

  const speedBtns = [
    { id: "speed1Btn", speed: 1 },
    { id: "speed2Btn", speed: 2 },
    { id: "speed3Btn", speed: 3 },
  ];
  for (const { id, speed } of speedBtns) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.addEventListener("click", () => {
      state.simSpeed = speed;
      speedBtns.forEach(b => document.getElementById(b.id)?.classList.toggle("active", b.speed === speed));
    });
  }

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
    state.pendingSpawns = 0;
    document.dispatchEvent(new CustomEvent("sim:clearCars"));
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
