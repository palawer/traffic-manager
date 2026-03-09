import { LANE_WIDTH } from "./state.js";
import { normalizeAngle, junctionInset, laneEndpointWorld, buildConnectorBezier, polylineMetrics, segmentDepartureHeading } from "./geometry.js";
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

    const angle = segmentDepartureHeading(seg, nodes, nodeId);
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

  if (segs.length === 2) {
    const a = segs[0];
    const b = segs[1];
    const pts = [a.minus, a.plus];

    const arcAB = buildConnectorBezier(
      { x: a.plus.x, y: a.plus.y, heading: a.angle + Math.PI },
      { x: b.minus.x, y: b.minus.y, heading: b.angle }
    );
    for (let i = 1; i < arcAB.length; i++) pts.push(arcAB[i]);

    pts.push(b.plus);

    const arcBA = buildConnectorBezier(
      { x: b.plus.x, y: b.plus.y, heading: b.angle + Math.PI },
      { x: a.minus.x, y: a.minus.y, heading: a.angle }
    );
    for (let i = 1; i < arcBA.length; i++) pts.push(arcBA[i]);

    return pts;
  }

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
  const isDeadEnd = segsAtNode.length === 1;
  const isSimpleBend = segsAtNode.length === 2;

  for (const inc of incomingLanes) {
    const inHeading = inc.ep.heading;
    const incSeg = segsAtNode.find(s => s.id === inc.segId);
    const totalInLanes = incSeg
      ? (inc.dir === "AtoB" ? incSeg.lanesAtoB : incSeg.lanesBtoA)
      : 1;
    let addedForIncoming = 0;

    for (const out of outgoingLanes) {
      const sameSegment = out.segId === inc.segId;
      if (sameSegment) {
        // Allow turn-back only at true dead-ends, and only to opposite direction.
        if (!isDeadEnd || out.dir === inc.dir) continue;
      }

      const outHeading = out.ep.heading;
      const turnType = classifyTurn(inHeading, outHeading);
      const outSeg = segsAtNode.find(s => s.id === out.segId);
      const totalOutLanes = outSeg
        ? (out.dir === "AtoB" ? outSeg.lanesAtoB : outSeg.lanesBtoA)
        : 1;

      let allowed = false;
      if (sameSegment && isDeadEnd) {
        // Dead-end turn-back: keep lane index when possible.
        allowed = (Math.min(inc.laneIdx, totalOutLanes - 1) === out.laneIdx)
               || (Math.min(out.laneIdx, totalInLanes - 1) === inc.laneIdx);
      } else if (isSimpleBend && !sameSegment) {
        // Two-road bend: lane continuity for all lanes.
        allowed = (Math.min(inc.laneIdx, totalOutLanes - 1) === out.laneIdx)
               || (Math.min(out.laneIdx, totalInLanes - 1) === inc.laneIdx);
      } else if (turnType === "right") {
        allowed = (inc.laneIdx === 0 && out.laneIdx === 0);
      } else if (turnType === "left") {
        allowed = (inc.laneIdx === totalInLanes - 1 && out.laneIdx === totalOutLanes - 1);
      } else {
        allowed = (Math.min(inc.laneIdx, totalOutLanes - 1) === out.laneIdx)
               || (Math.min(out.laneIdx, totalInLanes - 1) === inc.laneIdx);
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
      addedForIncoming++;
    }

    // Safety fallback: ensure every incoming lane has at least one exit trajectory.
    // This avoids "dead lanes" after changing lane counts.
    if (addedForIncoming === 0) {
      let bestOut = null;
      let bestScore = Infinity;

      for (const out of outgoingLanes) {
        const sameSegment = out.segId === inc.segId;
        if (sameSegment) {
          if (!isDeadEnd || out.dir === inc.dir) continue;
        }

        const outSeg = segsAtNode.find(s => s.id === out.segId);
        const totalOutLanes = outSeg
          ? (out.dir === "AtoB" ? outSeg.lanesAtoB : outSeg.lanesBtoA)
          : 1;
        const mappedLane = Math.min(inc.laneIdx, totalOutLanes - 1);
        if (out.laneIdx !== mappedLane) continue;

        const score = Math.abs(normalizeAngle(out.ep.heading - inHeading));
        if (score < bestScore) {
          bestScore = score;
          bestOut = out;
        }
      }

      if (bestOut) {
        const pts = buildConnectorBezier(inc.ep, bestOut.ep);
        const path = polylineMetrics(pts);
        connectors.push({
          id: connectorIdRef.value++,
          nodeId,
          inSegId: inc.segId,
          inDir: inc.dir,
          inLane: inc.laneIdx,
          outSegId: bestOut.segId,
          outDir: bestOut.dir,
          outLane: bestOut.laneIdx,
          path,
          signalPhase: 0,
          userDefined: false,
        });
      }
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
