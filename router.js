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

  function connectorExists(nodeId, inSegId, inDir, inLane, outSegId, outDir) {
    const junc = state.junctions.get(nodeId);
    if (!junc || !junc.connectors || junc.connectors.length === 0) return false;
    return junc.connectors.some(c =>
      c.inSegId === inSegId &&
      c.inDir === inDir &&
      c.inLane === inLane &&
      c.outSegId === outSegId &&
      c.outDir === outDir
    );
  }

  for (let i = 0; i < routeNodeIds.length - 1; i++) {
    const fromNodeId = routeNodeIds[i];
    const toNodeId = routeNodeIds[i + 1];

    // Find the segment connecting these two nodes
    const seg = findSegmentBetween(fromNodeId, toNodeId);
    if (!seg) continue;

    const dir = (seg.nodeA === fromNodeId) ? "AtoB" : "BtoA";
    const totalLanes = (dir === "AtoB") ? seg.lanesAtoB : seg.lanesBtoA;
    if (totalLanes <= 0) continue;

    // Determine next step segment/direction for connector validation.
    let nextSeg = null;
    let nextDir = null;
    if (i + 2 < routeNodeIds.length) {
      const nextToNodeId = routeNodeIds[i + 2];
      // Find the segment after this one
      nextSeg = findSegmentBetween(toNodeId, nextToNodeId);
      if (nextSeg) {
        // No immediate U-turn at intersections, except dead-ends (single connected segment).
        if (nextSeg.id === seg.id && getNodeSegments(toNodeId).length > 1) return [];
        nextDir = (nextSeg.nodeA === toNodeId) ? "AtoB" : "BtoA";
      }
    }

    // Pick lane based on connector availability.
    const candidatesConnectorOnly = [];

    for (let lane = 0; lane < totalLanes; lane++) {
      const connectorOk = !nextSeg || connectorExists(toNodeId, seg.id, dir, lane, nextSeg.id, nextDir);

      if (connectorOk) candidatesConnectorOnly.push(lane);
    }

    let bestLane = -1;
    if (candidatesConnectorOnly.length > 0) {
      // When nextSeg is null, connectorOk is always true so every lane qualifies.
      bestLane = candidatesConnectorOnly[0];
    } else {
      // No lane has a valid connector to the next segment — route is impossible
      // with the current junction setup. (Unreachable when nextSeg is null since
      // candidatesConnectorOnly is always non-empty in that case.)
      return [];
    }

    bestLane = Math.max(0, Math.min(totalLanes - 1, bestLane));

    sequence.push({ segId: seg.id, dir, laneIdx: bestLane });
  }

  return sequence;
}
