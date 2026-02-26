import { state, TRAFFIC_LIGHT_GREEN_TIME } from "./state.js";
import { PIECES } from "./pieces.js";
import { normalizeAngle, polylineMetrics, pointAtPath, headingAtPath, getRoundaboutLaneRadii, hslToHex } from "./geometry.js";
import { pieceById, parseConnectorKey, rebuildNetwork } from "./network.js";
import {
  assignTraversal,
  assignTraversalWithBlend,
  assignTurnaroundTraversal,
  assignRoundaboutTurnaroundTraversal,
} from "./traversal.js";

export function getTrafficLightPhase(piece) {
  const cycle = TRAFFIC_LIGHT_GREEN_TIME * 2;
  const t = (state.signalTime + piece.id * 0.7) % cycle;
  return t < TRAFFIC_LIGHT_GREEN_TIME ? "ns" : "ew";
}

export function isNorthSouthConnector(piece, connectorIdx) {
  const def = PIECES[piece.type];
  const c = def.connectors[connectorIdx];
  const worldDir = normalizeAngle(c.dir + piece.rot);
  return Math.abs(Math.cos(worldDir)) < 0.5;
}

export function isTrafficLightGreen(piece, connectorIdx) {
  const phase = getTrafficLightPhase(piece);
  const isNs = isNorthSouthConnector(piece, connectorIdx);
  return (phase === "ns" && isNs) || (phase === "ew" && !isNs);
}

export function isRoundaboutEntryBlocked(roundPiece, entryIdx) {
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

export function spawnCar() {
  if (state.networkDirty) rebuildNetwork();
  const openCandidates = state.openConnectors.filter((c) => {
    const piece = pieceById(c.pieceId);
    return piece && !PIECES[piece.type].isRoundabout;
  });
  const fallbackCandidates =
    openCandidates.length > 0
      ? openCandidates
      : state.connectors.filter((c) => {
          const piece = pieceById(c.pieceId);
          return piece && !PIECES[piece.type].isRoundabout;
        });
  if (fallbackCandidates.length === 0) return false;

  const entry = fallbackCandidates[Math.floor(Math.random() * fallbackCandidates.length)];
  const car = {
    id: Math.random().toString(36).slice(2, 9),
    pieceId: entry.pieceId,
    fromConnectorIdx: entry.connectorIndex,
    toConnectorIdx: 0,
    path: polylineMetrics([]),
    s: 0,
    speed: 0,
    desiredSpeed: 56 + Math.random() * 18,
    joinGrace: 0,
    waiting: false,
    exitOrdinal: null,
    color: hslToHex(Math.random() * 360, 0.7, 0.52),
  };

  if (assignTraversal(car, entry.pieceId, entry.connectorIndex)) {
    const head = pointAtPath(car.path, 0);
    const blocked = state.cars.some((c) => {
      const p = pointAtPath(c.path, c.s);
      return Math.hypot(p.x - head.x, p.y - head.y) < 35;
    });
    if (!blocked) {
      state.cars.push(car);
      return true;
    }
  }
  return false;
}

export function updateCars(dt) {
  if (state.networkDirty) rebuildNetwork();
  state.signalTime += dt;

  for (const car of state.cars) {
    car.joinGrace = Math.max(0, (car.joinGrace || 0) - dt);
    let obstacleDist = Infinity;
    const myPos = pointAtPath(car.path, car.s);
    const myHeading = headingAtPath(car.path, car.s);
    const remToEnd = car.path.length - car.s;

    for (const other of state.cars) {
      if (other === car) continue;
      if (other.pieceId !== car.pieceId) continue;          // sólo misma pieza
      if (other.path.length - other.s < 2 && other.speed > 2) continue; // a punto de transicionar (no si está parado esperando)
      const op = pointAtPath(other.path, other.s);
      const dist = Math.hypot(op.x - myPos.x, op.y - myPos.y);
      if (dist > 60) continue;
      const otherHeading = headingAtPath(other.path, other.s);
      if (Math.abs(normalizeAngle(otherHeading - myHeading)) > Math.PI / 2) continue; // ignora coches en sentido contrario
      const toOther = Math.atan2(op.y - myPos.y, op.x - myPos.x);
      const rel = Math.abs(normalizeAngle(toOther - myHeading));

      if (car.joinGrace > 0 || (other.joinGrace || 0) > 0) {
        if (!(dist < 10 && rel < 1.2)) continue;
      } else if (rel >= 0.75) {
        continue;
      }

      if (dist < obstacleDist) obstacleDist = dist;
    }

    let target = car.desiredSpeed;
    if (car.joinGrace > 0) target = Math.max(target, 28);
    if (remToEnd < 30) {
      const currentKey = `${car.pieceId}:${car.toConnectorIdx}`;
      const nextKey = state.connections.get(currentKey);
      if (nextKey) {
        const next = parseConnectorKey(nextKey);
        const nextPiece = pieceById(next.pieceId);
        if (nextPiece && PIECES[nextPiece.type].isTrafficLightCross && !isTrafficLightGreen(nextPiece, next.connectorIndex)) {
          target = 0;
        }
        if (nextPiece && PIECES[nextPiece.type].isRoundabout && isRoundaboutEntryBlocked(nextPiece, next.connectorIndex)) {
          target = 0;
        }
      }
    }
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
          const currentPiece = pieceById(car.pieceId);
          if (currentPiece) {
            if (PIECES[currentPiece.type].isRoundabout) {
              if (!assignRoundaboutTurnaroundTraversal(car, currentPiece, car.toConnectorIdx)) {
                car.remove = true;
                break;
              }
              continue;
            }
            if (!assignTurnaroundTraversal(car, currentPiece, car.toConnectorIdx)) {
              car.remove = true;
              break;
            }
            continue;
          }
          car.remove = true;
          break;
        }

        const next = parseConnectorKey(nextKey);
        const nextPiece = pieceById(next.pieceId);
        if (!nextPiece) {
          car.remove = true;
          break;
        }

        if (PIECES[nextPiece.type].isTrafficLightCross && !isTrafficLightGreen(nextPiece, next.connectorIndex)) {
          car.s = Math.max(0, car.path.length - 1);
          car.speed = 0;
          break;
        }

        if (PIECES[nextPiece.type].isRoundabout && isRoundaboutEntryBlocked(nextPiece, next.connectorIndex)) {
          car.s = Math.max(0, car.path.length - 1);
          car.speed = 0;
          break;
        }

        if (!assignTraversalWithBlend(car, nextPiece, next.connectorIndex)) {
          car.remove = true;
          break;
        }
      }
    }
  }

  state.cars = state.cars.filter((c) => !c.remove);

  if (state.pendingSpawns > 0) {
    if (state.networkDirty) rebuildNetwork();
    if (state.connectors.length === 0) {
      state.pendingSpawns = 0;
    } else {
      const maxAttemptsPerFrame = 6;
      let attempts = 0;
      while (state.pendingSpawns > 0 && attempts < maxAttemptsPerFrame) {
        if (!spawnCar()) break;
        state.pendingSpawns -= 1;
        attempts += 1;
      }
    }
  }
}
