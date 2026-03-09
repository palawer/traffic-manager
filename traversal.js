import { polylineMetrics } from "./geometry.js";

/**
 * Build the lane path for a car on a segment.
 * Uses real OSM geometry if available; otherwise a straight node-to-node line.
 */
export function buildLanePath(seg, nodes, dir, laneIdx) {
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
