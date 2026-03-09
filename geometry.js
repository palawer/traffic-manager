import { GRID, LANE_WIDTH } from "./state.js";
import { JUNCTION_PADDING, CONNECTOR_BEZIER_STEPS, CONNECTOR_BEZIER_FACTOR, CONNECTOR_BEZIER_MIN } from "./config.js";

export function snap(v, step = GRID) {
  return Math.round(v / step) * step;
}

export function rotatePoint(x, y, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c - y * s, y: x * s + y * c };
}

export function normalizeAngle(a) {
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

export function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return (r << 16) | (g << 8) | b;
}

export function polylineMetrics(points) {
  const cleaned = [];
  for (const p of points) {
    const prev = cleaned[cleaned.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 0.4) cleaned.push(p);
  }
  const usePoints = cleaned.length > 0 ? cleaned : points;
  const cumulative = [0];
  for (let i = 1; i < usePoints.length; i++) {
    const seg = Math.hypot(usePoints[i].x - usePoints[i - 1].x, usePoints[i].y - usePoints[i - 1].y);
    cumulative.push(cumulative[cumulative.length - 1] + seg);
  }
  return { points: usePoints, cumulative, length: cumulative[cumulative.length - 1] || 0 };
}

export function pointAtPath(path, s) {
  if (path.points.length === 0) return { x: 0, y: 0 };
  if (s <= 0) return path.points[0];
  if (s >= path.length) return path.points[path.points.length - 1];
  let i = 1;
  while (i < path.cumulative.length && path.cumulative[i] < s) i++;
  const p0 = path.points[i - 1];
  const p1 = path.points[i];
  const s0 = path.cumulative[i - 1];
  const s1 = path.cumulative[i];
  const t = (s - s0) / (s1 - s0 || 1);
  return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
}

export function headingAtPath(path, s) {
  const a = pointAtPath(path, Math.max(0, s - 2));
  const b = pointAtPath(path, Math.min(path.length, s + 2));
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function bezierPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const uu = u * u, tt = t * t, uuu = uu * u, ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

export function rightNormalForHeading(heading) {
  return { x: -Math.sin(heading), y: Math.cos(heading) };
}

export function leftNormalForHeading(heading) {
  return { x: Math.sin(heading), y: -Math.cos(heading) };
}

export function lineIntersection(p0, d0, p1, d1) {
  const det = d0.x * d1.y - d0.y * d1.x;
  if (Math.abs(det) < 1e-6) return null;
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const t = (dx * d1.y - dy * d1.x) / det;
  return { x: p0.x + d0.x * t, y: p0.y + d0.y * t };
}

export function buildBezierPolyline(p0, h0, p1, h1, handleLength, steps = 10) {
  const c1 = { x: p0.x + Math.cos(h0) * handleLength, y: p0.y + Math.sin(h0) * handleLength };
  const c2 = { x: p1.x - Math.cos(h1) * handleLength, y: p1.y - Math.sin(h1) * handleLength };
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push(bezierPoint(p0, c1, c2, p1, i / steps));
  return pts;
}

// --- Quadratic bezier helpers ---

/** Point on a quadratic bezier P0-CP-P1 at parameter t. */
export function quadraticBezierPoint(p0, cp, p1, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * cp.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * cp.y + t * t * p1.y,
  };
}

/** Sample a quadratic bezier as a polyline of (steps+1) points. */
export function sampleQuadraticBezier(p0, cp, p1, steps = 16) {
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push(quadraticBezierPoint(p0, cp, p1, i / steps));
  return pts;
}

/**
 * Tangent heading pointing AWAY from nodeId into the segment (departure direction).
 * Works for both straight segments and segments with a controlPoint.
 */
export function segmentDepartureHeading(seg, nodes, nodeId) {
  const node = nodes.get(nodeId);
  if (!node) return 0;
  if (seg.controlPoint) {
    return Math.atan2(seg.controlPoint.y - node.y, seg.controlPoint.x - node.x);
  }
  const otherId = seg.nodeA === nodeId ? seg.nodeB : seg.nodeA;
  const other = nodes.get(otherId);
  if (!other) return 0;
  return Math.atan2(other.y - node.y, other.x - node.x);
}

/**
 * Tangent heading pointing TOWARD nodeId from the segment (arrival direction).
 * Works for both straight segments and segments with a controlPoint.
 */
export function segmentArrivalHeading(seg, nodes, nodeId) {
  const node = nodes.get(nodeId);
  if (!node) return 0;
  if (seg.controlPoint) {
    return Math.atan2(node.y - seg.controlPoint.y, node.x - seg.controlPoint.x);
  }
  const otherId = seg.nodeA === nodeId ? seg.nodeB : seg.nodeA;
  const other = nodes.get(otherId);
  if (!other) return 0;
  return Math.atan2(node.y - other.y, node.x - other.x);
}

// --- New functions for node+segment model ---

/**
 * Returns the inset distance from a node for a given segment,
 * based on the widest road at that node.
 */
export function junctionInset(seg, allSegsAtNode) {
  const myHalf = (seg.lanesAtoB + seg.lanesBtoA) * LANE_WIDTH / 2;
  let maxHalf = myHalf;
  for (const other of allSegsAtNode) {
    if (other.id === seg.id) continue;
    const half = (other.lanesAtoB + other.lanesBtoA) * LANE_WIDTH / 2;
    if (half > maxHalf) maxHalf = half;
  }
  // If only one segment at node (dead-end), no inset needed
  if (allSegsAtNode.length <= 1) return 0;
  return maxHalf + JUNCTION_PADDING;
}

/**
 * Returns { x, y, heading } of lane i endpoint at the node end of the segment.
 * heading = direction of travel (arriving at node from the segment side).
 * dir: "AtoB" means cars travel from nodeA to nodeB on this lane group.
 * Lane 0 = closest to curb (rightmost of travel direction), higher = closer to center.
 */
export function laneEndpointWorld(seg, nodes, allSegsAtNode, nodeId, laneIdx, dir) {
  const otherNodeId = seg.nodeA === nodeId ? seg.nodeB : seg.nodeA;
  const node = nodes.get(nodeId);
  const other = nodes.get(otherNodeId);
  if (!node || !other) return null;

  // Local tangent heading arriving at nodeId (handles straight and curved segments).
  // headingIn encodes the direction of travel, so right-of-headingIn is always the
  // correct lane side: right-of-arrival for AtoB at nodeB, right-of-reverse for BtoA at nodeA.
  const headingIn = segmentArrivalHeading(seg, nodes, nodeId);

  const inset = junctionInset(seg, allSegsAtNode);
  const sx = node.x - Math.cos(headingIn) * inset;
  const sy = node.y - Math.sin(headingIn) * inset;

  const rightX = -Math.sin(headingIn);
  const rightY =  Math.cos(headingIn);
  const lateralSign = (dir === "AtoB") ? 1 : -1;
  const lateralOff = (laneIdx + 0.5) * LANE_WIDTH
    + lateralSign * (seg.lanesBtoA - seg.lanesAtoB) * LANE_WIDTH / 2;

  return {
    x: sx + rightX * lateralOff,
    y: sy + rightY * lateralOff,
    heading: headingIn,
  };
}

/**
 * Build a cubic bezier polyline connecting two lane endpoints through a junction.
 * fromEp/toEp: { x, y, heading } — heading = direction of travel (incoming at junction)
 * The bezier departs fromEp in the heading direction, arrives at toEp in the toEp heading direction.
 */
export function buildConnectorBezier(fromEp, toEp) {
  const dist = Math.hypot(toEp.x - fromEp.x, toEp.y - fromEp.y);
  const h = Math.max(dist * CONNECTOR_BEZIER_FACTOR, CONNECTOR_BEZIER_MIN);
  const c1 = {
    x: fromEp.x + Math.cos(fromEp.heading) * h,
    y: fromEp.y + Math.sin(fromEp.heading) * h,
  };
  const c2 = {
    x: toEp.x - Math.cos(toEp.heading) * h,
    y: toEp.y - Math.sin(toEp.heading) * h,
  };
  const pts = [];
  for (let i = 0; i <= CONNECTOR_BEZIER_STEPS; i++) pts.push(bezierPoint(fromEp, c1, c2, toEp, i / CONNECTOR_BEZIER_STEPS));
  return pts;
}
