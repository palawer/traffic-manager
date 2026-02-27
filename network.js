import { state } from "./state.js";
import { buildJunction } from "./junction.js";
import { saveState } from "./persistence.js";

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

/** Remove laneArrow entries that reference a deleted segment */
function pruneLaneArrowsForSeg(segId) {
  for (const key of state.laneArrows.keys()) {
    if (parseInt(key.split(":")[0]) === segId) state.laneArrows.delete(key);
  }
}

/** Remove userConnector entries that reference a deleted segment */
function pruneUserConnectorsForSeg(segId) {
  for (const [nodeId, nodeMap] of state.userConnectors) {
    for (const [inKey, outSet] of nodeMap) {
      if (parseInt(inKey.split(":")[0]) === segId) {
        nodeMap.delete(inKey);
        continue;
      }
      for (const outKey of outSet) {
        if (parseInt(outKey.split(":")[0]) === segId) outSet.delete(outKey);
      }
      if (outSet.size === 0) nodeMap.delete(inKey);
    }
    if (nodeMap.size === 0) state.userConnectors.delete(nodeId);
  }
}

export function addNode(x, y) {
  const id = state.nextNodeId++;
  state.nodes.set(id, { id, x, y });
  invalidateNodeSegmentsCache();
  state.networkDirty = true;
  return id;
}

export function removeNode(nodeId) {
  state.nodes.delete(nodeId);
  state.junctions.delete(nodeId);
  state.signals.delete(nodeId);
  state.userConnectors.delete(nodeId);
  // Remove all segments connected to this node
  for (const [segId, seg] of state.segments) {
    if (seg.nodeA === nodeId || seg.nodeB === nodeId) {
      state.segments.delete(segId);
      pruneLaneArrowsForSeg(segId);
      pruneUserConnectorsForSeg(segId);
      const otherId = seg.nodeA === nodeId ? seg.nodeB : seg.nodeA;
      state.junctions.delete(otherId);
    }
  }
  invalidateNodeSegmentsCache();
  state.networkDirty = true;
}

export function addSegment(nodeAId, nodeBId, lanesAtoB = 1, lanesBtoA = 1, speedLimit = 80) {
  // Prevent duplicate segment between same two nodes
  for (const seg of state.segments.values()) {
    if ((seg.nodeA === nodeAId && seg.nodeB === nodeBId) ||
        (seg.nodeA === nodeBId && seg.nodeB === nodeAId)) {
      return seg.id;
    }
  }
  const id = state.nextSegmentId++;
  state.segments.set(id, { id, nodeA: nodeAId, nodeB: nodeBId, lanesAtoB, lanesBtoA, speedLimit });
  invalidateNodeSegmentsCache();
  state.networkDirty = true;
  return id;
}

export function removeSegment(segId) {
  const seg = state.segments.get(segId);
  if (!seg) return;
  state.segments.delete(segId);
  pruneLaneArrowsForSeg(segId);
  pruneUserConnectorsForSeg(segId);
  state.junctions.delete(seg.nodeA);
  state.junctions.delete(seg.nodeB);
  invalidateNodeSegmentsCache();
  state.networkDirty = true;
}

/** Returns all segments connected to a node */
export function getNodeSegments(nodeId) {
  ensureNodeSegmentsCache();
  return nodeSegmentsCache.get(nodeId) || [];
}

/** Rebuild junction polygons and lane connectors for all nodes */
export function rebuildJunctions() {
  state.junctions.clear();
  // Reset connector IDs to keep them stable per rebuild
  // We use a shared counter across all junctions in this rebuild
  const connectorIdRef = { value: 1 };

  for (const nodeId of state.nodes.keys()) {
    const segs = getNodeSegments(nodeId);
    if (segs.length === 0) continue;
    const junction = buildJunction(nodeId, state.nodes, segs, connectorIdRef, state.userConnectors.get(nodeId));
    state.junctions.set(nodeId, junction);
  }
  state.nextConnectorId = connectorIdRef.value;
  state.networkDirty = false;
  saveState();
}

export function markNetworkDirty() {
  state.networkDirty = true;
}

/**
 * Given a car arriving at nodeId from inSegId/inDir/inLane,
 * find the connector that leads to outSegId/outDir/outLane (if provided),
 * or else return the first matching connector.
 */
export function findConnector(nodeId, inSegId, inDir, inLane, outSegId, outDir, outLane) {
  const junc = state.junctions.get(nodeId);
  if (!junc) return null;
  let sameSegFallback = null;
  for (const conn of junc.connectors) {
    if (conn.inSegId !== inSegId || conn.inDir !== inDir || conn.inLane !== inLane) continue;
    if (outSegId === undefined) return conn; // no filter — first match
    if (conn.outSegId === outSegId && conn.outDir === outDir) {
      if (outLane === undefined || conn.outLane === outLane) return conn; // exact match
      if (!sameSegFallback) sameSegFallback = conn; // same road, different lane
    }
  }
  // Only fall back to a connector that goes to the correct outSeg.
  // Never return a connector that sends the car to the wrong segment.
  return sameSegFallback;
}

/**
 * Find the node at the end of a segment (given seg + dir of travel).
 * AtoB → nodeB; BtoA → nodeA
 */
export function getDestinationNode(seg, dir) {
  return dir === "AtoB" ? seg.nodeB : seg.nodeA;
}

/**
 * Find the node at the start of a segment (given seg + dir of travel).
 */
export function getSourceNode(seg, dir) {
  return dir === "AtoB" ? seg.nodeA : seg.nodeB;
}
