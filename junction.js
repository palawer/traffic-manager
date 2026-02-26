import { LANE_WIDTH } from "./state.js";
import { normalizeAngle, junctionInset, laneEndpointWorld, buildConnectorBezier, polylineMetrics } from "./geometry.js";

/**
 * Classify a turn from inHeading (arriving) to outHeading (departing).
 * Returns "left", "straight", or "right"
 */
function classifyTurn(inHeading, outHeading) {
  const diff = normalizeAngle(outHeading - inHeading);
  if (Math.abs(diff) < Math.PI / 6) return "straight"; // < 30°
  if (diff > 0) return "left";
  return "right";
}

/**
 * Get the stop-line endpoint at nodeId for a lane ARRIVING at nodeId via seg.
 * heading = direction of travel (arriving at node).
 */
function getArrivalEndpoint(seg, nodes, segsAtNode, nodeId, laneIdx, dir) {
  return laneEndpointWorld(seg, nodes, segsAtNode, nodeId, laneIdx, dir);
}

/**
 * Get the stop-line endpoint at nodeId for a lane DEPARTING nodeId into seg.
 * heading = direction of travel (departing from node toward the other end).
 */
function getDepartureEndpoint(seg, nodes, segsAtNode, nodeId, laneIdx, dir) {
  const otherId = seg.nodeA === nodeId ? seg.nodeB : seg.nodeA;
  const node = nodes.get(nodeId);
  const other = nodes.get(otherId);
  if (!node || !other) return null;

  const headingOut = Math.atan2(other.y - node.y, other.x - node.x);
  const inset = junctionInset(seg, segsAtNode);
  const sx = node.x + Math.cos(headingOut) * inset;
  const sy = node.y + Math.sin(headingOut) * inset;

  const nodeA = nodes.get(seg.nodeA);
  const nodeB = nodes.get(seg.nodeB);
  if (!nodeA || !nodeB) return null;
  const axisHeading = Math.atan2(nodeB.y - nodeA.y, nodeB.x - nodeA.x);
  const axisRightX = -Math.sin(axisHeading);
  const axisRightY = Math.cos(axisHeading);

  const lateralSign = (dir === "AtoB") ? 1 : -1;
  const lateralOff = lateralSign * (laneIdx + 0.5) * LANE_WIDTH;

  return {
    x: sx + axisRightX * lateralOff,
    y: sy + axisRightY * lateralOff,
    heading: headingOut,
  };
}

/**
 * Build polygon for the junction area (for rendering).
 * segsAtNode: array of segments connected to nodeId
 */
function buildJunctionPolygon(nodeId, nodes, segsAtNode) {
  const node = nodes.get(nodeId);
  if (!node || segsAtNode.length < 2) return [];

  let maxHalf = 0;
  for (const seg of segsAtNode) {
    const half = (seg.lanesAtoB + seg.lanesBtoA) * LANE_WIDTH / 2;
    if (half > maxHalf) maxHalf = half;
  }

  // Sort segments by angle from node
  const segAngles = segsAtNode.map(seg => {
    const otherId = seg.nodeA === nodeId ? seg.nodeB : seg.nodeA;
    const other = nodes.get(otherId);
    return { seg, angle: Math.atan2(other.y - node.y, other.x - node.x) };
  }).sort((a, b) => a.angle - b.angle);

  const pts = [];
  const n = segAngles.length;

  for (let i = 0; i < n; i++) {
    const { seg, angle } = segAngles[i];
    const half = (seg.lanesAtoB + seg.lanesBtoA) * LANE_WIDTH / 2;
    const inset = junctionInset(seg, segsAtNode);

    const stopX = node.x + Math.cos(angle) * inset;
    const stopY = node.y + Math.sin(angle) * inset;
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);

    const rc = { x: stopX - perpX * half, y: stopY - perpY * half };
    const lc = { x: stopX + perpX * half, y: stopY + perpY * half };
    pts.push(rc);

    const next = segAngles[(i + 1) % n];
    const nextAngle = next.angle;
    const nextHalf = (next.seg.lanesAtoB + next.seg.lanesBtoA) * LANE_WIDTH / 2;
    const nextInset = junctionInset(next.seg, segsAtNode);
    const nextStopX = node.x + Math.cos(nextAngle) * nextInset;
    const nextStopY = node.y + Math.sin(nextAngle) * nextInset;
    const nextPerpX = -Math.sin(nextAngle);
    const nextPerpY = Math.cos(nextAngle);
    const nextRc = { x: nextStopX - nextPerpX * nextHalf, y: nextStopY - nextPerpY * nextHalf };

    // Fillet arc between lc and nextRc, curving around the node
    const aStart = Math.atan2(lc.y - node.y, lc.x - node.x);
    const aEnd = Math.atan2(nextRc.y - node.y, nextRc.x - node.x);
    const rFillet = Math.max(
      Math.hypot(lc.x - node.x, lc.y - node.y),
      Math.hypot(nextRc.x - node.x, nextRc.y - node.y),
      maxHalf + 2
    );

    let sweep = normalizeAngle(aEnd - aStart);
    if (sweep < 0) sweep += Math.PI * 2;
    const steps = Math.max(2, Math.ceil(sweep / 0.3));
    for (let k = 0; k <= steps; k++) {
      const a = aStart + (sweep * k) / steps;
      pts.push({ x: node.x + Math.cos(a) * rFillet, y: node.y + Math.sin(a) * rFillet });
    }
  }

  return pts;
}

/**
 * Build all default lane connectors for a junction node.
 * connectorIdRef: { value: number } — mutated to assign IDs
 */
function buildDefaultConnectors(nodeId, nodes, segsAtNode, connectorIdRef) {
  const connectors = [];
  if (segsAtNode.length < 2) return connectors;

  // Collect incoming lanes (arriving at nodeId)
  const incoming = [];
  for (const seg of segsAtNode) {
    if (seg.nodeB === nodeId) {
      // AtoB traffic arrives at nodeB
      for (let lane = 0; lane < seg.lanesAtoB; lane++) {
        const ep = getArrivalEndpoint(seg, nodes, segsAtNode, nodeId, lane, "AtoB");
        if (ep) incoming.push({ seg, dir: "AtoB", lane, ep });
      }
    }
    if (seg.nodeA === nodeId) {
      // BtoA traffic arrives at nodeA
      for (let lane = 0; lane < seg.lanesBtoA; lane++) {
        const ep = getArrivalEndpoint(seg, nodes, segsAtNode, nodeId, lane, "BtoA");
        if (ep) incoming.push({ seg, dir: "BtoA", lane, ep });
      }
    }
  }

  // Collect outgoing lanes (departing from nodeId)
  const outgoing = [];
  for (const seg of segsAtNode) {
    if (seg.nodeA === nodeId) {
      // AtoB traffic departs from nodeA
      for (let lane = 0; lane < seg.lanesAtoB; lane++) {
        const ep = getDepartureEndpoint(seg, nodes, segsAtNode, nodeId, lane, "AtoB");
        if (ep) outgoing.push({ seg, dir: "AtoB", lane, ep });
      }
    }
    if (seg.nodeB === nodeId) {
      // BtoA traffic departs from nodeB
      for (let lane = 0; lane < seg.lanesBtoA; lane++) {
        const ep = getDepartureEndpoint(seg, nodes, segsAtNode, nodeId, lane, "BtoA");
        if (ep) outgoing.push({ seg, dir: "BtoA", lane, ep });
      }
    }
  }

  for (const inc of incoming) {
    const inHeading = inc.ep.heading;
    const totalInLanes = (inc.dir === "AtoB") ? inc.seg.lanesAtoB : inc.seg.lanesBtoA;

    for (const out of outgoing) {
      if (out.seg.id === inc.seg.id) continue; // no U-turn on same segment

      const outHeading = out.ep.heading;
      const turnType = classifyTurn(inHeading, outHeading);
      const totalOutLanes = (out.dir === "AtoB") ? out.seg.lanesAtoB : out.seg.lanesBtoA;

      let allowed = false;
      if (turnType === "right") {
        allowed = (inc.lane === 0 && out.lane === 0);
      } else if (turnType === "left") {
        allowed = (inc.lane === totalInLanes - 1 && out.lane === totalOutLanes - 1);
      } else {
        // straight: lane i → min(i, M-1)
        allowed = (out.lane === Math.min(inc.lane, totalOutLanes - 1));
      }

      if (!allowed) continue;

      const pts = buildConnectorBezier(inc.ep, out.ep);
      const path = polylineMetrics(pts);

      connectors.push({
        id: connectorIdRef.value++,
        nodeId,
        inSegId: inc.seg.id,
        inDir: inc.dir,
        inLane: inc.lane,
        outSegId: out.seg.id,
        outDir: out.dir,
        outLane: out.lane,
        path,
        signalPhase: 0,
        userDefined: false,
      });
    }
  }

  return connectors;
}

/**
 * Build a complete junction (polygon + connectors) for a node.
 * connectorIdRef: { value: number } — mutated in place for ID assignment
 */
export function buildJunction(nodeId, nodes, segsAtNode, connectorIdRef) {
  const polygon = buildJunctionPolygon(nodeId, nodes, segsAtNode);
  const connectors = buildDefaultConnectors(nodeId, nodes, segsAtNode, connectorIdRef);
  return { polygon, connectors };
}
