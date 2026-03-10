import { state } from "./state.js";
import { getNodeSegments } from "./network.js";

// ── Caches estáticos (red fija, se inicializan una vez) ──────────────────────

let _maxSpeed = 1;
let _segmentByPair = null; // Map<pairKey, seg>
let _routeCache = null;    // Map<from|to, { route, laneSeq } | null>

function pairKey(a, b) {
  return a < b ? a * 1000000 + b : b * 1000000 + a;
}

export function initRouterCache() {
  const segments = state.segments;
  const nodes    = state.nodes;

  // maxSpeed
  _maxSpeed = 1;
  for (const seg of segments.values()) _maxSpeed = Math.max(_maxSpeed, seg.speedLimit);

  // segmentByPair
  _segmentByPair = new Map();
  for (const seg of segments.values()) {
    _segmentByPair.set(pairKey(seg.nodeA, seg.nodeB), seg);
  }

  _routeCache = new Map();
}

// Devuelve { route, laneSeq } desde cache, o computa y guarda. Devuelve null si no hay ruta.
export function cachedRoute(fromNodeId, toNodeId) {
  const key = fromNodeId * 1000000 + toNodeId;
  if (_routeCache) {
    if (_routeCache.has(key)) return _routeCache.get(key);
  }
  const route = findRoute(fromNodeId, toNodeId);
  if (!route || route.length < 2) {
    if (_routeCache) _routeCache.set(key, null);
    return null;
  }
  const laneSeq = _routeToLaneSequence(route);
  const result = laneSeq.length > 0 ? { route, laneSeq } : null;
  if (_routeCache) _routeCache.set(key, result);
  return result;
}

/**
 * A* pathfinding on the node graph.
 */
export function findRoute(fromNodeId, toNodeId) {
  if (fromNodeId === toNodeId) return [fromNodeId];

  const nodes    = state.nodes;
  const segments = state.segments;
  const maxSpeed = _maxSpeed;

  const toNode = nodes.get(toNodeId);
  if (!toNode) return null;

  function heuristic(nodeId) {
    const n = nodes.get(nodeId);
    if (!n) return 0;
    return Math.hypot(n.x - toNode.x, n.y - toNode.y) / maxSpeed;
  }

  const openSet = new Set([fromNodeId]);
  const cameFrom = new Map();
  const gScore = new Map();
  const fScore = new Map();

  gScore.set(fromNodeId, 0);
  fScore.set(fromNodeId, heuristic(fromNodeId));

  while (openSet.size > 0) {
    let current = null;
    let bestF = Infinity;
    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity;
      if (f < bestF) { bestF = f; current = id; }
    }

    if (current === toNodeId) {
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

    for (const seg of getNodeSegments(current)) {
      const goAtoB = seg.nodeA === current;
      if ((goAtoB ? seg.lanesAtoB : seg.lanesBtoA) <= 0) continue;

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

  return null;
}

function _routeToLaneSequence(routeNodeIds) {
  const sequence = [];
  for (let i = 0; i < routeNodeIds.length - 1; i++) {
    const fromNodeId = routeNodeIds[i];
    const toNodeId   = routeNodeIds[i + 1];
    const seg = _segmentByPair
      ? _segmentByPair.get(pairKey(fromNodeId, toNodeId))
      : _findSegBetween(fromNodeId, toNodeId);
    if (!seg) continue;

    const dir = (seg.nodeA === fromNodeId) ? "AtoB" : "BtoA";
    const totalLanes = (dir === "AtoB") ? seg.lanesAtoB : seg.lanesBtoA;
    if (totalLanes <= 0) continue;

    if (i + 2 < routeNodeIds.length) {
      const nextSeg = _segmentByPair
        ? _segmentByPair.get(pairKey(toNodeId, routeNodeIds[i + 2]))
        : _findSegBetween(toNodeId, routeNodeIds[i + 2]);
      if (nextSeg && nextSeg.id === seg.id && getNodeSegments(toNodeId).length > 1) return [];
    }

    sequence.push({ segId: seg.id, dir, laneIdx: 0 });
  }
  return sequence;
}

function _findSegBetween(a, b) {
  for (const seg of state.segments.values()) {
    if ((seg.nodeA === a && seg.nodeB === b) || (seg.nodeA === b && seg.nodeB === a)) return seg;
  }
  return null;
}

// Mantener compatibilidad con imports existentes
export function routeToLaneSequence(routeNodeIds) {
  return _routeToLaneSequence(routeNodeIds);
}
