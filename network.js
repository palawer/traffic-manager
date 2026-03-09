import { state } from "./state.js";

let nodeSegmentsCache = null;
let cacheNodesRef = null;
let cacheSegmentsRef = null;

function invalidateNodeSegmentsCache() {
  nodeSegmentsCache = null;
  cacheNodesRef = null;
  cacheSegmentsRef = null;
}

function ensureNodeSegmentsCache() {
  if (nodeSegmentsCache && cacheNodesRef === state.nodes && cacheSegmentsRef === state.segments) return;
  nodeSegmentsCache = new Map();
  cacheNodesRef = state.nodes;
  cacheSegmentsRef = state.segments;

  for (const nodeId of state.nodes.keys()) nodeSegmentsCache.set(nodeId, []);
  for (const seg of state.segments.values()) {
    if (!nodeSegmentsCache.has(seg.nodeA)) nodeSegmentsCache.set(seg.nodeA, []);
    if (!nodeSegmentsCache.has(seg.nodeB)) nodeSegmentsCache.set(seg.nodeB, []);
    nodeSegmentsCache.get(seg.nodeA).push(seg);
    nodeSegmentsCache.get(seg.nodeB).push(seg);
  }
}

export function addNode(x, y) {
  const id = state.nextNodeId++;
  state.nodes.set(id, { id, x, y });
  invalidateNodeSegmentsCache();
  state.networkDirty = true;
  return id;
}

export function addSegment(nodeAId, nodeBId, lanesAtoB = 1, lanesBtoA = 1, speedLimit = 80, geometry = null) {
  // Prevent duplicate segment between same two nodes
  for (const seg of state.segments.values()) {
    if ((seg.nodeA === nodeAId && seg.nodeB === nodeBId) ||
        (seg.nodeA === nodeBId && seg.nodeB === nodeAId)) {
      return seg.id;
    }
  }
  const id = state.nextSegmentId++;
  state.segments.set(id, { id, nodeA: nodeAId, nodeB: nodeBId, lanesAtoB, lanesBtoA, speedLimit, geometry });
  invalidateNodeSegmentsCache();
  state.networkDirty = true;
  return id;
}

/** Returns all segments connected to a node */
export function getNodeSegments(nodeId) {
  ensureNodeSegmentsCache();
  return nodeSegmentsCache.get(nodeId) || [];
}

export function markNetworkDirty() {
  state.networkDirty = true;
}

/**
 * Find the node at the end of a segment (given seg + dir of travel).
 * AtoB → nodeB; BtoA → nodeA
 */
export function getDestinationNode(seg, dir) {
  return dir === "AtoB" ? seg.nodeB : seg.nodeA;
}
