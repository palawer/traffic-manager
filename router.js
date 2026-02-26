import { state } from "./state.js";
import { normalizeAngle } from "./geometry.js";
import { getNodeSegments } from "./network.js";

/**
 * A* pathfinding on the node graph.
 * Returns array of nodeIds from fromNodeId to toNodeId, inclusive.
 * Returns null if no path found.
 */
export function findRoute(fromNodeId, toNodeId) {
  if (fromNodeId === toNodeId) return [fromNodeId];

  const nodes = state.nodes;
  const segments = state.segments;

  // Compute max speed for heuristic
  let maxSpeed = 1;
  for (const seg of segments.values()) maxSpeed = Math.max(maxSpeed, seg.speedLimit);

  const toNode = nodes.get(toNodeId);
  if (!toNode) return null;

  function heuristic(nodeId) {
    const n = nodes.get(nodeId);
    if (!n) return 0;
    return Math.hypot(n.x - toNode.x, n.y - toNode.y) / maxSpeed;
  }

  const openSet = new Set([fromNodeId]);
  const cameFrom = new Map(); // nodeId → { nodeId, segId }
  const gScore = new Map();
  const fScore = new Map();

  gScore.set(fromNodeId, 0);
  fScore.set(fromNodeId, heuristic(fromNodeId));

  while (openSet.size > 0) {
    // Find node with lowest fScore in openSet
    let current = null;
    let bestF = Infinity;
    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity;
      if (f < bestF) { bestF = f; current = id; }
    }

    if (current === toNodeId) {
      // Reconstruct path
      const path = [current];
      let node = current;
      while (cameFrom.has(node)) {
        node = cameFrom.get(node).from;
        path.unshift(node);
      }
      return path;
    }

    openSet.delete(current);

    const currentNode = nodes.get(current);
    if (!currentNode) continue;

    // Expand neighbors via segments
    const segs = getNodeSegments(current);
    for (const seg of segs) {
      const neighbor = (seg.nodeA === current) ? seg.nodeB : seg.nodeA;
      if (!nodes.has(neighbor)) continue;

      const neighborNode = nodes.get(neighbor);
      const edgeCost = Math.hypot(
        neighborNode.x - currentNode.x,
        neighborNode.y - currentNode.y
      ) / (seg.speedLimit || 1);

      const tentativeG = (gScore.get(current) ?? Infinity) + edgeCost;
      if (tentativeG < (gScore.get(neighbor) ?? Infinity)) {
        cameFrom.set(neighbor, { from: current, segId: seg.id });
        gScore.set(neighbor, tentativeG);
        fScore.set(neighbor, tentativeG + heuristic(neighbor));
        openSet.add(neighbor);
      }
    }
  }

  return null; // no path
}

/**
 * Convert a route (array of nodeIds) to a sequence of lane steps.
 * Returns [{ segId, dir, laneIdx }, ...]
 * One entry per segment in the route.
 */
export function routeToLaneSequence(routeNodeIds) {
  const nodes = state.nodes;
  const segments = state.segments;
  const laneArrows = state.laneArrows;
  const sequence = [];

  for (let i = 0; i < routeNodeIds.length - 1; i++) {
    const fromNodeId = routeNodeIds[i];
    const toNodeId = routeNodeIds[i + 1];

    // Find the segment connecting these two nodes
    let seg = null;
    for (const s of segments.values()) {
      if ((s.nodeA === fromNodeId && s.nodeB === toNodeId) ||
          (s.nodeA === toNodeId && s.nodeB === fromNodeId)) {
        seg = s;
        break;
      }
    }
    if (!seg) continue;

    const dir = (seg.nodeA === fromNodeId) ? "AtoB" : "BtoA";
    const totalLanes = (dir === "AtoB") ? seg.lanesAtoB : seg.lanesBtoA;

    // Determine next turn type (for lane selection)
    let nextTurnType = "straight";
    if (i + 2 < routeNodeIds.length) {
      const nextToNodeId = routeNodeIds[i + 2];
      // Find the segment after this one
      let nextSeg = null;
      for (const s of segments.values()) {
        if ((s.nodeA === toNodeId && s.nodeB === nextToNodeId) ||
            (s.nodeA === nextToNodeId && s.nodeB === toNodeId)) {
          nextSeg = s;
          break;
        }
      }
      if (nextSeg) {
        const fromNode = nodes.get(fromNodeId);
        const toNode = nodes.get(toNodeId);
        const nextNode = nodes.get(nextToNodeId);
        if (fromNode && toNode && nextNode) {
          const inHeading = Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x);
          const outHeading = Math.atan2(nextNode.y - toNode.y, nextNode.x - toNode.x);
          const diff = normalizeAngle(outHeading - inHeading);
          if (Math.abs(diff) < Math.PI / 6) nextTurnType = "straight";
          else if (diff > 0) nextTurnType = "left";
          else nextTurnType = "right";
        }
      }
    }

    // Pick lane based on next turn, checking laneArrows
    let bestLane = 0;
    let found = false;

    for (let lane = 0; lane < totalLanes; lane++) {
      const key = `${seg.id}:${dir}:${lane}`;
      const arrows = laneArrows.get(key);
      if (arrows && arrows.has(nextTurnType)) {
        bestLane = lane;
        found = true;
        break;
      }
    }

    if (!found) {
      // Fallback: right=0, left=last, straight=middle
      if (nextTurnType === "right") bestLane = 0;
      else if (nextTurnType === "left") bestLane = totalLanes - 1;
      else bestLane = Math.floor((totalLanes - 1) / 2);
    }

    sequence.push({ segId: seg.id, dir, laneIdx: bestLane });
  }

  return sequence;
}
