import { polylineMetrics } from "./geometry.js";

// Cache: segId * 2 + (dir === "AtoB" ? 0 : 1) → path
// laneIdx ignorado — la geometría es la misma para todos los carriles del mismo sentido
let _cache = null;

export function initLanePathCache(segments, nodes) {
  _cache = new Map();
  for (const seg of segments.values()) {
    for (const dir of ["AtoB", "BtoA"]) {
      const key = seg.id * 2 + (dir === "AtoB" ? 0 : 1);
      _cache.set(key, _buildLanePath(seg, nodes, dir));
    }
  }
}

function _buildLanePath(seg, nodes, dir) {
  if (seg.geometry && seg.geometry.length >= 2) {
    const pts = dir === "AtoB" ? seg.geometry : [...seg.geometry].reverse();
    return polylineMetrics(pts);
  }
  const sourceNodeId = (dir === "AtoB") ? seg.nodeA : seg.nodeB;
  const destNodeId   = (dir === "AtoB") ? seg.nodeB : seg.nodeA;
  const source = nodes.get(sourceNodeId);
  const dest   = nodes.get(destNodeId);
  if (!source || !dest) return polylineMetrics([]);
  return polylineMetrics([{ x: source.x, y: source.y }, { x: dest.x, y: dest.y }]);
}

export function buildLanePath(seg, nodes, dir, laneIdx) {
  if (_cache) {
    const key = seg.id * 2 + (dir === "AtoB" ? 0 : 1);
    return _cache.get(key) ?? _buildLanePath(seg, nodes, dir);
  }
  return _buildLanePath(seg, nodes, dir);
}
