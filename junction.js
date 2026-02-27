import { LANE_WIDTH } from "./state.js";
import { normalizeAngle, junctionInset, laneEndpointWorld, buildConnectorBezier, polylineMetrics } from "./geometry.js";
import { STRAIGHT_THRESHOLD } from "./config.js";

/**
 * Classify a turn from inHeading (arriving) to outHeading (departing).
 * Returns "left", "straight", or "right"
 */
function classifyTurn(inHeading, outHeading) {
  const diff = normalizeAngle(outHeading - inHeading);
  if (Math.abs(diff) < STRAIGHT_THRESHOLD) return "straight";
  if (diff > 0) return "right";
  return "left";
}

/**
 * Get the stop-line endpoint at nodeId for a lane ARRIVING at nodeId via seg.
 */
function getArrivalEndpoint(seg, nodes, segsAtNode, nodeId, laneIdx, dir) {
  return laneEndpointWorld(seg, nodes, segsAtNode, nodeId, laneIdx, dir);
}

/**
 * Get the stop-line endpoint at nodeId for a lane DEPARTING nodeId into seg.
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
 * Collect all incoming and outgoing lane endpoints for a junction node.
 * Exported so the connector-tool editor and renderer can use them.
 */
export function collectLaneEndpoints(nodeId, nodes, segsAtNode) {
  const incomingLanes = [];
  const outgoingLanes = [];

  for (const seg of segsAtNode) {
    if (seg.nodeB === nodeId) {
      for (let lane = 0; lane < seg.lanesAtoB; lane++) {
        const ep = getArrivalEndpoint(seg, nodes, segsAtNode, nodeId, lane, "AtoB");
        if (ep) incomingLanes.push({ segId: seg.id, dir: "AtoB", laneIdx: lane, ep });
      }
    }
    if (seg.nodeA === nodeId) {
      for (let lane = 0; lane < seg.lanesBtoA; lane++) {
        const ep = getArrivalEndpoint(seg, nodes, segsAtNode, nodeId, lane, "BtoA");
        if (ep) incomingLanes.push({ segId: seg.id, dir: "BtoA", laneIdx: lane, ep });
      }
    }
    if (seg.nodeA === nodeId) {
      for (let lane = 0; lane < seg.lanesAtoB; lane++) {
        const ep = getDepartureEndpoint(seg, nodes, segsAtNode, nodeId, lane, "AtoB");
        if (ep) outgoingLanes.push({ segId: seg.id, dir: "AtoB", laneIdx: lane, ep });
      }
    }
    if (seg.nodeB === nodeId) {
      for (let lane = 0; lane < seg.lanesBtoA; lane++) {
        const ep = getDepartureEndpoint(seg, nodes, segsAtNode, nodeId, lane, "BtoA");
        if (ep) outgoingLanes.push({ segId: seg.id, dir: "BtoA", laneIdx: lane, ep });
      }
    }
  }

  return { incomingLanes, outgoingLanes };
}

/**
 * Build polygon for the junction area (for rendering).
 * The gap between adjacent road stop-lines is filled with a bezier arc
 * that uses the same headings as the outermost (lane-0) connector between
 * those two roads — so the junction outline follows the connector curves.
 */
function buildJunctionPolygon(nodeId, nodes, segsAtNode) {
  const node = nodes.get(nodeId);
  if (!node || segsAtNode.length < 2) return [];

  const segs = segsAtNode.map(seg => {
    const otherId = seg.nodeA === nodeId ? seg.nodeB : seg.nodeA;
    const other = nodes.get(otherId);
    if (!other) return null;

    const angle = Math.atan2(other.y - node.y, other.x - node.x);
    const half  = (seg.lanesAtoB + seg.lanesBtoA) * LANE_WIDTH / 2;
    const inset = junctionInset(seg, segsAtNode);

    const stopX = node.x + Math.cos(angle) * inset;
    const stopY = node.y + Math.sin(angle) * inset;
    const perpX = -Math.sin(angle);
    const perpY =  Math.cos(angle);

    const minus = { x: stopX - perpX * half, y: stopY - perpY * half };
    const plus  = { x: stopX + perpX * half, y: stopY + perpY * half };
    return { angle, minus, plus };
  }).filter(Boolean);

  segs.sort((a, b) => a.angle - b.angle);

  // For each pair of adjacent roads, the arc from plus_i → minus_{i+1} uses the
  // same headings as the outermost right-turn connector between those roads:
  //   fromEp.heading = arrival heading of road[i]   = angle_i + π  (toward node)
  //   toEp.heading   = departure heading of road[i+1] = angle_{i+1} (away from node)
  // Only apply the bezier for small angular gaps (< π). Large gaps (inside of bends,
  // back of T-junctions) stay as straight lines to avoid looping arcs.
  const pts = [];
  for (let i = 0; i < segs.length; i++) {
    const curr = segs[i];
    const next = segs[(i + 1) % segs.length];

    pts.push(curr.minus);
    pts.push(curr.plus);

    let gap = next.angle - curr.angle;
    if (gap <= 0) gap += 2 * Math.PI;

    if (gap < Math.PI) {
      const fromEp = { x: curr.plus.x,  y: curr.plus.y,  heading: curr.angle + Math.PI };
      const toEp   = { x: next.minus.x, y: next.minus.y, heading: next.angle };
      const arc = buildConnectorBezier(fromEp, toEp);
      for (let j = 1; j < arc.length; j++) pts.push(arc[j]);
    }
    // else: straight line from curr.plus to next.minus (implicit via polygon draw)
  }

  return pts;
}

/**
 * Build auto-generated lane connectors for a junction node.
 */
function buildDefaultConnectors(nodeId, nodes, segsAtNode, incomingLanes, outgoingLanes, connectorIdRef) {
  const connectors = [];
  if (incomingLanes.length === 0 || outgoingLanes.length === 0) return connectors;

  for (const inc of incomingLanes) {
    const inHeading = inc.ep.heading;
    const totalInLanes = segsAtNode.find(s => s.id === inc.segId)
      ? (inc.dir === "AtoB"
          ? segsAtNode.find(s => s.id === inc.segId).lanesAtoB
          : segsAtNode.find(s => s.id === inc.segId).lanesBtoA)
      : 1;

    for (const out of outgoingLanes) {
      if (out.segId === inc.segId) continue; // no U-turn

      const outHeading = out.ep.heading;
      const turnType = classifyTurn(inHeading, outHeading);
      const outSeg = segsAtNode.find(s => s.id === out.segId);
      const totalOutLanes = outSeg
        ? (out.dir === "AtoB" ? outSeg.lanesAtoB : outSeg.lanesBtoA)
        : 1;

      let allowed = false;
      if (turnType === "right") {
        allowed = (inc.laneIdx === 0 && out.laneIdx === 0);
      } else if (turnType === "left") {
        allowed = (inc.laneIdx === totalInLanes - 1 && out.laneIdx === totalOutLanes - 1);
      } else {
        allowed = (out.laneIdx === Math.min(inc.laneIdx, totalOutLanes - 1));
      }

      if (!allowed) continue;

      const pts = buildConnectorBezier(inc.ep, out.ep);
      const path = polylineMetrics(pts);

      connectors.push({
        id: connectorIdRef.value++,
        nodeId,
        inSegId: inc.segId,
        inDir: inc.dir,
        inLane: inc.laneIdx,
        outSegId: out.segId,
        outDir: out.dir,
        outLane: out.laneIdx,
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
 * userConnsForNode: Map<inKey, Set<outKey>> from state.userConnectors, or undefined.
 */
export function buildJunction(nodeId, nodes, segsAtNode, connectorIdRef, userConnsForNode) {
  const polygon = buildJunctionPolygon(nodeId, nodes, segsAtNode);
  const { incomingLanes, outgoingLanes } = collectLaneEndpoints(nodeId, nodes, segsAtNode);
  const connectors = buildDefaultConnectors(nodeId, nodes, segsAtNode, incomingLanes, outgoingLanes, connectorIdRef);

  // Apply user overrides: for each incoming lane that has user-defined connections,
  // replace the auto-generated connectors for that lane with user-defined ones.
  if (userConnsForNode && userConnsForNode.size > 0) {
    for (const [inKey, outKeys] of userConnsForNode) {
      if (outKeys.size === 0) continue;
      const [segIdStr, inDir, laneIdxStr] = inKey.split(":");
      const inSegId = parseInt(segIdStr);
      const inLane = parseInt(laneIdxStr);

      // Remove auto-generated connectors for this incoming lane
      for (let i = connectors.length - 1; i >= 0; i--) {
        const c = connectors[i];
        if (c.inSegId === inSegId && c.inDir === inDir && c.inLane === inLane) {
          connectors.splice(i, 1);
        }
      }

      const incLane = incomingLanes.find(l => l.segId === inSegId && l.dir === inDir && l.laneIdx === inLane);
      if (!incLane) continue;

      for (const outKey of outKeys) {
        const [oSegIdStr, oDir, oLaneIdxStr] = outKey.split(":");
        const oSegId = parseInt(oSegIdStr);
        const oLane = parseInt(oLaneIdxStr);
        const outLane = outgoingLanes.find(l => l.segId === oSegId && l.dir === oDir && l.laneIdx === oLane);
        if (!outLane) continue;

        const pts = buildConnectorBezier(incLane.ep, outLane.ep);
        const path = polylineMetrics(pts);
        connectors.push({
          id: connectorIdRef.value++,
          nodeId,
          inSegId, inDir, inLane,
          outSegId: oSegId, outDir: oDir, outLane: oLane,
          path,
          signalPhase: 0,
          userDefined: true,
        });
      }
    }
  }

  return { polygon, connectors, incomingLanes, outgoingLanes };
}
