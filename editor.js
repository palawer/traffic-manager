import { state, NODE_SNAP_DIST, GRID } from "./state.js";
import { snap, pointAtPath } from "./geometry.js";
import { addNode, addSegment, removeNode, removeSegment, markNetworkDirty } from "./network.js";
import { canvas, screenToWorld, setTool } from "./renderer.js";

/**
 * Find the nearest node within snap distance of (wx, wy).
 * Returns nodeId or null.
 */
function snapToNode(wx, wy) {
  let best = null, bestDist = NODE_SNAP_DIST;
  for (const node of state.nodes.values()) {
    const d = Math.hypot(node.x - wx, node.y - wy);
    if (d < bestDist) { bestDist = d; best = node.id; }
  }
  return best;
}

/**
 * Returns true if a new segment fromId→toId would geometrically cross or overlap
 * any existing segment (shared endpoints at junction nodes are allowed).
 */
function wouldOverlap(fromId, toId) {
  const p1 = state.nodes.get(fromId);
  const p2 = state.nodes.get(toId);
  if (!p1 || !p2) return false;

  for (const seg of state.segments.values()) {
    const p3 = state.nodes.get(seg.nodeA);
    const p4 = state.nodes.get(seg.nodeB);
    if (!p3 || !p4) continue;

    // Skip — duplicate segment already blocked by addSegment
    const dup = (fromId === seg.nodeA && toId === seg.nodeB) ||
                (fromId === seg.nodeB && toId === seg.nodeA);
    if (dup) continue;

    if (segmentsConflict(p1, p2, p3, p4, fromId, toId, seg.nodeA, seg.nodeB)) return true;
  }
  return false;
}

/**
 * Returns true if segment p1-p2 conflicts with segment p3-p4.
 * Conflict = they cross or overlap at a non-shared-endpoint point.
 */
function segmentsConflict(p1, p2, p3, p4, fromId, toId, segA, segB) {
  const dx1 = p2.x - p1.x, dy1 = p2.y - p1.y;
  const dx2 = p4.x - p3.x, dy2 = p4.y - p3.y;
  const denom = dx1 * dy2 - dy1 * dx2;

  if (Math.abs(denom) < 1e-6) {
    // Parallel: check if collinear
    const cross = (p3.x - p1.x) * dy1 - (p3.y - p1.y) * dx1;
    const lenSq = dx1 * dx1 + dy1 * dy1;
    if (lenSq < 1e-10 || Math.abs(cross) > 1e-4 * Math.sqrt(lenSq)) return false;

    // Collinear: check if the projected intervals on p1→p2 overlap beyond a shared endpoint
    const t3 = ((p3.x - p1.x) * dx1 + (p3.y - p1.y) * dy1) / lenSq;
    const t4 = ((p4.x - p1.x) * dx1 + (p4.y - p1.y) * dy1) / lenSq;
    const overlapMin = Math.max(0, Math.min(t3, t4));
    const overlapMax = Math.min(1, Math.max(t3, t4));
    return overlapMax - overlapMin > 1e-6;
  }

  // General case: compute intersection parameters
  const dx3 = p3.x - p1.x, dy3 = p3.y - p1.y;
  const t = (dx3 * dy2 - dy3 * dx2) / denom;
  const u = (dx3 * dy1 - dy3 * dx1) / denom;
  const eps = 1e-6;

  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return false; // no intersection

  // Intersection exists — allow it only if it's exactly at a shared endpoint node
  const atP1 = t < eps;  // intersection at p1 (fromId)
  const atP2 = t > 1 - eps; // intersection at p2 (toId)
  const atP3 = u < eps;  // intersection at p3 (segA)
  const atP4 = u > 1 - eps; // intersection at p4 (segB)

  if (atP1 && atP3 && fromId === segA) return false;
  if (atP1 && atP4 && fromId === segB) return false;
  if (atP2 && atP3 && toId   === segA) return false;
  if (atP2 && atP4 && toId   === segB) return false;

  return true; // conflict
}

/**
 * Find the node or segment under the cursor.
 * Returns { type: "node"|"segment", id } or null.
 */
function hitTest(wx, wy) {
  // Check nodes first
  let bestNode = null, bestNodeDist = 12 / state.view.zoom;
  for (const node of state.nodes.values()) {
    const d = Math.hypot(node.x - wx, node.y - wy);
    if (d < bestNodeDist) { bestNodeDist = d; bestNode = node.id; }
  }
  if (bestNode !== null) return { type: "node", id: bestNode };

  // Check segments (point-to-segment distance)
  let bestSeg = null, bestSegDist = 20 / state.view.zoom;
  for (const seg of state.segments.values()) {
    const nA = state.nodes.get(seg.nodeA);
    const nB = state.nodes.get(seg.nodeB);
    if (!nA || !nB) continue;
    const d = pointSegDist(wx, wy, nA.x, nA.y, nB.x, nB.y);
    if (d < bestSegDist) { bestSegDist = d; bestSeg = seg.id; }
  }
  if (bestSeg !== null) return { type: "segment", id: bestSeg };

  return null;
}

/**
 * Return the id of the car at world position (wx, wy), or null if none.
 */
function findCarAt(wx, wy) {
  const hitRadius = 12;
  for (const car of state.cars) {
    const p = (car.phase === "junction" && car.junctionPath)
      ? pointAtPath(car.junctionPath, car.junctionS)
      : pointAtPath(car.path, car.s);
    if (Math.hypot(p.x - wx, p.y - wy) < hitRadius) return car.id;
  }
  return null;
}

function pointSegDist(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1;
  const wx = px - x1, wy = py - y1;
  const vv = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv));
  return Math.hypot(px - (x1 + vx * t), py - (y1 + vy * t));
}

export function setupInput() {
  canvas.addEventListener("contextmenu", e => e.preventDefault());

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
}

let dragNodeId = null;
let dragOffset = { x: 0, y: 0 };

function onPointerDown(e) {
  const world = screenToWorld(e.offsetX, e.offsetY);
  state.lastMouse = { x: e.offsetX, y: e.offsetY };

  // Pan: space + drag, or middle mouse
  if (state.keys.space || e.button === 1) {
    state.panning = true;
    canvas.style.cursor = "grabbing";
    return;
  }

  if (e.button !== 0) return;

  // Speed limit tool
  if (state.tool === "speed") {
    const hit = hitTest(world.x, world.y);
    if (hit && hit.type === "segment") {
      const seg = state.segments.get(hit.id);
      if (seg) {
        const cycle = [30, 50, 80, 120];
        const idx = cycle.indexOf(seg.speedLimit);
        seg.speedLimit = cycle[(idx + 1) % cycle.length];
      }
    }
    return;
  }

  // Car selection: always check first so you can click a car in any mode
  const clickedCarId = findCarAt(world.x, world.y);
  if (clickedCarId !== null) {
    state.selectedCarId = (state.selectedCarId === clickedCarId) ? null : clickedCarId;
    return;
  }
  state.selectedCarId = null;

  if (state.tool === "segment") {
    const snapId = snapToNode(world.x, world.y);
    if (state.drawingSegment === null) {
      // Start drawing: use existing or create new node
      let fromId;
      if (snapId !== null) {
        fromId = snapId;
      } else {
        fromId = addNode(snap(world.x), snap(world.y));
      }
      state.drawingSegment = {
        fromNodeId: fromId,
        toWorld: { x: world.x, y: world.y },
        snapNodeId: null,
      };
    } else {
      // Finish drawing
      const fromId = state.drawingSegment.fromNodeId;
      let toId;
      let autoCreated = false;
      if (snapId !== null && snapId !== fromId) {
        toId = snapId;
      } else if (snapId === fromId) {
        // Clicked the same node — cancel
        state.drawingSegment = null;
        return;
      } else {
        toId = addNode(snap(world.x), snap(world.y));
        autoCreated = true;
      }

      if (wouldOverlap(fromId, toId)) {
        // Reject — clean up the auto-created node if it was just made
        if (autoCreated) removeNode(toId);
        return;
      }

      addSegment(fromId, toId);
      // Continue drawing from the new endpoint
      const toNode = state.nodes.get(toId);
      state.drawingSegment = {
        fromNodeId: toId,
        toWorld: { x: toNode.x, y: toNode.y },
        snapNodeId: null,
      };
      markNetworkDirty();
    }
    return;
  }

  if (state.tool === "select") {
    const hit = hitTest(world.x, world.y);
    if (hit) {
      if (hit.type === "node") {
        state.selectedNodeId = hit.id;
        state.selectedSegId = null;
        dragNodeId = hit.id;
        const node = state.nodes.get(hit.id);
        dragOffset = { x: world.x - node.x, y: world.y - node.y };
      } else {
        state.selectedSegId = hit.id;
        state.selectedNodeId = null;
      }
    } else {
      state.selectedNodeId = null;
      state.selectedSegId = null;
    }
  }
}

function onPointerMove(e) {
  const dx = e.offsetX - state.lastMouse.x;
  const dy = e.offsetY - state.lastMouse.y;
  state.lastMouse = { x: e.offsetX, y: e.offsetY };

  if (state.panning) {
    state.view.x -= dx / state.view.zoom;
    state.view.y -= dy / state.view.zoom;
    return;
  }

  const world = screenToWorld(e.offsetX, e.offsetY);

  // Update hover node
  state.hoveredNodeId = snapToNode(world.x, world.y);

  // Update hover segment (for speed tool)
  if (state.tool === "speed") {
    const hit = hitTest(world.x, world.y);
    state.hoveredSegId = (hit && hit.type === "segment") ? hit.id : null;
  } else {
    state.hoveredSegId = null;
  }

  if (dragNodeId !== null) {
    const node = state.nodes.get(dragNodeId);
    if (node) {
      node.x = snap(world.x - dragOffset.x);
      node.y = snap(world.y - dragOffset.y);
      markNetworkDirty();
    }
    return;
  }

  if (state.drawingSegment) {
    const snapId = snapToNode(world.x, world.y);
    if (snapId !== null && snapId !== state.drawingSegment.fromNodeId) {
      const sn = state.nodes.get(snapId);
      state.drawingSegment.toWorld = { x: sn.x, y: sn.y };
      state.drawingSegment.snapNodeId = snapId;
    } else {
      state.drawingSegment.toWorld = { x: world.x, y: world.y };
      state.drawingSegment.snapNodeId = null;
    }
    // Check validity for preview colouring
    const fromId = state.drawingSegment.fromNodeId;
    if (state.drawingSegment.snapNodeId) {
      state.drawingSegment.invalid = wouldOverlap(fromId, state.drawingSegment.snapNodeId);
    } else {
      const tw = state.drawingSegment.toWorld;
      const phantom = { id: -1, x: snap(tw.x), y: snap(tw.y) };
      state.nodes.set(-1, phantom);
      state.drawingSegment.invalid = wouldOverlap(fromId, -1);
      state.nodes.delete(-1);
    }
  }
}

function onPointerUp(e) {
  state.panning = false;
  dragNodeId = null;
  if (canvas) {
    canvas.style.cursor = state.tool === "select" ? "default" : "crosshair";
  }
}

function onWheel(e) {
  const before = screenToWorld(e.offsetX, e.offsetY);
  const factor = Math.exp(-e.deltaY * 0.0012);
  state.view.zoom = Math.max(0.2, Math.min(4, state.view.zoom * factor));
  const after = screenToWorld(e.offsetX, e.offsetY);
  state.view.x += before.x - after.x;
  state.view.y += before.y - after.y;
  e.preventDefault();
}

function onKeyDown(e) {
  if (e.code === "Space") {
    state.keys.space = true;
    if (canvas) canvas.style.cursor = "grab";
  }
  if (e.key === "Escape") {
    state.drawingSegment = null;
    dragNodeId = null;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (state.selectedNodeId !== null) {
      removeNode(state.selectedNodeId);
      state.selectedNodeId = null;
    } else if (state.selectedSegId !== null) {
      removeSegment(state.selectedSegId);
      state.selectedSegId = null;
    }
  }
  // Tool shortcuts
  if (e.key === "r" || e.key === "R") setTool("segment");
  if (e.key === "s" || e.key === "S") setTool("select");
  if (e.key === "v" || e.key === "V") setTool("speed");
  if (e.key === "p" || e.key === "P") document.getElementById("pauseBtn")?.click();
}

function onKeyUp(e) {
  if (e.code === "Space") {
    state.keys.space = false;
    if (canvas) canvas.style.cursor = state.tool === "select" ? "default" : "crosshair";
  }
}
