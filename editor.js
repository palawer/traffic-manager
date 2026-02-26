import { state, NODE_SNAP_DIST, GRID } from "./state.js";
import { snap } from "./geometry.js";
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
      if (snapId !== null && snapId !== fromId) {
        toId = snapId;
      } else if (snapId === fromId) {
        // Clicked the same node — cancel
        state.drawingSegment = null;
        return;
      } else {
        toId = addNode(snap(world.x), snap(world.y));
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
}

function onKeyUp(e) {
  if (e.code === "Space") {
    state.keys.space = false;
    if (canvas) canvas.style.cursor = state.tool === "select" ? "default" : "crosshair";
  }
}
