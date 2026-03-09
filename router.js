import { state } from "./state.js";
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
      const goAtoB = seg.nodeA === current;
      const lanesThisDir = goAtoB ? seg.lanesAtoB : seg.lanesBtoA;
      if (lanesThisDir <= 0) continue; // one-way enforcement

      const neighbor = goAtoB ? seg.nodeB : seg.nodeA;
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
  const sequence = [];
  const segmentByPair = new Map();

  function pairKey(aNodeId, bNodeId) {
    return aNodeId < bNodeId ? `${aNodeId}:${bNodeId}` : `${bNodeId}:${aNodeId}`;
  }

  for (const seg of segments.values()) {
    segmentByPair.set(pairKey(seg.nodeA, seg.nodeB), seg);
  }

  function findSegmentBetween(aNodeId, bNodeId) {
    return segmentByPair.get(pairKey(aNodeId, bNodeId)) || null;
  }

  for (let i = 0; i < routeNodeIds.length - 1; i++) {
    const fromNodeId = routeNodeIds[i];
    const toNodeId = routeNodeIds[i + 1];

    const seg = findSegmentBetween(fromNodeId, toNodeId);
    if (!seg) continue;

    const dir = (seg.nodeA === fromNodeId) ? "AtoB" : "BtoA";
    const totalLanes = (dir === "AtoB") ? seg.lanesAtoB : seg.lanesBtoA;
    if (totalLanes <= 0) continue;

    // Prevent U-turn at multi-way intersections
    if (i + 2 < routeNodeIds.length) {
      const nextToNodeId = routeNodeIds[i + 2];
      const nextSeg = findSegmentBetween(toNodeId, nextToNodeId);
      if (nextSeg && nextSeg.id === seg.id && getNodeSegments(toNodeId).length > 1) return [];
    }

    sequence.push({ segId: seg.id, dir, laneIdx: 0 });
  }

  return sequence;
}
