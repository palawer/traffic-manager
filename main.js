const worldEl = document.getElementById("world");
const playBtn = document.getElementById("playBtn");
const clearCarsBtn = document.getElementById("clearCarsBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const statusEl = document.getElementById("status");
const paletteEl = document.getElementById("palette");

const ROAD_WIDTH = 44;
const LANE_WIDTH = ROAD_WIDTH / 2;
const LANE_OFFSET = LANE_WIDTH * 0.25;
const CONNECT_SNAP_DIST = 24;
const CONNECT_ANGLE_TOL = 0.55;
const GRID = 20;

const COLORS = {
  bg: 0xd9e5db,
  gridMinor: 0xccdbcc,
  gridMajor: 0xc1d1c0,
  road: 0x2d3138,
  divider: 0x8a8f96,
  selected: 0xf0b429,
  connectorOpen: 0xd96a6a,
  connectorLinked: 0x2ea866,
  carStroke: 0x172028,
};

const PIECES = {
  straight: {
    id: "straight",
    label: "Recta",
    connectors: [
      { x: -100, y: 0, dir: Math.PI },
      { x: 100, y: 0, dir: 0 },
    ],
    pickRadius: 120,
  },
  curve: {
    id: "curve",
    label: "Curva",
    radius: 100,
    center: { x: -100, y: -100 },
    connectors: [
      { x: -100, y: 0, dir: Math.PI },
      { x: 0, y: -100, dir: -Math.PI / 2 },
    ],
    pickRadius: 130,
  },
  roundabout_s: makeRoundaboutType("roundabout_s", 52, "Rotonda S"),
  roundabout_m: makeRoundaboutType("roundabout_m", 72, "Rotonda M"),
  roundabout_l: makeRoundaboutType("roundabout_l", 96, "Rotonda L"),
};

function makeRoundaboutType(id, radius, label) {
  const arm = radius + 84;
  return {
    id,
    label,
    isRoundabout: true,
    radius,
    arm,
    connectors: [
      { x: arm, y: 0, dir: 0 },
      { x: 0, y: arm, dir: Math.PI / 2 },
      { x: -arm, y: 0, dir: Math.PI },
      { x: 0, y: -arm, dir: -Math.PI / 2 },
    ],
    pickRadius: arm + 24,
  };
}

const state = {
  view: { x: 0, y: 0, zoom: 1 },
  pieces: [],
  selectedId: null,
  tool: "select",
  placingType: null,
  placeRotation: 0,
  running: false,
  nextPieceId: 1,
  draggingPieceId: null,
  dragOffset: { x: 0, y: 0 },
  panning: false,
  lastMouse: { x: 0, y: 0 },
  keys: { space: false },
  networkDirty: true,
  connectors: [],
  connections: new Map(),
  openConnectors: [],
  cars: [],
  spawnTimer: 0,
};

const app = new PIXI.Application();
let canvas = null;
let camera = null;
let gridGraphics = null;
let roadsGraphics = null;
let connectorsGraphics = null;
let carsGraphics = null;

init().catch((err) => {
  console.error(err);
  statusEl.textContent = "Error inicializando PixiJS";
});

async function init() {
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
  connectorsGraphics = new PIXI.Graphics();
  carsGraphics = new PIXI.Graphics();

  camera.addChild(gridGraphics);
  camera.addChild(roadsGraphics);
  camera.addChild(connectorsGraphics);
  camera.addChild(carsGraphics);
  app.stage.addChild(camera);

  setupUi();
  setupInput();
  setPaletteSelection(null);

  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    frame(dt);
  });
}

function setupUi() {
  paletteEl.addEventListener("click", (e) => {
    if (!(e.target instanceof HTMLButtonElement)) return;
    if (e.target.dataset.tool === "select") {
      setPaletteSelection(null);
      return;
    }
    setPaletteSelection(e.target.dataset.piece || null);
  });

  playBtn.addEventListener("click", () => {
    state.running = !state.running;
    playBtn.textContent = state.running ? "Pause" : "Play";
    if (!state.running) statusEl.textContent = "Herramienta: Seleccionar";
  });

  clearCarsBtn.addEventListener("click", () => {
    state.cars = [];
    state.spawnTimer = 0;
  });

  clearAllBtn.addEventListener("click", () => {
    state.pieces = [];
    state.selectedId = null;
    state.cars = [];
    state.spawnTimer = 0;
    markNetworkDirty();
  });
}

function setupInput() {
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("pointerdown", (e) => {
    const world = screenToWorld(e.offsetX, e.offsetY);
    state.lastMouse = { x: e.offsetX, y: e.offsetY };

    if (state.keys.space || e.button === 1) {
      state.panning = true;
      canvas.style.cursor = "grabbing";
      return;
    }

    if (state.tool === "select") {
      const hit = hitPiece(world.x, world.y);
      if (hit) {
        state.selectedId = hit.id;
        state.draggingPieceId = hit.id;
        state.dragOffset.x = world.x - hit.x;
        state.dragOffset.y = world.y - hit.y;
        return;
      }
      state.selectedId = null;
      return;
    }

    if (state.placingType) {
      addPiece(state.placingType, world.x, world.y);
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    const dx = e.offsetX - state.lastMouse.x;
    const dy = e.offsetY - state.lastMouse.y;
    state.lastMouse = { x: e.offsetX, y: e.offsetY };

    if (state.panning) {
      state.view.x -= dx / state.view.zoom;
      state.view.y -= dy / state.view.zoom;
      return;
    }

    if (state.draggingPieceId) {
      const piece = pieceById(state.draggingPieceId);
      if (!piece) return;
      const world = screenToWorld(e.offsetX, e.offsetY);
      piece.x = snap(world.x - state.dragOffset.x);
      piece.y = snap(world.y - state.dragOffset.y);
      snapPiece(piece);
      markNetworkDirty();
    }
  });

  const releasePointer = () => {
    state.panning = false;
    state.draggingPieceId = null;
    canvas.style.cursor = state.placingType ? "crosshair" : "default";
  };

  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointerleave", releasePointer);

  canvas.addEventListener(
    "wheel",
    (e) => {
      const mouseWorldBefore = screenToWorld(e.offsetX, e.offsetY);
      const factor = Math.exp(-e.deltaY * 0.0012);
      state.view.zoom = Math.max(0.3, Math.min(2.5, state.view.zoom * factor));
      const mouseWorldAfter = screenToWorld(e.offsetX, e.offsetY);
      state.view.x += mouseWorldBefore.x - mouseWorldAfter.x;
      state.view.y += mouseWorldBefore.y - mouseWorldAfter.y;
      e.preventDefault();
    },
    { passive: false }
  );

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      state.keys.space = true;
      canvas.style.cursor = "grab";
    }
    if (e.key.toLowerCase() === "r") {
      if (state.tool === "place" && state.placingType) {
        state.placeRotation += Math.PI / 2;
        return;
      }
      const piece = pieceById(state.selectedId);
      if (!piece) return;
      piece.rot += Math.PI / 2;
      snapPiece(piece);
      markNetworkDirty();
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      removeSelectedPiece();
    }
    if (e.key === "Escape") {
      setPaletteSelection(null);
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      state.keys.space = false;
      canvas.style.cursor = state.placingType ? "crosshair" : "default";
    }
  });
}

function setPaletteSelection(type) {
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

function rendererSize() {
  return { width: app.renderer.width, height: app.renderer.height };
}

function worldToScreen(x, y) {
  const { width, height } = rendererSize();
  return {
    x: (x - state.view.x) * state.view.zoom + width / 2,
    y: (y - state.view.y) * state.view.zoom + height / 2,
  };
}

function screenToWorld(x, y) {
  const { width, height } = rendererSize();
  return {
    x: (x - width / 2) / state.view.zoom + state.view.x,
    y: (y - height / 2) / state.view.zoom + state.view.y,
  };
}

function snap(v, step = GRID) {
  return Math.round(v / step) * step;
}

function rotatePoint(x, y, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c - y * s, y: x * s + y * c };
}

function normalizeAngle(a) {
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  const m = l - c / 2;
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return (r << 16) | (g << 8) | b;
}

function pieceById(id) {
  return state.pieces.find((p) => p.id === id) || null;
}

function getWorldConnectors(piece) {
  const def = PIECES[piece.type];
  return def.connectors.map((c, index) => {
    const rp = rotatePoint(c.x, c.y, piece.rot);
    return {
      key: `${piece.id}:${index}`,
      pieceId: piece.id,
      connectorIndex: index,
      x: piece.x + rp.x,
      y: piece.y + rp.y,
      dir: normalizeAngle(c.dir + piece.rot),
    };
  });
}

function rebuildNetwork() {
  const connectors = [];
  for (const piece of state.pieces) connectors.push(...getWorldConnectors(piece));

  const candidates = [];
  for (let i = 0; i < connectors.length; i++) {
    for (let j = i + 1; j < connectors.length; j++) {
      const a = connectors[i];
      const b = connectors[j];
      if (a.pieceId === b.pieceId) continue;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > CONNECT_SNAP_DIST) continue;
      const facing = Math.abs(normalizeAngle(a.dir - b.dir + Math.PI));
      if (facing > CONNECT_ANGLE_TOL) continue;
      candidates.push({ a, b, dist });
    }
  }

  candidates.sort((c1, c2) => c1.dist - c2.dist);

  const used = new Set();
  const connections = new Map();
  for (const c of candidates) {
    if (used.has(c.a.key) || used.has(c.b.key)) continue;
    used.add(c.a.key);
    used.add(c.b.key);
    connections.set(c.a.key, c.b.key);
    connections.set(c.b.key, c.a.key);
  }

  state.connectors = connectors;
  state.connections = connections;
  state.openConnectors = connectors.filter((c) => !connections.has(c.key));
  state.networkDirty = false;
}

function markNetworkDirty() {
  state.networkDirty = true;
  if (state.running) {
    state.cars = [];
    state.spawnTimer = 0;
  }
}

function addPiece(type, x, y) {
  const piece = {
    id: state.nextPieceId++,
    type,
    x: snap(x),
    y: snap(y),
    rot: state.placeRotation,
  };
  state.pieces.push(piece);
  state.selectedId = piece.id;
  snapPiece(piece);
  markNetworkDirty();
}

function snapPiece(piece) {
  if (state.networkDirty) rebuildNetwork();
  const own = getWorldConnectors(piece);
  const others = [];
  for (const p of state.pieces) {
    if (p.id === piece.id) continue;
    others.push(...getWorldConnectors(p));
  }

  let best = null;
  for (const a of own) {
    for (const b of others) {
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > CONNECT_SNAP_DIST) continue;
      const facing = Math.abs(normalizeAngle(a.dir - b.dir + Math.PI));
      if (facing > CONNECT_ANGLE_TOL) continue;
      if (!best || dist < best.dist) best = { a, b, dist };
    }
  }

  if (best) {
    piece.x += best.b.x - best.a.x;
    piece.y += best.b.y - best.a.y;
  }

  piece.x = snap(piece.x);
  piece.y = snap(piece.y);
}

function removeSelectedPiece() {
  if (!state.selectedId) return;
  const id = state.selectedId;
  state.pieces = state.pieces.filter((p) => p.id !== id);
  state.selectedId = null;
  markNetworkDirty();
}

function hitPiece(worldX, worldY) {
  let winner = null;
  let best = Infinity;
  for (const piece of state.pieces) {
    const def = PIECES[piece.type];
    const d = Math.hypot(worldX - piece.x, worldY - piece.y);
    if (d < def.pickRadius && d < best) {
      best = d;
      winner = piece;
    }
  }
  return winner;
}

function transformLocalPoint(piece, pt) {
  const p = rotatePoint(pt.x, pt.y, piece.rot);
  return { x: piece.x + p.x, y: piece.y + p.y };
}

function polylineMetrics(points) {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    cumulative.push(cumulative[cumulative.length - 1] + seg);
  }
  return { points, cumulative, length: cumulative[cumulative.length - 1] || 0 };
}

function pointAtPath(path, s) {
  if (path.points.length === 0) return { x: 0, y: 0 };
  if (s <= 0) return path.points[0];
  if (s >= path.length) return path.points[path.points.length - 1];

  let i = 1;
  while (i < path.cumulative.length && path.cumulative[i] < s) i++;
  const p0 = path.points[i - 1];
  const p1 = path.points[i];
  const s0 = path.cumulative[i - 1];
  const s1 = path.cumulative[i];
  const t = (s - s0) / (s1 - s0 || 1);
  return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
}

function headingAtPath(path, s) {
  const a = pointAtPath(path, Math.max(0, s - 2));
  const b = pointAtPath(path, Math.min(path.length, s + 2));
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function getRoundaboutLaneRadii(def) {
  const outer = def.radius + 12;
  const inner = outer - LANE_WIDTH;
  const divider = (inner + outer) * 0.5;
  const outerEdge = outer + LANE_WIDTH * 0.5;
  return { inner, outer, divider, outerEdge };
}

function buildArc(radius, startAngle, endAngle, direction = -1) {
  const pts = [{ x: Math.cos(startAngle) * radius, y: Math.sin(startAngle) * radius }];
  let a = startAngle;
  let guard = 0;
  if (direction < 0) {
    while (normalizeAngle(a - endAngle) > 0.04 && guard < 120) {
      a -= 0.12;
      pts.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
      guard++;
    }
  } else {
    while (normalizeAngle(endAngle - a) > 0.04 && guard < 120) {
      a += 0.12;
      pts.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
      guard++;
    }
  }
  pts.push({ x: Math.cos(endAngle) * radius, y: Math.sin(endAngle) * radius });
  return pts;
}

function buildTraversal(piece, fromConnectorIdx) {
  const def = PIECES[piece.type];
  if (!def.isRoundabout) {
    const toConnectorIdx = fromConnectorIdx === 0 ? 1 : 0;
    const p0 = transformLocalPoint(piece, def.connectors[fromConnectorIdx]);
    const p1 = transformLocalPoint(piece, def.connectors[toConnectorIdx]);

    if (piece.type === "straight") {
      const vx = p1.x - p0.x;
      const vy = p1.y - p0.y;
      const len = Math.hypot(vx, vy) || 1;
      const nx = vy / len;
      const ny = -vx / len;
      return {
        path: polylineMetrics([
          { x: p0.x + nx * LANE_OFFSET, y: p0.y + ny * LANE_OFFSET },
          { x: p1.x + nx * LANE_OFFSET, y: p1.y + ny * LANE_OFFSET },
        ]),
        toConnectorIdx,
      };
    }

    const centerW = transformLocalPoint(piece, def.center);
    const a0 = Math.atan2(p0.y - centerW.y, p0.x - centerW.x);
    const a1 = Math.atan2(p1.y - centerW.y, p1.x - centerW.x);
    const clockwise = normalizeAngle(a1 - a0) < 0;
    const laneRadius = def.radius + (clockwise ? LANE_OFFSET : -LANE_OFFSET);
    const pts = buildArc(laneRadius, a0, a1, clockwise ? -1 : 1).map((p) => ({
      x: centerW.x + p.x,
      y: centerW.y + p.y,
    }));
    return { path: polylineMetrics(pts), toConnectorIdx };
  }

  const exits = [0, 1, 2, 3].filter((i) => i !== fromConnectorIdx);
  const toConnectorIdx = exits[Math.floor(Math.random() * exits.length)];
  const inConn = def.connectors[fromConnectorIdx];
  const outConn = def.connectors[toConnectorIdx];
  const radii = getRoundaboutLaneRadii(def);

  const aIn = Math.atan2(inConn.y, inConn.x);
  const aOut = Math.atan2(outConn.y, outConn.x);
  const stepsClockwise = (fromConnectorIdx - toConnectorIdx + 4) % 4;
  const laneChoice = stepsClockwise <= 1 ? "outer" : Math.random() < 0.6 ? "inner" : "outer";
  const laneR = laneChoice === "inner" ? radii.inner : radii.outer;

  const localPoints = [{ x: inConn.x, y: inConn.y }, { x: Math.cos(aIn) * laneR, y: Math.sin(aIn) * laneR }];

  if (laneChoice === "inner" && stepsClockwise > 1) {
    const mergeAngle = aOut + 0.55;
    localPoints.push(...buildArc(radii.inner, aIn, mergeAngle, -1));
    localPoints.push({ x: Math.cos(mergeAngle) * radii.outer, y: Math.sin(mergeAngle) * radii.outer });
    localPoints.push(...buildArc(radii.outer, mergeAngle, aOut, -1));
  } else {
    localPoints.push(...buildArc(laneR, aIn, aOut, -1));
  }

  localPoints.push({ x: Math.cos(aOut) * radii.outer, y: Math.sin(aOut) * radii.outer });
  localPoints.push({ x: outConn.x, y: outConn.y });

  const worldPoints = localPoints.map((p) => transformLocalPoint(piece, p));
  return { path: polylineMetrics(worldPoints), toConnectorIdx, laneChoice };
}

function parseConnectorKey(key) {
  const [pieceId, connectorIndex] = key.split(":");
  return { pieceId: Number(pieceId), connectorIndex: Number(connectorIndex) };
}

function isRoundaboutEntryBlocked(roundPiece, entryIdx) {
  const def = PIECES[roundPiece.type];
  const radii = getRoundaboutLaneRadii(def);
  const entryConn = def.connectors[entryIdx];
  const entryAngle = normalizeAngle(Math.atan2(entryConn.y, entryConn.x) + roundPiece.rot);

  const mergeOuter = {
    x: roundPiece.x + Math.cos(entryAngle) * radii.outer,
    y: roundPiece.y + Math.sin(entryAngle) * radii.outer,
  };
  const mergeInner = {
    x: roundPiece.x + Math.cos(entryAngle) * radii.inner,
    y: roundPiece.y + Math.sin(entryAngle) * radii.inner,
  };

  for (const car of state.cars) {
    if (car.pieceId !== roundPiece.id) continue;
    const p = pointAtPath(car.path, car.s);
    if (Math.hypot(p.x - mergeOuter.x, p.y - mergeOuter.y) < 38) return true;
    if (Math.hypot(p.x - mergeInner.x, p.y - mergeInner.y) < 34) return true;
  }
  return false;
}

function assignTraversal(car, nextPieceId, fromConnectorIdx) {
  const piece = pieceById(nextPieceId);
  if (!piece) return false;

  const traversal = buildTraversal(piece, fromConnectorIdx);
  if (!traversal || traversal.path.length < 1) return false;

  car.pieceId = piece.id;
  car.fromConnectorIdx = fromConnectorIdx;
  car.toConnectorIdx = traversal.toConnectorIdx;
  car.path = traversal.path;
  car.laneChoice = traversal.laneChoice || "right";
  car.s = 0;
  car.waiting = false;
  return true;
}

function spawnCar() {
  if (state.networkDirty) rebuildNetwork();
  if (state.openConnectors.length === 0) return;

  const candidates = state.openConnectors.filter((c) => {
    const piece = pieceById(c.pieceId);
    return piece && !PIECES[piece.type].isRoundabout;
  });
  if (candidates.length === 0) return;

  const entry = candidates[Math.floor(Math.random() * candidates.length)];
  const car = {
    id: Math.random().toString(36).slice(2, 9),
    pieceId: entry.pieceId,
    fromConnectorIdx: entry.connectorIndex,
    toConnectorIdx: 0,
    path: polylineMetrics([]),
    s: 0,
    speed: 0,
    desiredSpeed: 56 + Math.random() * 18,
    waiting: false,
    color: hslToHex(Math.random() * 360, 0.7, 0.52),
  };

  if (assignTraversal(car, entry.pieceId, entry.connectorIndex)) {
    const head = pointAtPath(car.path, 0);
    const blocked = state.cars.some((c) => {
      const p = pointAtPath(c.path, c.s);
      return Math.hypot(p.x - head.x, p.y - head.y) < 35;
    });
    if (!blocked) state.cars.push(car);
  }
}

function updateCars(dt) {
  if (state.networkDirty) rebuildNetwork();

  state.spawnTimer += dt;
  if (state.spawnTimer > 1.7) {
    state.spawnTimer = 0;
    if (state.cars.length < 45) spawnCar();
  }

  for (const car of state.cars) {
    let obstacleDist = Infinity;
    const myPos = pointAtPath(car.path, car.s);
    const myHeading = headingAtPath(car.path, car.s);

    for (const other of state.cars) {
      if (other === car) continue;
      const op = pointAtPath(other.path, other.s);
      const dist = Math.hypot(op.x - myPos.x, op.y - myPos.y);
      if (dist > 60) continue;
      const toOther = Math.atan2(op.y - myPos.y, op.x - myPos.x);
      const rel = Math.abs(normalizeAngle(toOther - myHeading));
      if (rel < 0.75 && dist < obstacleDist) obstacleDist = dist;
    }

    let target = car.desiredSpeed;
    if (car.waiting) target = 0;
    if (obstacleDist < 24) target = 0;
    else if (obstacleDist < 40) target *= 0.35;

    const accel = target > car.speed ? 60 : 95;
    const delta = target - car.speed;
    const step = Math.sign(delta) * Math.min(Math.abs(delta), accel * dt);
    car.speed += step;

    let advance = car.speed * dt;
    while (advance > 0) {
      const rem = car.path.length - car.s;
      if (advance < rem) {
        car.s += advance;
        advance = 0;
      } else {
        car.s = car.path.length;
        advance -= rem;

        const currentKey = `${car.pieceId}:${car.toConnectorIdx}`;
        const nextKey = state.connections.get(currentKey);
        if (!nextKey) {
          car.remove = true;
          break;
        }

        const next = parseConnectorKey(nextKey);
        const nextPiece = pieceById(next.pieceId);
        if (!nextPiece) {
          car.remove = true;
          break;
        }

        if (PIECES[nextPiece.type].isRoundabout && isRoundaboutEntryBlocked(nextPiece, next.connectorIndex)) {
          car.waiting = true;
          car.s = Math.max(0, car.path.length - 1);
          car.speed = 0;
          break;
        }

        if (!assignTraversal(car, next.pieceId, next.connectorIndex)) {
          car.remove = true;
          break;
        }
      }
    }
  }

  state.cars = state.cars.filter((c) => !c.remove);
}

function applyCameraTransform() {
  const { width, height } = rendererSize();
  camera.scale.set(state.view.zoom, state.view.zoom);
  camera.position.set(width / 2 - state.view.x * state.view.zoom, height / 2 - state.view.y * state.view.zoom);
}

function drawGrid() {
  const min = screenToWorld(0, 0);
  const { width, height } = rendererSize();
  const max = screenToWorld(width, height);
  const major = GRID * 5;

  gridGraphics.clear();
  gridGraphics.alpha = 1;

  for (let x = Math.floor(min.x / GRID) * GRID; x <= max.x; x += GRID) {
    const majorLine = Math.abs(x % major) < 0.0001;
    gridGraphics.lineStyle({ width: 1 / state.view.zoom, color: majorLine ? COLORS.gridMajor : COLORS.gridMinor });
    gridGraphics.moveTo(x, min.y);
    gridGraphics.lineTo(x, max.y);
  }

  for (let y = Math.floor(min.y / GRID) * GRID; y <= max.y; y += GRID) {
    const majorLine = Math.abs(y % major) < 0.0001;
    gridGraphics.lineStyle({ width: 1 / state.view.zoom, color: majorLine ? COLORS.gridMajor : COLORS.gridMinor });
    gridGraphics.moveTo(min.x, y);
    gridGraphics.lineTo(max.x, y);
  }
}

function drawRoadStroke(g) {
  g.stroke({ width: ROAD_WIDTH, color: COLORS.road, cap: "round" });
  g.stroke({ width: 2, color: COLORS.divider, cap: "round" });
}

function drawPiece(g, piece) {
  const def = PIECES[piece.type];

  if (piece.type === "straight") {
    g.moveTo(piece.x - 100 * Math.cos(piece.rot), piece.y - 100 * Math.sin(piece.rot));
    g.lineTo(piece.x + 100 * Math.cos(piece.rot), piece.y + 100 * Math.sin(piece.rot));
    drawRoadStroke(g);
  } else if (piece.type === "curve") {
    const center = transformLocalPoint(piece, def.center);
    const start = Math.PI / 2 + piece.rot;
    const end = piece.rot;
    g.arc(center.x, center.y, def.radius, start, end, true);
    drawRoadStroke(g);
  } else {
    const radii = getRoundaboutLaneRadii(def);

    for (const c of def.connectors) {
      const c0 = transformLocalPoint(piece, c);
      const d = Math.hypot(c.x, c.y) || 1;
      const p0 = transformLocalPoint(piece, {
        x: (c.x / d) * (radii.outerEdge + 2),
        y: (c.y / d) * (radii.outerEdge + 2),
      });
      g.moveTo(p0.x, p0.y);
      g.lineTo(c0.x, c0.y);
      drawRoadStroke(g);
    }

    g.arc(piece.x, piece.y, (radii.inner + radii.outer) * 0.5, 0, Math.PI * 2);
    g.stroke({ width: LANE_WIDTH * 2, color: COLORS.road });

    g.arc(piece.x, piece.y, radii.divider, 0, Math.PI * 2);
    g.stroke({ width: 2, color: COLORS.divider });
  }

  if (state.selectedId === piece.id) {
    g.circle(piece.x, piece.y, def.pickRadius - 8);
    g.stroke({ width: 3 / state.view.zoom, color: COLORS.selected });
  }
}

function drawRoadsAndConnectors() {
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

function drawCars() {
  carsGraphics.clear();

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
  }
}

function updateStatus() {
  if (state.running) {
    statusEl.textContent = `Simulando: ${state.cars.length} coches`;
    return;
  }

  if (state.tool === "select") {
    statusEl.textContent = "Herramienta: Seleccionar";
    return;
  }

  const deg = ((Math.round((state.placeRotation * 180) / Math.PI) % 360) + 360) % 360;
  statusEl.textContent = `Colocando: ${PIECES[state.placingType].label} (${deg}º)`;
}

function frame(dt) {
  if (state.running) updateCars(dt);
  updateStatus();

  applyCameraTransform();
  drawGrid();
  drawRoadsAndConnectors();
  drawCars();
}
