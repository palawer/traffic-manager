import { state } from "./state.js";
import {
  SPAWN_MAX_ATTEMPTS, SPAWN_PER_FRAME, SPAWN_GRACE_TIME,
  SPEED_FACTOR_MIN, SPEED_FACTOR_RANGE,
  CAR_ACCEL, CAR_BRAKE,
  CAR_STOP_DIST, CAR_SLOW_DIST, CAR_SLOW_FACTOR,
  REROUTE_RETRY_INTERVAL, REROUTE_MAX_RETRIES,
} from "./config.js";
import { hslToHex } from "./geometry.js";
import { getNodeSegments, getDestinationNode } from "./network.js";
import { cachedRoute, initRouterCache } from "./router.js";
import { buildLanePath, initLanePathCache } from "./traversal.js";

let _spawnableNodes = null;
let _nodeWeightsCumulative = null; // cumulative weights for weighted random pick

/** Inicializar caches estáticos. Llamar una vez tras cargar la red OSM. */
export function initSimulationCaches() {
  initLanePathCache(state.segments, state.nodes);
  initRouterCache();
  _spawnableNodes = [...state.nodes.keys()].filter(id => getNodeSegments(id).length > 0);
  // Pesos proporcionales al grado del nodo (nº de segmentos conectados).
  // Los nodos en intersecciones principales tienen más probabilidad de ser destino,
  // concentrando el tráfico en arterias en lugar de callejones residenciales.
  let cumulative = 0;
  _nodeWeightsCumulative = _spawnableNodes.map(id => {
    cumulative += getNodeSegments(id).length;
    return cumulative;
  });
}

/** Elige un nodo aleatorio ponderado por grado. O(log n) via búsqueda binaria. */
function weightedRandomNode() {
  const total = _nodeWeightsCumulative[_nodeWeightsCumulative.length - 1];
  const r = Math.random() * total;
  let lo = 0, hi = _nodeWeightsCumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (_nodeWeightsCumulative[mid] < r) lo = mid + 1;
    else hi = mid;
  }
  return _spawnableNodes[lo];
}

/**
 * Spawn a car at a random segment endpoint with an A* route to another random node.
 */
// Spawn a car: pick a random node from the list, try a random destination.
// Returns false if this attempt fails — caller retries with another random pick.
export function spawnCar(laneIndex) {
  const nodes = _spawnableNodes;
  if (!nodes || nodes.length < 2) return false;

  const nid  = weightedRandomNode();
  const dest = weightedRandomNode();
  if (dest === nid) return false;

  const cached = cachedRoute(nid, dest);
  if (!cached) return false;

  const { route, laneSeq } = cached;

  const firstStep = laneSeq[0];
  const seg = state.segments.get(firstStep.segId);
  if (!seg) return false;

  const lanePath = buildLanePath(seg, state.nodes, firstStep.dir, firstStep.laneIdx);
  if (!lanePath || lanePath.length < 1) return false;

  // Rechazar si ya hay un coche cerca del inicio del carril
  if (laneIndex) {
    const key = firstStep.segId * 8 + (firstStep.dir === "AtoB" ? 0 : 4) + firstStep.laneIdx;
    const lane = laneIndex.get(key);
    if (lane && lane.length > 0 && lane[0].s < CAR_SLOW_DIST) return false;
  }

  const spawnSpeed = seg.speedLimit * (SPEED_FACTOR_MIN + Math.random() * SPEED_FACTOR_RANGE);

  // No clearance check — spawn grace period handles overlapping at birth

  const car = {
    id: state.nextCarId++,
    color: hslToHex(Math.random() * 360, 0.7, 0.52),
    // route
    route,
    routeStep: 0,
    laneSeq,
    // current position
    segId: firstStep.segId,
    dir: firstStep.dir,
    laneIdx: firstStep.laneIdx,
    s: 0,
    path: lanePath,
    // motion — spawn at full desired speed to avoid slow-start effect
    speedFactor: SPEED_FACTOR_MIN + Math.random() * SPEED_FACTOR_RANGE,
    speed: spawnSpeed,
    desiredSpeed: spawnSpeed,
    spawnGrace: SPAWN_GRACE_TIME,
    waiting: false,
    // debug telemetry
    debugBrakeReason: "none",
    debugObstacleDist: Infinity,
    debugRemToEnd: 0,
    debugTargetSpeed: 0,
    debugReroutes: 0,
    reroutePendingTime: 0,
    reroutePendingRetries: 0,
  };

  state.cars.push(car);
  return true;
}

/** Build a per-lane index: key → cars sorted by s, with _laneNext pointer set. O(n log n). */
function buildLaneIndex(cars) {
  const index = new Map();
  for (const car of cars) {
    // Clave numérica: evita ~120k allocaciones de string por frame
    const key = car.segId * 8 + (car.dir === "AtoB" ? 0 : 4) + car.laneIdx;
    let lane = index.get(key);
    if (!lane) { lane = []; index.set(key, lane); }
    lane.push(car);
  }
  for (const lane of index.values()) {
    lane.sort((a, b) => a.s - b.s);
    for (let i = 0; i < lane.length; i++) lane[i]._laneNext = lane[i + 1] ?? null;
  }
  return index;
}

export function updateCars(dt) {
  const laneIndex = buildLaneIndex(state.cars);
  for (const car of state.cars) {
    car.spawnGrace = Math.max(0, (car.spawnGrace || 0) - dt);
    updateCarOnSegment(car, dt, laneIndex);
  }

  state.cars = state.cars.filter(c => !c.remove);

  // Spawn pending cars — shuffle once, reuse for all attempts this frame
  if (state.pendingSpawns > 0) {
    if (!_spawnableNodes || _spawnableNodes.length < 2) { state.pendingSpawns = 0; return; }
    const maxAttempts = Math.min(state.pendingSpawns * 3, SPAWN_MAX_ATTEMPTS);
    let attempts = 0;
    // Reconstruir índice tras filtrar los coches eliminados
    const spawnIndex = buildLaneIndex(state.cars);
    let spawned = 0;
    while (state.pendingSpawns > 0 && spawned < SPAWN_PER_FRAME && attempts++ < maxAttempts * SPAWN_PER_FRAME) {
      if (spawnCar(spawnIndex)) { state.pendingSpawns--; spawned++; }
    }
  }
}

function hasAnySpawnRoute() {
  const nodeIds = [...state.nodes.keys()];
  if (nodeIds.length < 2) return false;

  for (const fromNodeId of nodeIds) {
    if (getNodeSegments(fromNodeId).length === 0) continue;

    for (const toNodeId of nodeIds) {
      if (toNodeId === fromNodeId) continue;
      const route = findRoute(fromNodeId, toNodeId);
      if (!route || route.length < 2) continue;
      const laneSeq = routeToLaneSequence(route);
      if (laneSeq.length === 0) continue;
      // Also verify the first lane path is geometrically valid
      const firstStep = laneSeq[0];
      const seg = state.segments.get(firstStep.segId);
      if (!seg) continue;
      const lanePath = buildLanePath(seg, state.nodes, firstStep.dir, firstStep.laneIdx);
      if (lanePath && lanePath.length > 0) return true;
    }
  }
  return false;
}

function updateCarOnSegment(car, dt, laneIndex) {
  // Retry reroute for cars stuck with no viable route
  if (car.reroutePendingTime > 0) {
    car.reroutePendingTime = Math.max(0, car.reroutePendingTime - dt);
    if (car.reroutePendingTime > 0) {
      car.debugBrakeReason = "reroute_pending";
      return;
    }
    // Timer expired — try again
    const rerouteSeg = state.segments.get(car.segId);
    if (!rerouteSeg) { respawnCar(car); return; }
    const rerouteDestId = getDestinationNode(rerouteSeg, car.dir);
    if (!rerouteFrom(car, rerouteDestId)) {
      car.reroutePendingRetries++;
      if (car.reroutePendingRetries >= REROUTE_MAX_RETRIES) { respawnCar(car); return; }
      car.reroutePendingTime = REROUTE_RETRY_INTERVAL;
      car.debugBrakeReason = "reroute_pending";
      return;
    }
    // Reroute succeeded — reset and fall through to normal update
    car.reroutePendingRetries = 0;
  }

  const remToEnd = car.path.length - car.s;
  car.debugBrakeReason = "none";
  car.debugRemToEnd = remToEnd;

  // Car-following: O(1) lookup via pre-built lane index
  const ahead = car._laneNext;
  let obstacleDist = ahead ? ahead.s - car.s : Infinity;

  const seg = state.segments.get(car.segId);
  let target = seg ? seg.speedLimit * car.speedFactor : car.desiredSpeed;

  // Determine the desired next step
  let nextStep = (car.laneSeq && car.routeStep + 1 < car.laneSeq.length)
    ? car.laneSeq[car.routeStep + 1] : null;
  // Clamp laneIdx in case the segment's lane count was reduced since the route was planned
  if (nextStep) {
    const nextStepSeg = state.segments.get(nextStep.segId);
    if (nextStepSeg) {
      const maxLane = (nextStep.dir === "AtoB" ? nextStepSeg.lanesAtoB : nextStepSeg.lanesBtoA) - 1;
      if (maxLane < 0) nextStep = null; // segment has 0 lanes — force reroute
      else if (nextStep.laneIdx > maxLane) nextStep.laneIdx = maxLane;
    }
  }

  // Obstáculo cross-segmento: primer coche en el siguiente tramo visto desde este
  // Evita que los coches se atraviesen al incorporarse en intersecciones
  let crossObstacleDist = Infinity;
  if (nextStep) {
    const nextKey = nextStep.segId * 8 + (nextStep.dir === "AtoB" ? 0 : 4) + nextStep.laneIdx;
    const nextLane = laneIndex.get(nextKey);
    if (nextLane && nextLane.length > 0) {
      crossObstacleDist = remToEnd + nextLane[0].s;
      if (crossObstacleDist < obstacleDist) obstacleDist = crossObstacleDist;
    }
  }

  if (obstacleDist < CAR_STOP_DIST) {
    target = 0;
    car.debugBrakeReason = "car_ahead";
  } else if (obstacleDist < CAR_SLOW_DIST) {
    target *= CAR_SLOW_FACTOR;
    if (car.debugBrakeReason === "none") car.debugBrakeReason = "car_ahead";
  }
  car.debugObstacleDist = obstacleDist;
  car.debugTargetSpeed = target;

  applyAcceleration(car, target, dt);

  // Hard-clamp: never get within CAR_STOP_DIST of the car ahead (mismo o siguiente segmento)
  let advance = car.speed * dt;
  if (ahead) advance = Math.min(advance, Math.max(0, ahead.s - car.s - CAR_STOP_DIST));
  if (crossObstacleDist < Infinity)
    advance = Math.min(advance, Math.max(0, crossObstacleDist - CAR_STOP_DIST));
  car.s += advance;

  if (car.s >= car.path.length) {
    if (!nextStep) {
      if (!seg) { respawnCar(car); return; }
      const destNodeId = getDestinationNode(seg, car.dir);
      if (!rerouteFrom(car, destNodeId)) {
        car.s = Math.max(0, car.path.length - 1);
        car.speed = 0;
        car.reroutePendingTime = REROUTE_RETRY_INTERVAL;
        car.debugBrakeReason = "reroute_pending";
        return;
      }
    }
    advanceRouteStep(car);
  }
  car.waiting = car.speed < 0.2 && car.debugTargetSpeed <= 0.01;
}

/**
 * Advance to the next step in laneSeq. Removes the car if no more steps exist.
 */
function advanceRouteStep(car) {
  car.routeStep++;
  if (!car.laneSeq || car.routeStep >= car.laneSeq.length) {
    respawnCar(car);
    return;
  }
  const step = car.laneSeq[car.routeStep];
  const seg = state.segments.get(step.segId);
  if (!seg) { respawnCar(car); return; }
  const lanePath = buildLanePath(seg, state.nodes, step.dir, step.laneIdx);
  if (!lanePath || lanePath.length < 1) { respawnCar(car); return; }
  car.segId = step.segId;
  car.dir = step.dir;
  car.laneIdx = step.laneIdx;
  car.path = lanePath;
  car.s = 0;
}

/**
 * Teleporta el coche a un nuevo origen aleatorio con una ruta nueva.
 * Se usa en lugar de eliminar el coche cuando la ruta falla irrecuperablemente.
 * Mantiene el conteo de coches estable y evita desapariciones visibles.
 */
function respawnCar(car) {
  const nodes = _spawnableNodes;
  if (!nodes || nodes.length < 2) { car.remove = true; return; }

  for (let attempt = 0; attempt < 16; attempt++) {
    const nid  = weightedRandomNode();
    const dest = weightedRandomNode();
    if (dest === nid) continue;

    const cached = cachedRoute(nid, dest);
    if (!cached) continue;

    const { route, laneSeq } = cached;
    const firstStep = laneSeq[0];
    const seg = state.segments.get(firstStep.segId);
    if (!seg) continue;
    const lanePath = buildLanePath(seg, state.nodes, firstStep.dir, firstStep.laneIdx);
    if (!lanePath || lanePath.length < 1) continue;

    const spawnSpeed = seg.speedLimit * (SPEED_FACTOR_MIN + Math.random() * SPEED_FACTOR_RANGE);
    car.route      = route;
    car.laneSeq    = laneSeq;
    car.routeStep  = 0;
    car.segId      = firstStep.segId;
    car.dir        = firstStep.dir;
    car.laneIdx    = firstStep.laneIdx;
    car.path       = lanePath;
    car.s          = 0;
    car.speed      = spawnSpeed;
    car.desiredSpeed = spawnSpeed;
    car.spawnGrace = SPAWN_GRACE_TIME;
    car.reroutePendingTime    = 0;
    car.reroutePendingRetries = 0;
    car.debugBrakeReason = "none";
    return;
  }
  car.remove = true; // red sin rutas válidas — caso extremo
}

/**
 * Assign a new random destination to a car that has reached its current one.
 * Sets car.route, car.laneSeq, car.routeStep = -1 (so routeStep+1 = 0 = first step).
 * Returns false if no reachable destination exists.
 */
function rerouteFrom(car, fromNodeId) {
  const nodes = _spawnableNodes;
  if (!nodes || nodes.length < 2) return false;

  // Try a few random destinations using the route cache
  for (let i = 0; i < 8; i++) {
    const toNodeId = weightedRandomNode();
    if (toNodeId === fromNodeId) continue;
    const cached = cachedRoute(fromNodeId, toNodeId);
    if (!cached) continue;
    const { route, laneSeq } = cached;
    const firstStep = laneSeq[0];
    if (firstStep.segId === car.segId && getNodeSegments(fromNodeId).length > 1) continue;
    car.route = route;
    car.laneSeq = laneSeq;
    car.routeStep = -1;
    car.debugReroutes = (car.debugReroutes || 0) + 1;
    return true;
  }
  return false;
}

function applyAcceleration(car, target, dt) {
  const accel = target > car.speed ? CAR_ACCEL : CAR_BRAKE;
  const delta = target - car.speed;
  const step = Math.sign(delta) * Math.min(Math.abs(delta), accel * dt);
  car.speed = Math.max(0, car.speed + step);
}
