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
