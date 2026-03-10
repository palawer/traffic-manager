import { state } from "./state.js";
import {
  SPAWN_MAX_ATTEMPTS, SPAWN_GRACE_TIME,
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

/** Inicializar caches estáticos. Llamar una vez tras cargar la red OSM. */
export function initSimulationCaches() {
  initLanePathCache(state.segments, state.nodes);
  initRouterCache();
  _spawnableNodes = [...state.nodes.keys()].filter(id => getNodeSegments(id).length > 0);
}

/**
 * Spawn a car at a random segment endpoint with an A* route to another random node.
 */
// Spawn a car: pick a random node from the list, try a random destination.
// Returns false if this attempt fails — caller retries with another random pick.
export function spawnCar() {
  const nodes = _spawnableNodes;
  if (!nodes || nodes.length < 2) return false;

  const nid  = nodes[Math.floor(Math.random() * nodes.length)];
  const dest = nodes[Math.floor(Math.random() * nodes.length)];
  if (dest === nid) return false;

  const cached = cachedRoute(nid, dest);
  if (!cached) return false;

  const { route, laneSeq } = cached;

  const firstStep = laneSeq[0];
  const seg = state.segments.get(firstStep.segId);
  if (!seg) return false;

  const lanePath = buildLanePath(seg, state.nodes, firstStep.dir, firstStep.laneIdx);
  if (!lanePath || lanePath.length < 1) return false;

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
    while (state.pendingSpawns > 0 && attempts++ < maxAttempts) {
      if (spawnCar()) state.pendingSpawns--;
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
    if (!rerouteSeg) { car.remove = true; return; }
    const rerouteDestId = getDestinationNode(rerouteSeg, car.dir);
    if (!rerouteFrom(car, rerouteDestId)) {
      car.reroutePendingRetries++;
      if (car.reroutePendingRetries >= REROUTE_MAX_RETRIES) { car.remove = true; return; }
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

  // Hard-clamp: never get within CAR_STOP_DIST of the car ahead
  let advance = car.speed * dt;
  if (ahead) advance = Math.min(advance, Math.max(0, ahead.s - car.s - CAR_STOP_DIST));
  car.s += advance;

  if (car.s >= car.path.length) {
    if (!nextStep) {
      if (!seg) { car.remove = true; return; }
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
    car.remove = true;
    return;
  }
  const step = car.laneSeq[car.routeStep];
  const seg = state.segments.get(step.segId);
  if (!seg) { car.remove = true; return; }
  const lanePath = buildLanePath(seg, state.nodes, step.dir, step.laneIdx);
  if (!lanePath || lanePath.length < 1) { car.remove = true; return; }
  car.segId = step.segId;
  car.dir = step.dir;
  car.laneIdx = step.laneIdx;
  car.path = lanePath;
  car.s = 0;
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
    const toNodeId = nodes[Math.floor(Math.random() * nodes.length)];
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
