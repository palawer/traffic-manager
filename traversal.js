import { LANE_WIDTH } from "./state.js";
import { polylineMetrics, junctionInset, laneEndpointWorld, buildConnectorBezier, segmentDepartureHeading } from "./geometry.js";
import { getNodeSegments } from "./network.js";

/**
 * Build a PolylineMetrics for a lane on a segment, from the source node to the destination node.
 * The path starts at the stop-line at sourceNode and ends at the stop-line at destNode.
 */
export function buildSegmentLanePath(seg, nodes, dir, laneIdx) {
  const sourceNodeId = (dir === "AtoB") ? seg.nodeA : seg.nodeB;
  const destNodeId   = (dir === "AtoB") ? seg.nodeB : seg.nodeA;

  const sourceSegs = getNodeSegments(sourceNodeId);
  const destSegs   = getNodeSegments(destNodeId);

  // Start point: departure endpoint at sourceNode
  const startEp = getDepartureEndpointLocal(seg, nodes, sourceSegs, sourceNodeId, laneIdx, dir);
  // End point: arrival endpoint at destNode
  const endEp   = getArrivalEndpointLocal(seg, nodes, destSegs, destNodeId, laneIdx, dir);

  if (!startEp || !endEp) return polylineMetrics([]);

  // Curved segment: build a bezier arc matching the endpoint tangents
  if (seg.controlPoint) {
    const pts = buildConnectorBezier(startEp, endEp);
    return polylineMetrics(pts);
  }

  // Straight segment
  return polylineMetrics([
    { x: startEp.x, y: startEp.y },
    { x: endEp.x, y: endEp.y },
  ]);
}

/**
 * Departure endpoint at nodeId for dir/laneIdx (car leaves nodeId heading away).
 */
function getDepartureEndpointLocal(seg, nodes, segsAtNode, nodeId, laneIdx, dir) {
  const node = nodes.get(nodeId);
  if (!node) return null;

  const headingOut = segmentDepartureHeading(seg, nodes, nodeId);
  const inset = junctionInset(seg, segsAtNode);
  const sx = node.x + Math.cos(headingOut) * inset;
  const sy = node.y + Math.sin(headingOut) * inset;

  const rightX = -Math.sin(headingOut);
  const rightY =  Math.cos(headingOut);
  const lateralSign = (dir === "AtoB") ? 1 : -1;
  const lateralOff = (laneIdx + 0.5) * LANE_WIDTH
    + lateralSign * (seg.lanesBtoA - seg.lanesAtoB) * LANE_WIDTH / 2;

  return {
    x: sx + rightX * lateralOff,
    y: sy + rightY * lateralOff,
    heading: headingOut,
  };
}

/**
 * Arrival endpoint at nodeId for dir/laneIdx (car arrives at nodeId from the segment).
 */
function getArrivalEndpointLocal(seg, nodes, segsAtNode, nodeId, laneIdx, dir) {
  return laneEndpointWorld(seg, nodes, segsAtNode, nodeId, laneIdx, dir);
}

/**
 * Build the lane path for a car on a segment.
 * Returns polylineMetrics.
 */
export function buildLanePath(seg, nodes, dir, laneIdx) {
  return buildSegmentLanePath(seg, nodes, dir, laneIdx);
}
