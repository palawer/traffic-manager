import { state } from "./state.js";
import {
  SPAWN_CLEARANCE, SPAWN_MAX_ATTEMPTS, SPAWN_GRACE_TIME,
  SPEED_FACTOR_MIN, SPEED_FACTOR_RANGE,
  CAR_ACCEL, CAR_BRAKE,
  CAR_STOP_DIST, CAR_SLOW_DIST, CAR_SLOW_FACTOR,
  REROUTE_RETRY_INTERVAL, REROUTE_MAX_RETRIES,
} from "./config.js";
import { pointAtPath, hslToHex } from "./geometry.js";
import { getNodeSegments, getDestinationNode } from "./network.js";
import { findRoute, routeToLaneSequence } from "./router.js";
import { buildLanePath } from "./traversal.js";

/**
 * Spawn a car at a random segment endpoint with an A* route to another random node.
 */
export function spawnCar() {
  const nodeIds = [...state.nodes.keys()];
  if (nodeIds.length < 2) return false;

  // Pick a random starting node that has outgoing segments
  const shuffled = nodeIds.sort(() => Math.random() - 0.5);
  let fromNodeId = null;

  let foundRoute = null;
  for (const nid of shuffled) {
    const segs = getNodeSegments(nid);
    if (segs.length === 0) continue;
    // Pick a random destination
    const candidates = nodeIds.filter(id => id !== nid);
    if (candidates.length === 0) continue;
    const dest = candidates[Math.floor(Math.random() * candidates.length)];
    const route = findRoute(nid, dest);
    if (route && route.length >= 2) {
      fromNodeId = nid;
      foundRoute = route;
      break;
    }
  }

  if (fromNodeId === null) return false;

  const route = foundRoute;
  if (!route || route.length < 2) return false;

  const laneSeq = routeToLaneSequence(route);
  if (laneSeq.length === 0) return false;

  const firstStep = laneSeq[0];
  const seg = state.segments.get(firstStep.segId);
  if (!seg) return false;

  const lanePath = buildLanePath(seg, state.nodes, firstStep.dir, firstStep.laneIdx);
  if (!lanePath || lanePath.length < 1) return false;

  // Check spawn point is clear
  const head = pointAtPath(lanePath, 0);
  for (const other of state.cars) {
    const op = pointAtPath(other.path, other.s);
    if (Math.hypot(op.x - head.x, op.y - head.y) < SPAWN_CLEARANCE) return false;
  }

  const car = {
    id: Math.random().toString(36).slice(2, 9),
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
    // motion
    speedFactor: SPEED_FACTOR_MIN + Math.random() * SPEED_FACTOR_RANGE,
    speed: 0,
    desiredSpeed: seg.speedLimit * (SPEED_FACTOR_MIN + Math.random() * SPEED_FACTOR_RANGE),
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

export function updateCars(dt) {
  for (const car of state.cars) {
    car.spawnGrace = Math.max(0, (car.spawnGrace || 0) - dt);
    updateCarOnSegment(car, dt);
  }

  state.cars = state.cars.filter(c => !c.remove);

  // Spawn pending cars
  if (state.pendingSpawns > 0) {
    const maxAttempts = SPAWN_MAX_ATTEMPTS;
    for (let i = 0; i < maxAttempts && state.pendingSpawns > 0; i++) {
      if (spawnCar()) state.pendingSpawns--;
    }
    // If no nodes/segments exist, or no valid route can be generated at all,
    // clear queue to avoid retrying forever every frame.
    if (state.nodes.size < 2 || state.segments.size === 0 || !hasAnySpawnRoute()) {
      state.pendingSpawns = 0;
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

function updateCarOnSegment(car, dt) {
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

  // Car-following: detect cars ahead on same segment/lane
  let obstacleDist = Infinity;
  for (const other of state.cars) {
    if (other === car) continue;
    if (other.segId !== car.segId || other.dir !== car.dir || other.laneIdx !== car.laneIdx) continue;
    if (other.s <= car.s) continue; // only cars ahead
    const dist = other.s - car.s;
    if (dist < obstacleDist) obstacleDist = dist;
  }

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

  // Hard-clamp: never get within CAR_STOP_DIST of any car ahead in the same lane
  let advance = car.speed * dt;
  for (const other of state.cars) {
    if (other === car) continue;
    if (other.segId !== car.segId || other.dir !== car.dir || other.laneIdx !== car.laneIdx) continue;
    if (other.s <= car.s) continue;
    advance = Math.min(advance, Math.max(0, other.s - car.s - CAR_STOP_DIST));
  }
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
  const nodeIds = [...state.nodes.keys()];
  const candidates = nodeIds.filter(id => id !== fromNodeId);
  if (candidates.length === 0) return false;

  // Try random destinations until a valid route is found
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  for (const toNodeId of shuffled) {
    const route = findRoute(fromNodeId, toNodeId);
    if (!route || route.length < 2) continue;
    const laneSeq = routeToLaneSequence(route);
    if (laneSeq.length === 0) continue;
    // Prevent immediate U-turn at multi-way intersections
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
