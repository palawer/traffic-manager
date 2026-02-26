import { JOIN_ENTRY_OFFSET, JOIN_GRACE_TIME, JOIN_BLEND_HANDLE, LANE_OFFSET, LANE_WIDTH } from "./state.js";
import { PIECES } from "./pieces.js";
import {
  normalizeAngle,
  polylineMetrics,
  pointAtPath,
  headingAtPath,
  bezierPoint,
  buildArc,
  buildArcWorldByDelta,
  buildBezierPolyline,
  getRoundaboutLaneRadii,
  intersectRayWithCircle,
  rightNormalForHeading,
  leftNormalForHeading,
  lineIntersection,
} from "./geometry.js";
import { getWorldConnectors, pieceById, transformLocalPoint, connectorLanePointWorld } from "./network.js";

export function roundaboutExitOrdinal(fromConnectorIdx, toConnectorIdx) {
  const steps = (fromConnectorIdx - toConnectorIdx + 4) % 4;
  return steps === 0 ? 4 : steps;
}

export function junctionExitOrdinal(fromConnectorIdx, toConnectorIdx) {
  return (fromConnectorIdx - toConnectorIdx + 4) % 4;
}

export function buildTrafficLightPath(piece, fromConnectorIdx, toConnectorIdx) {
  const headingIn = normalizeAngle(PIECES[piece.type].connectors[fromConnectorIdx].dir + piece.rot + Math.PI);
  const headingOut = normalizeAngle(PIECES[piece.type].connectors[toConnectorIdx].dir + piece.rot);
  const p0 = connectorLanePointWorld(piece, fromConnectorIdx, headingIn);
  const p1 = connectorLanePointWorld(piece, toConnectorIdx, headingOut);

  const diff = Math.abs(normalizeAngle(headingOut - headingIn));
  if (Math.abs(diff - Math.PI) < 0.2) {
    return [p0, p1];
  }
  const d0 = { x: Math.cos(headingIn), y: Math.sin(headingIn) };
  const d1 = { x: Math.cos(headingOut), y: Math.sin(headingOut) };
  const corner = lineIntersection(p0, d0, p1, { x: -d1.x, y: -d1.y });
  if (!corner) {
    return buildBezierPolyline(p0, headingIn, p1, headingOut, 24, 12);
  }

  const inAvail = (corner.x - p0.x) * d0.x + (corner.y - p0.y) * d0.y;
  const outAvail = (p1.x - corner.x) * d1.x + (p1.y - corner.y) * d1.y;
  const maxRadius = Math.min(inAvail - 6, outAvail - 6, LANE_WIDTH * 0.9);
  const radius = Math.max(8, maxRadius);
  if (!(inAvail > 12 && outAvail > 12 && maxRadius > 7)) {
    return buildBezierPolyline(p0, headingIn, p1, headingOut, 24, 12);
  }

  const pA = { x: corner.x - d0.x * radius, y: corner.y - d0.y * radius };
  const pB = { x: corner.x + d1.x * radius, y: corner.y + d1.y * radius };
  const turnDelta = normalizeAngle(headingOut - headingIn);
  const turnSign = Math.sign(turnDelta) || 1;
  const normal = turnSign > 0 ? leftNormalForHeading(headingIn) : rightNormalForHeading(headingIn);
  const arcCenter = { x: pA.x + normal.x * radius, y: pA.y + normal.y * radius };
  const a0 = Math.atan2(pA.y - arcCenter.y, pA.x - arcCenter.x);
  const arc = buildArcWorldByDelta(arcCenter, radius, a0, turnDelta);

  return [p0, pA, ...arc.slice(1, -1), pB, p1];
}

export function buildRoundaboutPath(piece, fromConnectorIdx, toConnectorIdx) {
  const def = PIECES[piece.type];
  const inConn = def.connectors[fromConnectorIdx];
  const outConn = def.connectors[toConnectorIdx];
  const radii = getRoundaboutLaneRadii(def);

  const aIn = Math.atan2(inConn.y, inConn.x);
  const aOut = Math.atan2(outConn.y, outConn.x);
  const laneR = radii.outer;

  const headingIn = normalizeAngle(inConn.dir + piece.rot + Math.PI);
  const headingOut = normalizeAngle(outConn.dir + piece.rot);
  const entryLaneAtConnector = connectorLanePointWorld(piece, fromConnectorIdx, headingIn);
  const exitLaneAtConnector = connectorLanePointWorld(piece, toConnectorIdx, headingOut);
  const center = { x: piece.x, y: piece.y };
  const dirIn = { x: Math.cos(headingIn), y: Math.sin(headingIn) };
  const dirOut = { x: Math.cos(headingOut), y: Math.sin(headingOut) };
  const entryOnRing = intersectRayWithCircle(entryLaneAtConnector, dirIn, center, laneR);
  const exitOnRing = intersectRayWithCircle(exitLaneAtConnector, { x: -dirOut.x, y: -dirOut.y }, center, laneR);

  if (!entryOnRing || !exitOnRing) {
    const fallbackLocal = buildArc(laneR, aIn, aOut, -1);
    return fallbackLocal.map((p) => transformLocalPoint(piece, p));
  }

  const aEntry = Math.atan2(entryOnRing.y - center.y, entryOnRing.x - center.x);
  const aExit = Math.atan2(exitOnRing.y - center.y, exitOnRing.x - center.x);
  const ringPoints = buildArc(laneR, aEntry, aExit, -1).map((p) => ({
    x: center.x + p.x,
    y: center.y + p.y,
  }));

  return [entryLaneAtConnector, entryOnRing, ...ringPoints.slice(1, -1), exitOnRing, exitLaneAtConnector];
}

export function buildRoundaboutDeadEndTurnaround(piece, connectorIdx) {
  const wc = getWorldConnectors(piece)[connectorIdx];
  if (!wc) return [];

  const headingOut = normalizeAngle(wc.dir);
  const headingIn = normalizeAngle(headingOut + Math.PI);
  const pOut = connectorLanePointWorld(piece, connectorIdx, headingOut);
  const pIn = connectorLanePointWorld(piece, connectorIdx, headingIn);
  const radius = Math.max(6, Math.hypot(pOut.x - wc.x, pOut.y - wc.y));
  const startA = Math.atan2(pOut.y - wc.y, pOut.x - wc.x);
  const endA = Math.atan2(pIn.y - wc.y, pIn.x - wc.x);

  const cw = buildArc(radius, startA, endA, -1).map((p) => ({ x: wc.x + p.x, y: wc.y + p.y }));
  const ccw = buildArc(radius, startA, endA, 1).map((p) => ({ x: wc.x + p.x, y: wc.y + p.y }));

  const midCW = cw[Math.floor(cw.length / 2)];
  const midCCW = ccw[Math.floor(ccw.length / 2)];
  const aCW = Math.atan2(midCW.y - wc.y, midCW.x - wc.x);
  const aCCW = Math.atan2(midCCW.y - wc.y, midCCW.x - wc.x);
  const dCW = Math.abs(normalizeAngle(aCW - headingOut));
  const dCCW = Math.abs(normalizeAngle(aCCW - headingOut));

  return dCW <= dCCW ? cw : ccw;
}

export function buildTraversal(piece, fromConnectorIdx) {
  const def = PIECES[piece.type];
  if (piece.type === "traffic_light_cross") {
    const opposite = (fromConnectorIdx + 2) % 4;
    const exits = [0, 1, 2, 3].filter((i) => i !== fromConnectorIdx && i !== opposite);
    const toConnectorIdx = exits[Math.floor(Math.random() * exits.length)];
    const worldPoints = buildTrafficLightPath(piece, fromConnectorIdx, toConnectorIdx);
    return { path: polylineMetrics(worldPoints), toConnectorIdx };
  }

  if (!def.isRoundabout) {
    const toConnectorIdx = fromConnectorIdx === 0 ? 1 : 0;
    const c0 = def.connectors[fromConnectorIdx];
    const c1 = def.connectors[toConnectorIdx];
    const p0Base = transformLocalPoint(piece, c0);
    const p1Base = transformLocalPoint(piece, c1);

    if (piece.type === "straight") {
      const vx = p1Base.x - p0Base.x;
      const vy = p1Base.y - p0Base.y;
      const len = Math.hypot(vx, vy) || 1;
      const nx = vy / len;
      const ny = -vx / len;
      return {
        path: polylineMetrics([
          { x: p0Base.x - nx * LANE_OFFSET, y: p0Base.y - ny * LANE_OFFSET },
          { x: p1Base.x - nx * LANE_OFFSET, y: p1Base.y - ny * LANE_OFFSET },
        ]),
        toConnectorIdx,
      };
    }

    const centerW = transformLocalPoint(piece, def.center);
    const headingIn = normalizeAngle(c0.dir + piece.rot + Math.PI);
    const headingOut = normalizeAngle(c1.dir + piece.rot);
    const entryLaneAtConnector = connectorLanePointWorld(piece, fromConnectorIdx, headingIn);
    const exitLaneAtConnector = connectorLanePointWorld(piece, toConnectorIdx, headingOut);
    const direction = fromConnectorIdx === 0 ? -1 : 1;
    const laneRadius = def.radius + (direction < 0 ? LANE_OFFSET : -LANE_OFFSET);
    const dirIn = { x: Math.cos(headingIn), y: Math.sin(headingIn) };
    const dirOut = { x: Math.cos(headingOut), y: Math.sin(headingOut) };
    const entryOnArc = intersectRayWithCircle(entryLaneAtConnector, dirIn, centerW, laneRadius);
    const exitOnArc = intersectRayWithCircle(
      exitLaneAtConnector,
      { x: -dirOut.x, y: -dirOut.y },
      centerW,
      laneRadius
    );

    if (!entryOnArc || !exitOnArc) {
      const a0 = Math.atan2(p0Base.y - centerW.y, p0Base.x - centerW.x);
      const a1 = Math.atan2(p1Base.y - centerW.y, p1Base.x - centerW.x);
      const arcPointsFallback = buildArc(laneRadius, a0, a1, direction).map((p) => ({
        x: centerW.x + p.x,
        y: centerW.y + p.y,
      }));
      return { path: polylineMetrics(arcPointsFallback), toConnectorIdx };
    }

    const aEntry = Math.atan2(entryOnArc.y - centerW.y, entryOnArc.x - centerW.x);
    const aExit = Math.atan2(exitOnArc.y - centerW.y, exitOnArc.x - centerW.x);
    const arcPoints = buildArc(laneRadius, aEntry, aExit, direction).map((p) => ({
      x: centerW.x + p.x,
      y: centerW.y + p.y,
    }));
    const worldPoints = [entryLaneAtConnector, entryOnArc, ...arcPoints.slice(1, -1), exitOnArc, exitLaneAtConnector];
    return { path: polylineMetrics(worldPoints), toConnectorIdx };
  }

  const exits = [0, 1, 2, 3].filter((i) => i !== fromConnectorIdx);
  const toConnectorIdx = exits[Math.floor(Math.random() * exits.length)];
  const laneChoice = "outer";
  const worldPoints = buildRoundaboutPath(piece, fromConnectorIdx, toConnectorIdx);
  return { path: polylineMetrics(worldPoints), toConnectorIdx, laneChoice };
}

export function assignTraversal(car, nextPieceId, fromConnectorIdx) {
  const piece = pieceById(nextPieceId);
  if (!piece) return false;

  const traversal = buildTraversal(piece, fromConnectorIdx);
  if (!traversal || traversal.path.length < 1) return false;

  car.pieceId = piece.id;
  car.fromConnectorIdx = fromConnectorIdx;
  car.toConnectorIdx = traversal.toConnectorIdx;
  car.path = traversal.path;
  car.laneChoice = traversal.laneChoice || "right";
  car.exitOrdinal = PIECES[piece.type].isRoundabout
    ? roundaboutExitOrdinal(fromConnectorIdx, traversal.toConnectorIdx)
    : PIECES[piece.type].isTrafficLightCross
      ? junctionExitOrdinal(fromConnectorIdx, traversal.toConnectorIdx)
      : null;
  car.s = Math.min(JOIN_ENTRY_OFFSET, Math.max(0, car.path.length * 0.25));
  car.joinGrace = JOIN_GRACE_TIME;
  car.waiting = false;
  return true;
}

export function assignTraversalWithBlend(car, nextPiece, fromConnectorIdx) {
  const nextTraversal = buildTraversal(nextPiece, fromConnectorIdx);
  if (!nextTraversal || nextTraversal.path.length < 1) return false;

  const pStart = pointAtPath(car.path, car.path.length);
  const pEnd = nextTraversal.path.points[0];
  const gap = Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y);

  let combinedPath;
  if (gap < 4) {
    combinedPath = nextTraversal.path;
  } else {
    const hStart = headingAtPath(car.path, Math.max(0, car.path.length - 1));
    const hEnd = headingAtPath(nextTraversal.path, Math.min(nextTraversal.path.length, 2));
    const blend = buildBezierPolyline(pStart, hStart, pEnd, hEnd, JOIN_BLEND_HANDLE, 8);
    const combined = [...blend, ...nextTraversal.path.points.slice(1)];
    combinedPath = polylineMetrics(combined);
  }
  if (combinedPath.length < 1) return false;

  car.pieceId = nextPiece.id;
  car.fromConnectorIdx = fromConnectorIdx;
  car.toConnectorIdx = nextTraversal.toConnectorIdx;
  car.path = combinedPath;
  car.laneChoice = nextTraversal.laneChoice || "right";
  car.exitOrdinal = PIECES[nextPiece.type].isRoundabout
    ? roundaboutExitOrdinal(fromConnectorIdx, nextTraversal.toConnectorIdx)
    : PIECES[nextPiece.type].isTrafficLightCross
      ? junctionExitOrdinal(fromConnectorIdx, nextTraversal.toConnectorIdx)
      : null;
  car.s = gap < 4 ? 0 : Math.min(JOIN_ENTRY_OFFSET, Math.max(0, combinedPath.length * 0.25));
  car.joinGrace = JOIN_GRACE_TIME;
  car.waiting = false;
  return true;
}

export function buildTurnaroundTransition(piece, deadConnectorIdx, pStart, hStart, pEnd, hEnd) {
  const connector = getWorldConnectors(piece)[deadConnectorIdx];
  if (!connector) return [];
  const rStart = Math.hypot(pStart.x - connector.x, pStart.y - connector.y);
  const rEnd = Math.hypot(pEnd.x - connector.x, pEnd.y - connector.y);

  let transition = [];
  if (Math.abs(rStart - rEnd) < 2) {
    const startA = Math.atan2(pStart.y - connector.y, pStart.x - connector.x);
    const endA = Math.atan2(pEnd.y - connector.y, pEnd.x - connector.x);
    const tangentCW = startA - Math.PI / 2;
    const tangentCCW = startA + Math.PI / 2;
    const diffCW = Math.abs(normalizeAngle(tangentCW - hStart));
    const diffCCW = Math.abs(normalizeAngle(tangentCCW - hStart));
    const direction = diffCW <= diffCCW ? -1 : 1;

    const arcLocal = buildArc((rStart + rEnd) * 0.5, startA, endA, direction);
    transition = arcLocal.map((p) => ({ x: connector.x + p.x, y: connector.y + p.y }));
  } else {
    const turnRadius = Math.max(12, LANE_WIDTH * 0.6);
    const c1 = {
      x: pStart.x + Math.cos(hStart) * turnRadius,
      y: pStart.y + Math.sin(hStart) * turnRadius,
    };
    const c2 = {
      x: pEnd.x - Math.cos(hEnd) * turnRadius,
      y: pEnd.y - Math.sin(hEnd) * turnRadius,
    };
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      transition.push(bezierPoint(pStart, c1, c2, pEnd, i / steps));
    }
  }
  return transition;
}

export function assignTurnaroundTraversal(car, piece, deadConnectorIdx) {
  const reverseTraversal = buildTraversal(piece, deadConnectorIdx);
  if (!reverseTraversal || reverseTraversal.path.length < 1) return false;

  const pStart = pointAtPath(car.path, car.path.length);
  const hStart = headingAtPath(car.path, Math.max(0, car.path.length - 1));
  const pEnd = reverseTraversal.path.points[0];
  const hEnd = headingAtPath(reverseTraversal.path, 1);

  const transition = buildTurnaroundTransition(piece, deadConnectorIdx, pStart, hStart, pEnd, hEnd);
  if (transition.length < 2) return false;

  const combined = [...transition, ...reverseTraversal.path.points.slice(1)];
  const combinedPath = polylineMetrics(combined);
  if (combinedPath.length < 1) return false;

  car.pieceId = piece.id;
  car.fromConnectorIdx = deadConnectorIdx;
  car.toConnectorIdx = reverseTraversal.toConnectorIdx;
  car.path = combinedPath;
  car.exitOrdinal = null;
  car.s = 0;
  car.joinGrace = JOIN_GRACE_TIME;
  car.waiting = false;
  return true;
}

export function assignRoundaboutTurnaroundTraversal(car, piece, deadConnectorIdx) {
  const reentryTraversal = buildTraversal(piece, deadConnectorIdx);
  if (!reentryTraversal || reentryTraversal.path.length < 1) return false;

  const pStart = pointAtPath(car.path, car.path.length);
  const turnaround = buildRoundaboutDeadEndTurnaround(piece, deadConnectorIdx);
  if (turnaround.length < 2) return false;

  const combined = [pStart, ...turnaround.slice(1), ...reentryTraversal.path.points.slice(1)];
  const combinedPath = polylineMetrics(combined);
  if (combinedPath.length < 1) return false;

  car.pieceId = piece.id;
  car.fromConnectorIdx = deadConnectorIdx;
  car.toConnectorIdx = reentryTraversal.toConnectorIdx;
  car.path = combinedPath;
  car.exitOrdinal = roundaboutExitOrdinal(deadConnectorIdx, reentryTraversal.toConnectorIdx);
  car.s = 0;
  car.joinGrace = JOIN_GRACE_TIME;
  car.waiting = false;
  return true;
}
