import { GRID, LANE_WIDTH } from "./state.js";

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
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

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
  const uu = u * u;
  const tt = t * t;
  const uuu = uu * u;
  const ttt = tt * t;
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
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const t = (dx * d1.y - dy * d1.x) / det;
  return { x: p0.x + d0.x * t, y: p0.y + d0.y * t };
}

export function buildArcWorld(center, radius, startAngle, endAngle, turnSign) {
  let delta = normalizeAngle(endAngle - startAngle);
  if (turnSign > 0 && delta < 0) delta += Math.PI * 2;
  if (turnSign < 0 && delta > 0) delta -= Math.PI * 2;
  const steps = Math.max(3, Math.ceil(Math.abs(delta) / 0.12));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (delta * i) / steps;
    pts.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
  return pts;
}

export function buildArcWorldByDelta(center, radius, startAngle, delta) {
  const steps = Math.max(3, Math.ceil(Math.abs(delta) / 0.12));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (delta * i) / steps;
    pts.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
  return pts;
}

export function buildBezierPolyline(p0, h0, p1, h1, handleLength, steps = 10) {
  const c1 = {
    x: p0.x + Math.cos(h0) * handleLength,
    y: p0.y + Math.sin(h0) * handleLength,
  };
  const c2 = {
    x: p1.x - Math.cos(h1) * handleLength,
    y: p1.y - Math.sin(h1) * handleLength,
  };
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push(bezierPoint(p0, c1, c2, p1, i / steps));
  return pts;
}

export function buildArc(radius, startAngle, endAngle, direction = -1) {
  const pts = [{ x: Math.cos(startAngle) * radius, y: Math.sin(startAngle) * radius }];
  const full = Math.PI * 2;
  let travel;
  if (direction < 0) {
    travel = startAngle - endAngle;
    while (travel < 0) travel += full;
  } else {
    travel = endAngle - startAngle;
    while (travel < 0) travel += full;
  }

  const stepAngle = 0.12;
  const steps = Math.max(1, Math.ceil(travel / stepAngle));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const a = direction < 0 ? startAngle - travel * t : startAngle + travel * t;
    pts.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
  }
  const endA = direction < 0 ? startAngle - travel : startAngle + travel;
  pts.push({ x: Math.cos(endA) * radius, y: Math.sin(endA) * radius });
  return pts;
}

export function intersectRayWithCircle(origin, dir, center, radius) {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const b = 2 * (ox * dir.x + oy * dir.y);
  const c = ox * ox + oy * oy - radius * radius;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / 2;
  const t2 = (-b + sqrtDisc) / 2;
  let t = Infinity;
  if (t1 >= 0) t = Math.min(t, t1);
  if (t2 >= 0) t = Math.min(t, t2);
  if (!Number.isFinite(t)) return null;
  return { x: origin.x + dir.x * t, y: origin.y + dir.y * t };
}

export function getRoundaboutLaneRadii(def) {
  const outer = def.radius + 12;
  const inner = outer - LANE_WIDTH;
  const divider = (inner + outer) * 0.5;
  const outerEdge = outer + LANE_WIDTH * 0.5;
  return { inner, outer, divider, outerEdge };
}
