import { state, LANE_OFFSET, CONNECT_SNAP_DIST, CONNECT_ANGLE_TOL } from "./state.js";
import { PIECES } from "./pieces.js";
import { rotatePoint, normalizeAngle, rightNormalForHeading } from "./geometry.js";

export function pieceById(id) {
  return state.pieces.find((p) => p.id === id) || null;
}

export function transformLocalPoint(piece, pt) {
  const p = rotatePoint(pt.x, pt.y, piece.rot);
  return { x: piece.x + p.x, y: piece.y + p.y };
}

export function getWorldConnectors(piece) {
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

export function connectorLanePointWorld(piece, connectorIdx, heading, offset = LANE_OFFSET) {
  const def = PIECES[piece.type];
  const c = def.connectors[connectorIdx];
  const base = transformLocalPoint(piece, c);
  const n = rightNormalForHeading(heading);
  return { x: base.x + n.x * offset, y: base.y + n.y * offset };
}

export function parseConnectorKey(key) {
  const [pieceId, connectorIndex] = key.split(":");
  return { pieceId: Number(pieceId), connectorIndex: Number(connectorIndex) };
}

export function rebuildNetwork() {
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

export function markNetworkDirty() {
  state.networkDirty = true;
}
