import { state, JOIN_GRACE_TIME } from "./state.js";
import {
  SPAWN_CLEARANCE, SPAWN_MAX_ATTEMPTS,
  SPEED_FACTOR_MIN, SPEED_FACTOR_RANGE,
  CAR_ACCEL, CAR_BRAKE,
  CAR_STOP_DIST, CAR_SLOW_DIST, CAR_SLOW_FACTOR,
  JUNCTION_LOOKAHEAD, JUNCTION_STOP_DIST, JUNCTION_ENTRY_THRESHOLD,
} from "./config.js";
import { pointAtPath, headingAtPath, hslToHex } from "./geometry.js";
import { rebuildJunctions, getNodeSegments, findConnector, getDestinationNode } from "./network.js";
import { findRoute, routeToLaneSequence } from "./router.js";
import { buildLanePath } from "./traversal.js";

/**
 * Check if a junction connector's signal is green.
 * For now (Phase 1) all signals are green.
 */
export function isConnectorGreen(connector) {
  if (!connector) return true;
  const signal = state.signals.get(connector.nodeId);
  if (!signal) return true;
  const armKey = `${connector.inSegId}:${connector.inDir}`;
  // If this arm isn't explicitly assigned to any phase (e.g. old saved data
  // with integer IDs, or a new segment added to an existing junction),
  // treat it as unmanaged → always green.
  const isManaged = signal.phases.some(p => p.greenConnectors.has(armKey));
  if (!isManaged) return true;
  const phase = signal.phases[signal.currentPhase];
  return phase?.greenConnectors.has(armKey) ?? true;
}

/**
 * Update signal timers.
 */
export function updateSignals(dt) {
  state.signalTime += dt;
  for (const signal of state.signals.values()) {
    signal.phaseTimer -= dt;
    if (signal.phaseTimer <= 0) {
      signal.currentPhase = (signal.currentPhase + 1) % signal.phases.length;
      signal.phaseTimer = signal.phases[signal.currentPhase].duration;
    }
  }
}

/**
 * Spawn a car at a random segment endpoint with an A* route to another random node.
 */
export function spawnCar() {
  if (state.networkDirty) rebuildJunctions();

  const nodeIds = [...state.nodes.keys()];
  if (nodeIds.length < 2) return false;

  // Pick a random starting node that has outgoing segments
  const shuffled = nodeIds.sort(() => Math.random() - 0.5);
  let fromNodeId = null, toNodeId = null;

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
      toNodeId = dest;
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
  if (lanePath.length < 1) return false;

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
    routeStep: 0,        // which segment in laneSeq we're on
    laneSeq,
    // current position
    phase: "segment",    // "segment" | "junction"
    segId: firstStep.segId,
    dir: firstStep.dir,
    laneIdx: firstStep.laneIdx,
    s: 0,
    path: lanePath,
    // junction phase
    connectorId: null,
    junctionS: 0,
    junctionPath: null,
    // motion
    speedFactor: SPEED_FACTOR_MIN + Math.random() * SPEED_FACTOR_RANGE,
    speed: 0,
    desiredSpeed: seg.speedLimit * (SPEED_FACTOR_MIN + Math.random() * SPEED_FACTOR_RANGE),
    joinGrace: 0,
    waiting: false,
  };

  state.cars.push(car);
  return true;
}

export function updateCars(dt) {
  if (state.networkDirty) rebuildJunctions();
  updateSignals(dt);

  for (const car of state.cars) {
    car.joinGrace = Math.max(0, (car.joinGrace || 0) - dt);

    if (car.phase === "segment") {
      updateCarOnSegment(car, dt);
    } else {
      updateCarOnJunction(car, dt);
    }
  }

  state.cars = state.cars.filter(c => !c.remove);

  // Spawn pending cars
  if (state.pendingSpawns > 0) {
    const maxAttempts = SPAWN_MAX_ATTEMPTS;
    for (let i = 0; i < maxAttempts && state.pendingSpawns > 0; i++) {
      if (spawnCar()) state.pendingSpawns--;
    }
    // If no nodes/segments exist, clear queue
    if (state.nodes.size < 2) state.pendingSpawns = 0;
  }
}

function updateCarOnSegment(car, dt) {
  const remToEnd = car.path.length - car.s;

  // Collision detection with cars on same segment/lane
  let obstacleDist = Infinity;
  for (const other of state.cars) {
    if (other === car) continue;
    if (other.phase !== "segment") continue;
    if (other.segId !== car.segId || other.dir !== car.dir || other.laneIdx !== car.laneIdx) continue;
    if (other.s <= car.s) continue; // only cars ahead

    const dist = other.s - car.s;
    if (dist < obstacleDist) obstacleDist = dist;
  }

  const seg = state.segments.get(car.segId);
  let target = seg ? seg.speedLimit * car.speedFactor : car.desiredSpeed;

  // Determine the desired next step (for connector routing)
  const nextStep = (car.laneSeq && car.routeStep + 1 < car.laneSeq.length)
    ? car.laneSeq[car.routeStep + 1] : null;

  // Look ahead to junction
  if (remToEnd < JUNCTION_LOOKAHEAD && seg) {
    const destNodeId = getDestinationNode(seg, car.dir);
    const junc = state.junctions.get(destNodeId);

    if (junc && junc.connectors.length > 0) {
      const conn = nextStep
        ? findConnector(destNodeId, car.segId, car.dir, car.laneIdx, nextStep.segId, nextStep.dir, nextStep.laneIdx)
        : findConnector(destNodeId, car.segId, car.dir, car.laneIdx);
      if (conn) {
        if (!isConnectorGreen(conn)) target = 0;
        if (isJunctionBlocked(conn)) target = 0;
      } else {
        if (remToEnd < JUNCTION_STOP_DIST) target = 0;
      }
    }
  }

  if (obstacleDist < CAR_STOP_DIST) target = 0;
  else if (obstacleDist < CAR_SLOW_DIST) target *= CAR_SLOW_FACTOR;

  applyAcceleration(car, target, dt);

  car.s += car.speed * dt;

  if (car.s >= car.path.length) {
    car.s = car.path.length;
    if (!seg) { car.remove = true; return; }

    const destNodeId = getDestinationNode(seg, car.dir);
    const conn = nextStep
      ? findConnector(destNodeId, car.segId, car.dir, car.laneIdx, nextStep.segId, nextStep.dir, nextStep.laneIdx)
      : findConnector(destNodeId, car.segId, car.dir, car.laneIdx);

    if (conn && isConnectorGreen(conn) && !isJunctionBlocked(conn)) {
      car.phase = "junction";
      car.connectorId = conn.id;
      car.junctionNodeId = conn.nodeId;
      car.junctionPath = conn.path;
      car.junctionS = 0;
      car.joinGrace = JOIN_GRACE_TIME;
    } else if (conn) {
      // Wait at stop line
      car.s = car.path.length - 1;
      car.speed = 0;
    } else {
      // Dead end or last step — remove car
      car.remove = true;
    }
  }
}

function updateCarOnJunction(car, dt) {
  if (!car.junctionPath) {
    car.remove = true;
    return;
  }

  // Find connector using cached nodeId (O(1) junction lookup)
  let conn = null;
  const junc = state.junctions.get(car.junctionNodeId);
  if (junc) conn = junc.connectors.find(c => c.id === car.connectorId) || null;

  // Collision avoidance on junction (simple: check other cars on same connector)
  let obstacleDist = Infinity;
  for (const other of state.cars) {
    if (other === car) continue;
    if (other.phase !== "junction") continue;
    if (other.connectorId !== car.connectorId) continue;
    if (other.junctionS <= car.junctionS) continue;
    const dist = other.junctionS - car.junctionS;
    if (dist < obstacleDist) obstacleDist = dist;
  }

  let target = car.desiredSpeed;
  if (obstacleDist < CAR_STOP_DIST) target = 0;
  else if (obstacleDist < CAR_SLOW_DIST) target *= CAR_SLOW_FACTOR;

  applyAcceleration(car, target, dt);
  car.junctionS += car.speed * dt;

  if (car.junctionS >= car.junctionPath.length) {
    // Exited junction — move to next segment
    if (conn) {
      const outSeg = state.segments.get(conn.outSegId);
      if (outSeg) {
        const lanePath = buildLanePath(outSeg, state.nodes, conn.outDir, conn.outLane);
        if (lanePath.length > 0) {
          car.phase = "segment";
          car.segId = conn.outSegId;
          car.dir = conn.outDir;
          car.laneIdx = conn.outLane;
          car.path = lanePath;
          car.s = 0;
          car.junctionPath = null;
          car.connectorId = null;
          car.joinGrace = JOIN_GRACE_TIME;
          car.desiredSpeed = outSeg.speedLimit * car.speedFactor;
          // Advance route step if this matches our plan
          advanceRouteStepIfMatches(car, conn.outSegId, conn.outDir, conn.outLane);
          return;
        }
      }
    }
    car.remove = true;
  }
}

/**
 * Check if a junction connector is blocked for entry.
 * Allows following with spacing: blocks only if another car is still near the entry.
 */
function isJunctionBlocked(conn) {
  for (const car of state.cars) {
    if (car.phase !== "junction") continue;
    if (car.connectorId !== conn.id) continue;
    // Allow entry if the car ahead is already well into the connector
    if (car.junctionPath && car.junctionS > JUNCTION_ENTRY_THRESHOLD) continue;
    return true;
  }
  return false;
}

/**
 * When a car has reached the end of its route step, advance to the next.
 * If no more steps, remove the car.
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
  if (lanePath.length < 1) { car.remove = true; return; }
  car.phase = "segment";
  car.segId = step.segId;
  car.dir = step.dir;
  car.laneIdx = step.laneIdx;
  car.path = lanePath;
  car.s = 0;
}

function advanceRouteStepIfMatches(car, segId, dir, laneIdx) {
  if (!car.laneSeq) return;
  const nextStep = car.routeStep + 1;
  if (nextStep < car.laneSeq.length) {
    const step = car.laneSeq[nextStep];
    if (step.segId === segId && step.dir === dir && step.laneIdx === laneIdx) {
      car.routeStep = nextStep;
    }
  }
}

function applyAcceleration(car, target, dt) {
  const accel = target > car.speed ? CAR_ACCEL : CAR_BRAKE;
  const delta = target - car.speed;
  const step = Math.sign(delta) * Math.min(Math.abs(delta), accel * dt);
  car.speed = Math.max(0, car.speed + step);
}
