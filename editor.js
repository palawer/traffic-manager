import { state, CONNECT_SNAP_DIST, CONNECT_ANGLE_TOL, ROAD_WIDTH, LANE_WIDTH, LANE_OFFSET } from "./state.js";
import { PIECES } from "./pieces.js";
import { normalizeAngle, snap, getRoundaboutLaneRadii } from "./geometry.js";
import { getWorldConnectors, pieceById, rebuildNetwork, markNetworkDirty, transformLocalPoint } from "./network.js";
import { canvas, screenToWorld, setPaletteSelection } from "./renderer.js";

function transformWorldToLocal(piece, worldPoint) {
  const dx = worldPoint.x - piece.x;
  const dy = worldPoint.y - piece.y;
  const c = Math.cos(piece.rot);
  const s = Math.sin(piece.rot);
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = px - x1;
  const wy = py - y1;
  const vv = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv));
  const cx = x1 + vx * t;
  const cy = y1 + vy * t;
  return Math.hypot(px - cx, py - cy);
}

function getPieceOverlapRadius(piece) {
  const def = PIECES[piece.type];
  return def.overlapRadius || def.pickRadius * 0.45;
}

function pointInPieceRoad(piece, worldPoint, margin = 2) {
  const def = PIECES[piece.type];
  const p = transformWorldToLocal(piece, worldPoint);
  const half = Math.max(4, ROAD_WIDTH * 0.5 - margin);

  if (piece.type === "straight") {
    return pointSegmentDistance(p.x, p.y, -100, 0, 100, 0) <= half;
  }

  if (piece.type === "curve") {
    const cx = def.center.x;
    const cy = def.center.y;
    const rx = p.x - cx;
    const ry = p.y - cy;
    const rr = Math.hypot(rx, ry);
    const a = Math.atan2(ry, rx);
    const inSector = a >= -0.001 && a <= Math.PI / 2 + 0.001;
    if (inSector && Math.abs(rr - def.radius) <= half) return true;
    for (const c of def.connectors) {
      if (Math.hypot(p.x - c.x, p.y - c.y) <= half) return true;
    }
    return false;
  }

  if (piece.type === "traffic_light_cross") {
    return (
      pointSegmentDistance(p.x, p.y, -100, 0, 100, 0) <= half ||
      pointSegmentDistance(p.x, p.y, 0, -100, 0, 100) <= half
    );
  }

  const radii = getRoundaboutLaneRadii(def);
  const innerEdge = radii.inner - LANE_WIDTH * 0.5;
  const outerEdge = radii.outer + LANE_WIDTH * 0.5;
  const rr = Math.hypot(p.x, p.y);
  if (rr >= innerEdge + margin && rr <= outerEdge - margin) return true;

  for (const c of def.connectors) {
    const d = Math.hypot(c.x, c.y) || 1;
    const ux = c.x / d;
    const uy = c.y / d;
    const t = p.x * ux + p.y * uy;
    const lat = Math.abs(-uy * p.x + ux * p.y);
    const start = radii.outerEdge;
    if (t >= start && t <= d && lat <= half) return true;
    if (t > d && Math.hypot(p.x - c.x, p.y - c.y) <= half) return true;
  }

  return false;
}

function samplePieceRoadPoints(piece) {
  const def = PIECES[piece.type];
  const half = ROAD_WIDTH * 0.5 - 2;
  const local = [];

  if (piece.type === "straight") {
    for (let x = -100; x <= 100; x += 18) {
      local.push({ x, y: -half }, { x, y: 0 }, { x, y: half });
    }
  } else if (piece.type === "curve") {
    const rs = [def.radius - half, def.radius, def.radius + half];
    for (let i = 0; i <= 10; i++) {
      const a = (Math.PI / 2) * (i / 10);
      for (const r of rs) {
        local.push({ x: def.center.x + Math.cos(a) * r, y: def.center.y + Math.sin(a) * r });
      }
    }
  } else if (piece.type === "traffic_light_cross") {
    for (let x = -100; x <= 100; x += 18) {
      local.push({ x, y: -half }, { x, y: 0 }, { x, y: half });
    }
    for (let y = -100; y <= 100; y += 18) {
      local.push({ x: -half, y }, { x: 0, y }, { x: half, y });
    }
  } else {
    const radii = getRoundaboutLaneRadii(def);
    const innerEdge = radii.inner - LANE_WIDTH * 0.5 + 2;
    const outerEdge = radii.outer + LANE_WIDTH * 0.5 - 2;
    const mid = (innerEdge + outerEdge) * 0.5;
    const ringR = [innerEdge, mid, outerEdge];
    for (let i = 0; i < 20; i++) {
      const a = (Math.PI * 2 * i) / 20;
      for (const r of ringR) local.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    for (const c of def.connectors) {
      const d = Math.hypot(c.x, c.y) || 1;
      const ux = c.x / d;
      const uy = c.y / d;
      const px = -uy;
      const py = ux;
      for (let t = radii.outerEdge; t <= d; t += 18) {
        local.push(
          { x: ux * t + px * half, y: uy * t + py * half },
          { x: ux * t, y: uy * t },
          { x: ux * t - px * half, y: uy * t - py * half }
        );
      }
    }
  }

  return local.map((p) => transformLocalPoint(piece, p));
}

function piecesRoadOverlap(a, b) {
  const rA = getPieceOverlapRadius(a);
  const rB = getPieceOverlapRadius(b);
  if (Math.hypot(a.x - b.x, a.y - b.y) > rA + rB + 8) return false;

  let hits = 0;
  const pointsA = samplePieceRoadPoints(a);
  for (const p of pointsA) {
    if (pointInPieceRoad(b, p, 2.5)) {
      hits++;
      if (hits >= 3) return true;
    }
  }

  hits = 0;
  const pointsB = samplePieceRoadPoints(b);
  for (const p of pointsB) {
    if (pointInPieceRoad(a, p, 2.5)) {
      hits++;
      if (hits >= 3) return true;
    }
  }

  return false;
}

export function overlapsAnyPiece(piece, ignoreId = null) {
  for (const other of state.pieces) {
    if (other.id === ignoreId) continue;
    if (piecesRoadOverlap(piece, other)) return true;
  }
  return false;
}

export function hitPiece(worldX, worldY) {
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

export function snapPiece(piece) {
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
    return;
  }

  piece.x = snap(piece.x);
  piece.y = snap(piece.y);
}

export function addPiece(type, x, y) {
  const piece = {
    id: state.nextPieceId++,
    type,
    x: snap(x),
    y: snap(y),
    rot: state.placeRotation,
  };
  snapPiece(piece);
  if (overlapsAnyPiece(piece)) return false;
  state.pieces.push(piece);
  state.selectedId = piece.id;
  markNetworkDirty();
  return true;
}

export function removeSelectedPiece() {
  if (!state.selectedId) return;
  const id = state.selectedId;
  state.pieces = state.pieces.filter((p) => p.id !== id);
  state.selectedId = null;
  markNetworkDirty();
}

export function setupInput() {
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
      if (addPiece(state.placingType, world.x, world.y)) {
        setPaletteSelection(null);
      }
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
      const prevX = piece.x;
      const prevY = piece.y;
      const world = screenToWorld(e.offsetX, e.offsetY);
      piece.x = snap(world.x - state.dragOffset.x);
      piece.y = snap(world.y - state.dragOffset.y);
      snapPiece(piece);
      if (overlapsAnyPiece(piece, piece.id)) {
        piece.x = prevX;
        piece.y = prevY;
        return;
      }
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
