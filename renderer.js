import { state, LANE_WIDTH, GRID, COLORS } from "./state.js";
import { SPEED_PRESETS, MAX_LANES, SPAWN_BATCH, EXPLOSION_MAX_RADIUS,
  CONNECTOR_PATH_WIDTH, CONNECTOR_PATH_COLOR, CONNECTOR_PATH_ALPHA,
  DEBUG_PATH_ALPHA, DEBUG_PATH_SEGMENT_WIDTH, DEBUG_PATH_CONNECTOR_WIDTH,
  DEBUG_GHOST_SECONDS, DEBUG_GHOST_ALPHA, DEBUG_GHOST_WIDTH,
  DEBUG_CURRENT_LANE_ALPHA, DEBUG_CURRENT_LANE_WIDTH,
  DEBUG_INVALID_COLOR, DEBUG_INVALID_ALPHA, DEBUG_INVALID_WIDTH,
  DEBUG_HEAT_LOW_COLOR, DEBUG_HEAT_HIGH_COLOR, DEBUG_HEAT_ALPHA,
  DEBUG_TEXT_COLOR, DEBUG_TEXT_BG_COLOR, DEBUG_TEXT_BG_ALPHA, DEBUG_TEXT_SIZE, DEBUG_TEXT_OFFSET_Y,
  CENTERLINE_WIDTH, CENTERLINE_DASH, CENTERLINE_GAP, LANE_DIVIDER_WIDTH,
  CROSSWALK_COLOR, CROSSWALK_STRIPE_WIDTH, CROSSWALK_STRIPE_GAP, CROSSWALK_DEPTH, CROSSWALK_LANE_GAP, CROSSWALK_ALPHA,
  GRID_LINE_WIDTH, ROAD_HOVER_STROKE_EXTRA, ROAD_HOVER_ALPHA, LANE_DIVIDER_DASH, LANE_DIVIDER_GAP,
  NODE_STROKE_WIDTH, NODE_STROKE_COLOR, NODE_STROKE_ALPHA,
  PREVIEW_INVALID_COLOR, PREVIEW_ALPHA, PREVIEW_SNAP_RADIUS, PREVIEW_SNAP_STROKE,
  ROUTE_GLOW_WIDTH, ROUTE_LINE_WIDTH, ROUTE_GLOW_ALPHA, ROUTE_LINE_ALPHA,
  ROUTE_PIN_RADIUS, ROUTE_PIN_SHADOW_ALPHA, ROUTE_PIN_FILL_ALPHA, ROUTE_PIN_BORDER_WIDTH, ROUTE_PIN_BORDER_ALPHA, ROUTE_PIN_DOT_ALPHA,
  CAR_BODY_HALF_LENGTH, CAR_BODY_HALF_WIDTH, CAR_CORNER_RADIUS, CAR_SELECTION_RADIUS, CAR_SELECTION_STROKE, CAR_SELECTION_ALPHA, CAR_STROKE_WIDTH, CAR_STROKE_SELECTED_WIDTH,
  EXPLOSION_RING_COLOR_START, EXPLOSION_RING_COLOR_END, EXPLOSION_SPARK_COLOR, EXPLOSION_SPARK_WIDTH,
  ARROW_GROUP_OFFSET, ARROW_TURN_ANGLE_DIVISOR, ARROW_HEAD_LENGTH, ARROW_HEAD_WIDTH, ARROW_FILL_COLOR, ARROW_FILL_ALPHA, ARROW_HOVER_ALPHA,
  SIGNAL_STROKE_WIDTH, SIGNAL_STROKE_COLOR, SIGNAL_STROKE_ALPHA, SIGNAL_TOOL_RING_RADIUS, SIGNAL_TOOL_RING_WIDTH, SIGNAL_TOOL_RING_COLOR, SIGNAL_TOOL_RING_ALPHA,
  SPEED_LABEL_TEXT_COLOR, SPEED_LABEL_BG_COLOR, SPEED_LABEL_ALPHA_ACTIVE, SPEED_LABEL_ALPHA_IDLE,
  CONNECTOR_NODE_RING_RADIUS, CONNECTOR_NODE_RING_WIDTH, CONNECTOR_NODE_RING_ALPHA, CONNECTOR_NODE_RING_COLOR, CONNECTOR_NODE_RING_HOVER_COLOR,
  CONNECTOR_DEFAULT_COLOR, CONNECTOR_USER_ALPHA, CONNECTOR_DIM_ALPHA, CONNECTOR_WIDTH, CONNECTOR_WIDTH_SELECTED,
  CONNECTOR_OUT_R, CONNECTOR_OUT_TARGET_R, CONNECTOR_OUT_EXTRA_R, CONNECTOR_OUT_STROKE, CONNECTOR_OUT_STROKE_COLOR,
  CONNECTOR_TARGET_FILL_ALPHA, CONNECTOR_OUT_IDLE_ALPHA, CONNECTOR_IN_R, CONNECTOR_IN_SELECTED_R, CONNECTOR_IN_SELECTED_EXTRA_R, CONNECTOR_SELECTED_HALO_COLOR, CONNECTOR_SELECTED_HALO_WIDTH, CONNECTOR_IN_SELECTED_FILL_COLOR,
  NODE_RADIUS, NODE_RADIUS_SELECTED, SIGNAL_RADIUS, ZOOM_MIN, ZOOM_MAX,
  SPEED_SIGN_RADIUS, SPEED_SIGN_FONT_SIZE, SPEED_SIGN_TEXT_RESOLUTION, SPEED_SIGN_BORDER_COLOR, SPEED_SIGN_BORDER_SIZE, SPEED_SIGN_BORDER_ALPHA, SPEED_SIGN_BG_ALPHA } from "./config.js";
import { pointAtPath, headingAtPath, junctionInset, buildConnectorBezier, hslToHex } from "./geometry.js";
import { rebuildJunctions, markNetworkDirty, getNodeSegments, findConnector } from "./network.js";
import { buildLanePath } from "./traversal.js";
import { saveState } from "./persistence.js";

const app = new PIXI.Application();
export let canvas = null;
let camera = null;
let gridGraphics = null;
let junctionGraphics = null;
let roadsGraphics = null;
let laneMarkingsGraphics = null;
let debugTrajectoriesGraphics = null;
let tmpeOverlayGraphics = null;
let connectorOverlayGraphics = null;
let routeGraphics = null;
let routePinGraphics = null;
let signalGraphics = null;
let nodeGraphics = null;
let previewGraphics = null;
let carsGraphics = null;
let explosionGraphics = null;
let carLabelsContainer = null;
let speedLabelsContainer = null;

export async function initRenderer() {
  const worldEl = document.getElementById("world");
  await app.init({
    resizeTo: worldEl,
    antialias: true,
    background: COLORS.bg,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  worldEl.appendChild(app.canvas);
  canvas = app.canvas;

  camera = new PIXI.Container();
  gridGraphics       = new PIXI.Graphics();
  junctionGraphics   = new PIXI.Graphics();
  roadsGraphics      = new PIXI.Graphics();
  laneMarkingsGraphics = new PIXI.Graphics();
  debugTrajectoriesGraphics = new PIXI.Graphics();
  tmpeOverlayGraphics  = new PIXI.Graphics();
  connectorOverlayGraphics = new PIXI.Graphics();
  routeGraphics        = new PIXI.Graphics();
  routePinGraphics     = new PIXI.Graphics();
  signalGraphics       = new PIXI.Graphics();
  nodeGraphics       = new PIXI.Graphics();
  previewGraphics    = new PIXI.Graphics();
  carsGraphics       = new PIXI.Graphics();
  explosionGraphics  = new PIXI.Graphics();
  carLabelsContainer = new PIXI.Container();
  speedLabelsContainer = new PIXI.Container();

  camera.addChild(gridGraphics);
  camera.addChild(junctionGraphics);
  camera.addChild(roadsGraphics);
  camera.addChild(laneMarkingsGraphics);
  camera.addChild(debugTrajectoriesGraphics);
  camera.addChild(speedLabelsContainer);
  camera.addChild(tmpeOverlayGraphics);
  camera.addChild(connectorOverlayGraphics);
  camera.addChild(routeGraphics);
  camera.addChild(signalGraphics);
  camera.addChild(nodeGraphics);
  camera.addChild(previewGraphics);
  camera.addChild(carsGraphics);
  camera.addChild(explosionGraphics);
  camera.addChild(carLabelsContainer);
  camera.addChild(routePinGraphics);
  app.stage.addChild(camera);

  return { app };
}

function rendererSize() {
  return { width: app.renderer.width, height: app.renderer.height };
}

export function worldToScreen(x, y) {
  const { width, height } = rendererSize();
  return {
    x: (x - state.view.x) * state.view.zoom + width / 2,
    y: (y - state.view.y) * state.view.zoom + height / 2,
  };
}

export function screenToWorld(x, y) {
  const { width, height } = rendererSize();
  return {
    x: (x - width / 2) / state.view.zoom + state.view.x,
    y: (y - height / 2) / state.view.zoom + state.view.y,
  };
}

export function applyCameraTransform() {
  const { width, height } = rendererSize();
  camera.scale.set(state.view.zoom, state.view.zoom);
  camera.position.set(
    width / 2 - state.view.x * state.view.zoom,
    height / 2 - state.view.y * state.view.zoom
  );
}

export function drawGrid() {
  const min = screenToWorld(0, 0);
  const { width, height } = rendererSize();
  const max = screenToWorld(width, height);
  const major = GRID * 5;

  gridGraphics.clear();
  for (let x = Math.floor(min.x / GRID) * GRID; x <= max.x; x += GRID) {
    const majorLine = Math.abs(x % major) < 0.001;
    gridGraphics.moveTo(x, min.y).lineTo(x, max.y);
    gridGraphics.stroke({ width: GRID_LINE_WIDTH, color: majorLine ? COLORS.gridMajor : COLORS.gridMinor });
  }
  for (let y = Math.floor(min.y / GRID) * GRID; y <= max.y; y += GRID) {
    const majorLine = Math.abs(y % major) < 0.001;
    gridGraphics.moveTo(min.x, y).lineTo(max.x, y);
    gridGraphics.stroke({ width: GRID_LINE_WIDTH, color: majorLine ? COLORS.gridMajor : COLORS.gridMinor });
  }
}

/** Get start/end points of a segment, inset from each node */
function segmentInsetPoints(seg) {
  const nodeA = state.nodes.get(seg.nodeA);
  const nodeB = state.nodes.get(seg.nodeB);
  if (!nodeA || !nodeB) return null;

  const dx = nodeB.x - nodeA.x;
  const dy = nodeB.y - nodeA.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;

  const segsAtA = getNodeSegments(seg.nodeA);
  const segsAtB = getNodeSegments(seg.nodeB);
  const insetA = junctionInset(seg, segsAtA);
  const insetB = junctionInset(seg, segsAtB);

  // Ensure insets don't exceed segment length
  const maxInset = (len - 10) / 2;
  const ia = Math.min(insetA, maxInset);
  const ib = Math.min(insetB, maxInset);

  return {
    pA: { x: nodeA.x + ux * ia, y: nodeA.y + uy * ia },
    pB: { x: nodeB.x - ux * ib, y: nodeB.y - uy * ib },
    ux, uy,
    totalWidth: (seg.lanesAtoB + seg.lanesBtoA) * LANE_WIDTH,
    heading: Math.atan2(dy, dx),
  };
}

function lerpColorHex(a, b, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * clamped);
  const g = Math.round(ag + (bg - ag) * clamped);
  const bl = Math.round(ab + (bb - ab) * clamped);
  return (r << 16) | (g << 8) | bl;
}

/**
 * For a node where exactly two segments meet, fill the bend by stroking
 * a bezier along the road centreline with the full road width.
 */
function drawBendJunction(g, nodeId, segs) {
  const node = state.nodes.get(nodeId);
  if (!node) return;
  const [s1, s2] = segs;

  const other1 = state.nodes.get(s1.nodeA === nodeId ? s1.nodeB : s1.nodeA);
  const other2 = state.nodes.get(s2.nodeA === nodeId ? s2.nodeB : s2.nodeA);
  if (!other1 || !other2) return;

  // Angle from node outward along each segment
  const a1 = Math.atan2(other1.y - node.y, other1.x - node.x);
  const a2 = Math.atan2(other2.y - node.y, other2.x - node.x);

  // Keep bend insets consistent with segment body clipping so wide roads
  // (many lanes) still connect smoothly on short segments.
  const rawInset1 = junctionInset(s1, segs);
  const rawInset2 = junctionInset(s2, segs);
  const len1 = Math.hypot(other1.x - node.x, other1.y - node.y) || 1;
  const len2 = Math.hypot(other2.x - node.x, other2.y - node.y) || 1;
  const inset1 = Math.min(rawInset1, Math.max(0, len1 - 5));
  const inset2 = Math.min(rawInset2, Math.max(0, len2 - 5));

  // Stop-line centres (road axis, no lane offset)
  const from = {
    x: node.x + Math.cos(a1) * inset1,
    y: node.y + Math.sin(a1) * inset1,
    heading: a1 + Math.PI,   // direction of travel arriving from s1
  };
  const to = {
    x: node.x + Math.cos(a2) * inset2,
    y: node.y + Math.sin(a2) * inset2,
    heading: a2,              // direction of travel departing into s2
  };

  const pts = buildConnectorBezier(from, to);
  const w = Math.max(
    (s1.lanesAtoB + s1.lanesBtoA) * LANE_WIDTH,
    (s2.lanesAtoB + s2.lanesBtoA) * LANE_WIDTH
  );

  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.stroke({ width: w, color: COLORS.road, cap: "round", join: "round" });
}

export function drawRoads() {
  if (state.networkDirty) rebuildJunctions();

  roadsGraphics.clear();
  laneMarkingsGraphics.clear();
  debugTrajectoriesGraphics.clear();
  junctionGraphics.clear();

  const lw = LANE_DIVIDER_WIDTH;
  const pendingStopLines = [];

  // Draw junctions
  for (const [nodeId, junc] of state.junctions) {
    const segsAtNode = getNodeSegments(nodeId);
    if (segsAtNode.length === 2) {
      // Use dedicated bend fill for 2-road nodes so the join follows smooth arcs
      // instead of closing with a diagonal polygon edge.
      drawBendJunction(junctionGraphics, nodeId, segsAtNode);
      continue;
    }
    if (junc.polygon && junc.polygon.length >= 3) {
      // Use the computed junction outline for both bends and intersections.
      // This keeps both sides consistent and follows connector geometry.
      const flat = junc.polygon.flatMap(p => [p.x, p.y]);
      junctionGraphics.poly(flat);
      junctionGraphics.fill(COLORS.junction);
    }
  }

  // Draw segment bodies
  for (const seg of state.segments.values()) {
    const ip = segmentInsetPoints(seg);
    if (!ip) continue;
    const { pA, pB, totalWidth } = ip;

    roadsGraphics.moveTo(pA.x, pA.y).lineTo(pB.x, pB.y);
    roadsGraphics.stroke({ width: totalWidth, color: COLORS.road, cap: "butt" });
  }

  // Round cap on free ends (nodes connected to exactly one segment).
  for (const node of state.nodes.values()) {
    const segs = getNodeSegments(node.id);
    if (segs.length !== 1) continue;
    const seg = segs[0];
    const totalWidth = (seg.lanesAtoB + seg.lanesBtoA) * LANE_WIDTH;
    roadsGraphics.circle(node.x, node.y, totalWidth / 2);
    roadsGraphics.fill(COLORS.road);
  }

  // Speed-tool hover highlight
  if (state.tool === "speed" && state.hoveredSegId !== null) {
    const hSeg = state.segments.get(state.hoveredSegId);
    if (hSeg) {
      const hip = segmentInsetPoints(hSeg);
      if (hip) {
        roadsGraphics.moveTo(hip.pA.x, hip.pA.y).lineTo(hip.pB.x, hip.pB.y);
        roadsGraphics.stroke({ width: hip.totalWidth + ROAD_HOVER_STROKE_EXTRA, color: SPEED_LABEL_BG_COLOR, alpha: ROAD_HOVER_ALPHA, cap: "butt" });
      }
    }
  }

  // Draw lane markings
  for (const seg of state.segments.values()) {
    const ip = segmentInsetPoints(seg);
    if (!ip) continue;
    const { pA, pB, ux, uy, totalWidth, heading } = ip;

    // Perpendicular (right normal)
    const nx = -uy, ny = ux;
    const halfW = totalWidth / 2;

    // Crosswalks exist at junction ends (nodes with ≠ 2 segments).
    // Lane markings are clipped to the far edge of the crosswalk so they
    // don't run through the zebra stripes.
    const hasXwalkA = getNodeSegments(seg.nodeA).length !== 2;
    const hasXwalkB = getNodeSegments(seg.nodeB).length !== 2;
    const markClip = CROSSWALK_DEPTH + CROSSWALK_LANE_GAP;
    const clA = hasXwalkA ? { x: pA.x + ux * markClip, y: pA.y + uy * markClip } : pA;
    const clB = hasXwalkB ? { x: pB.x - ux * markClip, y: pB.y - uy * markClip } : pB;

    // Centerline (yellow dashes if 2-way). Pass-through bends handled by drawBendCenterline.
    if (seg.lanesAtoB > 0 && seg.lanesBtoA > 0) {
      drawDashedLine(laneMarkingsGraphics, clA, clB, 0, CENTERLINE_WIDTH, COLORS.centerline, CENTERLINE_DASH, CENTERLINE_GAP);
    }

    // Inner lane dividers (AtoB side)
    for (let i = 1; i < seg.lanesAtoB; i++) {
      const off = i * LANE_WIDTH;
      drawDashedLine(
        laneMarkingsGraphics,
        { x: clA.x + nx * off, y: clA.y + ny * off },
        { x: clB.x + nx * off, y: clB.y + ny * off },
        0, lw, COLORS.laneDivider, LANE_DIVIDER_DASH, LANE_DIVIDER_GAP
      );
    }

    // Inner lane dividers (BtoA side)
    for (let i = 1; i < seg.lanesBtoA; i++) {
      const off = -i * LANE_WIDTH;
      drawDashedLine(
        laneMarkingsGraphics,
        { x: clA.x + nx * off, y: clA.y + ny * off },
        { x: clB.x + nx * off, y: clB.y + ny * off },
        0, lw, COLORS.laneDivider, LANE_DIVIDER_DASH, LANE_DIVIDER_GAP
      );
    }

    // Crosswalks — skip pass-through nodes (exactly 2 segments).
    // dir: +1 = move in road direction (away from nodeA), -1 = against it (away from nodeB).
    if (hasXwalkA) pendingStopLines.push({ pt: pA, nx, ny, halfW, dir: +1 });
    if (hasXwalkB) pendingStopLines.push({ pt: pB, nx, ny, halfW, dir: -1 });
  }

  // Draw connector paths — skip pass-through nodes (exactly 2 segments).
  for (const [nodeId, junc] of state.junctions) {
    if (getNodeSegments(nodeId).length === 2) continue;
    for (const conn of junc.connectors) {
      const pts = conn.path.points;
      if (pts.length < 2) continue;
      laneMarkingsGraphics.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) laneMarkingsGraphics.lineTo(pts[i].x, pts[i].y);
      laneMarkingsGraphics.stroke({ width: CONNECTOR_PATH_WIDTH, color: CONNECTOR_PATH_COLOR, alpha: CONNECTOR_PATH_ALPHA });
    }
  }

  // Solid yellow centerline through pass-through bends.
  for (const [nodeId] of state.junctions) {
    const segs = getNodeSegments(nodeId);
    if (segs.length !== 2) continue;
    drawBendCenterline(laneMarkingsGraphics, nodeId, segs);
  }

  // Draw crosswalks above intersection trajectories, shifted half-depth into the segment.
  for (const s of pendingStopLines) {
    const rdx = s.ny, rdy = -s.nx; // road-direction unit vector
    const shift = s.dir * CROSSWALK_DEPTH / 2;
    const pt = { x: s.pt.x + rdx * shift, y: s.pt.y + rdy * shift };
    drawCrosswalk(laneMarkingsGraphics, pt, s.nx, s.ny, s.halfW);
  }

  if (state.debugLanes) {
    const lineW = DEBUG_PATH_SEGMENT_WIDTH;
    const connectorW = DEBUG_PATH_CONNECTOR_WIDTH;
    const segLoad = new Map();
    for (const car of state.cars) {
      if (car.phase !== "segment") continue;
      segLoad.set(car.segId, (segLoad.get(car.segId) || 0) + 1);
    }

    for (const seg of state.segments.values()) {
      const ip = segmentInsetPoints(seg);
      if (!ip) continue;
      const count = segLoad.get(seg.id) || 0;
      const laneCap = Math.max(1, seg.lanesAtoB + seg.lanesBtoA);
      const ratio = Math.min(1, count / (laneCap * 2));
      const heatColor = lerpColorHex(DEBUG_HEAT_LOW_COLOR, DEBUG_HEAT_HIGH_COLOR, ratio);
      debugTrajectoriesGraphics.moveTo(ip.pA.x, ip.pA.y).lineTo(ip.pB.x, ip.pB.y);
      debugTrajectoriesGraphics.stroke({
        width: ip.totalWidth,
        color: heatColor,
        alpha: DEBUG_HEAT_ALPHA,
        pixelLine: false,
      });
    }

    // 1) Segment lane centerlines: exactly where cars run on segments.
    for (const seg of state.segments.values()) {
      for (let lane = 0; lane < seg.lanesAtoB; lane++) {
        const path = buildLanePath(seg, state.nodes, "AtoB", lane);
        if (!path || path.points.length < 2) continue;
        debugTrajectoriesGraphics.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) debugTrajectoriesGraphics.lineTo(path.points[i].x, path.points[i].y);
        debugTrajectoriesGraphics.stroke({
          width: lineW,
          color: COLORS.debugLane,
          alpha: DEBUG_PATH_ALPHA,
          pixelLine: true,
        });
      }
      for (let lane = 0; lane < seg.lanesBtoA; lane++) {
        const path = buildLanePath(seg, state.nodes, "BtoA", lane);
        if (!path || path.points.length < 2) continue;
        debugTrajectoriesGraphics.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) debugTrajectoriesGraphics.lineTo(path.points[i].x, path.points[i].y);
        debugTrajectoriesGraphics.stroke({
          width: lineW,
          color: COLORS.debugLane,
          alpha: DEBUG_PATH_ALPHA,
          pixelLine: true,
        });
      }
    }

    // 2) Junction connectors: all real intersection trajectories.
    for (const [, junc] of state.junctions) {
      for (const conn of junc.connectors) {
        const pts = conn.path.points;
        if (!pts || pts.length < 2) continue;
        debugTrajectoriesGraphics.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) debugTrajectoriesGraphics.lineTo(pts[i].x, pts[i].y);
        debugTrajectoriesGraphics.stroke({
          width: connectorW,
          color: COLORS.debugLane,
          alpha: DEBUG_PATH_ALPHA,
          pixelLine: true,
        });
      }
    }
  }

  // Draw node handles
  drawNodes();
}

/**
 * Draw a zebra-crossing pattern centred at pt.
 * Stripes run parallel to the road and fill its full width.
 */
function drawCrosswalk(g, pt, nx, ny, halfW) {
  const rdx = ny, rdy = -nx; // road-direction unit vector
  const sw     = CROSSWALK_STRIPE_WIDTH;
  const gap    = CROSSWALK_STRIPE_GAP;
  const period = sw + gap;
  // Walk across the road width, centring the pattern.
  let off = -halfW + sw / 2;
  while (off <= halfW - sw / 2 + 0.01) {
    const cx = pt.x + nx * off, cy = pt.y + ny * off;
    g.moveTo(cx - rdx * CROSSWALK_DEPTH / 2, cy - rdy * CROSSWALK_DEPTH / 2);
    g.lineTo(cx + rdx * CROSSWALK_DEPTH / 2, cy + rdy * CROSSWALK_DEPTH / 2);
    g.stroke({ width: sw, color: CROSSWALK_COLOR, alpha: CROSSWALK_ALPHA });
    off += period;
  }
}

/**
 * Draw a solid yellow centerline through a pass-through bend (exactly 2 segments).
 * Only drawn for bidirectional roads. Uses the same bezier geometry as drawBendJunction.
 */
function drawBendCenterline(g, nodeId, segs) {
  const node = state.nodes.get(nodeId);
  if (!node) return;
  const [s1, s2] = segs;
  if (!(s1.lanesAtoB > 0 && s1.lanesBtoA > 0) || !(s2.lanesAtoB > 0 && s2.lanesBtoA > 0)) return;

  const other1 = state.nodes.get(s1.nodeA === nodeId ? s1.nodeB : s1.nodeA);
  const other2 = state.nodes.get(s2.nodeA === nodeId ? s2.nodeB : s2.nodeA);
  if (!other1 || !other2) return;

  const a1 = Math.atan2(other1.y - node.y, other1.x - node.x);
  const a2 = Math.atan2(other2.y - node.y, other2.x - node.x);
  const len1 = Math.hypot(other1.x - node.x, other1.y - node.y) || 1;
  const len2 = Math.hypot(other2.x - node.x, other2.y - node.y) || 1;
  const inset1 = Math.min(junctionInset(s1, segs), Math.max(0, len1 - 5));
  const inset2 = Math.min(junctionInset(s2, segs), Math.max(0, len2 - 5));

  const from = { x: node.x + Math.cos(a1) * inset1, y: node.y + Math.sin(a1) * inset1, heading: a1 + Math.PI };
  const to   = { x: node.x + Math.cos(a2) * inset2, y: node.y + Math.sin(a2) * inset2, heading: a2 };

  const pts = buildConnectorBezier(from, to);
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.stroke({ width: CENTERLINE_WIDTH, color: COLORS.centerline });
}

function drawDashedLine(g, pA, pB, offset, lw, color, dashLen, gapLen) {
  const dx = pB.x - pA.x, dy = pB.y - pA.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len;
  const period = dashLen + gapLen;
  let t = offset;
  while (t < len) {
    const dashEnd = Math.min(t + dashLen, len);
    g.moveTo(pA.x + ux * t, pA.y + uy * t);
    g.lineTo(pA.x + ux * dashEnd, pA.y + uy * dashEnd);
    g.stroke({ width: lw, color });
    t += period;
  }
}

function drawNodes() {
  nodeGraphics.clear();
  for (const node of state.nodes.values()) {
    const isSelected = (node.id === state.selectedNodeId);
    const isHovered = (node.id === state.hoveredNodeId);
    if (!isSelected && !isHovered && getNodeSegments(node.id).length === 2) continue;
    const color = isSelected ? COLORS.nodeSelected : isHovered ? COLORS.nodeHover : COLORS.nodeDefault;
    const radius = isSelected ? NODE_RADIUS_SELECTED : NODE_RADIUS;
    nodeGraphics.circle(node.x, node.y, radius);
    nodeGraphics.fill(color);
    nodeGraphics.stroke({ width: NODE_STROKE_WIDTH, color: NODE_STROKE_COLOR, alpha: NODE_STROKE_ALPHA });
  }
}

export function drawPreview() {
  previewGraphics.clear();
  if (!state.drawingSegment) return;

  const fromNode = state.nodes.get(state.drawingSegment.fromNodeId);
  if (!fromNode) return;

  const to = state.drawingSegment.toWorld || state.lastMouse;
  if (!to) return;

  const totalWidth = 2 * LANE_WIDTH; // default 1+1
  const invalid = !!state.drawingSegment.invalid;
  previewGraphics.moveTo(fromNode.x, fromNode.y).lineTo(to.x, to.y);
  previewGraphics.stroke({
    width: totalWidth,
    color: invalid ? PREVIEW_INVALID_COLOR : COLORS.previewRoad,
    alpha: PREVIEW_ALPHA,
    cap: "round",
  });

  // Show snap circle at destination
  if (state.drawingSegment.snapNodeId) {
    previewGraphics.circle(to.x, to.y, PREVIEW_SNAP_RADIUS);
    previewGraphics.stroke({ width: PREVIEW_SNAP_STROKE, color: COLORS.nodeSelected });
  }
}

export function drawSelectedCarRoute() {
  routeGraphics.clear();
  routePinGraphics.clear();
  if (state.selectedCarId === null) return;
  const car = state.cars.find(c => c.id === state.selectedCarId);
  if (!car) { state.selectedCarId = null; return; }

  const color = car.color;
  const glow = ROUTE_GLOW_WIDTH;
  const thin = ROUTE_LINE_WIDTH;

  function getPreviewConnector(nodeId, inSegId, inDir, inLaneIdx, nextStep) {
    if (nextStep) {
      const exact = findConnector(
        nodeId, inSegId, inDir, inLaneIdx,
        nextStep.segId, nextStep.dir, nextStep.laneIdx
      );
      if (exact) return exact;
    }
    return findConnector(nodeId, inSegId, inDir, inLaneIdx);
  }

  function strokePolyline(path, fromS = 0) {
    if (!path || path.points.length < 2) return;
    const currPos = pointAtPath(path, fromS);
    // Find first point index strictly after fromS
    let idx = 0;
    while (idx < path.cumulative.length - 1 && path.cumulative[idx] <= fromS) idx++;
    const pts = [currPos, ...path.points.slice(idx)];
    if (pts.length < 2) return;
    // Glow pass
    routeGraphics.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) routeGraphics.lineTo(pts[i].x, pts[i].y);
    routeGraphics.stroke({ width: glow, color, alpha: ROUTE_GLOW_ALPHA });
    // Line pass
    routeGraphics.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) routeGraphics.lineTo(pts[i].x, pts[i].y);
    routeGraphics.stroke({ width: thin, color, alpha: ROUTE_LINE_ALPHA });
  }

  // 1. Remaining current phase path
  if (car.phase === "segment" && car.path) {
    strokePolyline(car.path, car.s);
  } else if (car.phase === "junction" && car.junctionPath) {
    strokePolyline(car.junctionPath, car.junctionS);
  }

  if (!car.laneSeq) return;
  const nextStepIdx = car.routeStep + 1;

  // 2. Connector from current segment to next step (segment phase only)
  if (car.phase === "segment" && nextStepIdx < car.laneSeq.length) {
    // When routeStep = -1 (rerouted, waiting at stop line) use the car's live position
    const inSegId   = car.routeStep >= 0 ? car.laneSeq[car.routeStep].segId    : car.segId;
    const inDir     = car.routeStep >= 0 ? car.laneSeq[car.routeStep].dir      : car.dir;
    const inLaneIdx = car.routeStep >= 0 ? car.laneSeq[car.routeStep].laneIdx  : car.laneIdx;
    const nextStep  = car.laneSeq[nextStepIdx];
    const inSeg = state.segments.get(inSegId);
    if (inSeg) {
      const destNodeId = (inDir === "AtoB") ? inSeg.nodeB : inSeg.nodeA;
      const conn = getPreviewConnector(destNodeId, inSegId, inDir, inLaneIdx, nextStep);
      if (conn) strokePolyline(conn.path, 0);
    }
  }

  // 3. All future laneSeq steps + connectors between them
  for (let i = nextStepIdx; i < car.laneSeq.length; i++) {
    const step = car.laneSeq[i];
    const seg = state.segments.get(step.segId);
    if (!seg) continue;
    strokePolyline(buildLanePath(seg, state.nodes, step.dir, step.laneIdx), 0);

    if (i + 1 < car.laneSeq.length) {
      const nextStep = car.laneSeq[i + 1];
      const destNodeId = (step.dir === "AtoB") ? seg.nodeB : seg.nodeA;
      const conn = getPreviewConnector(destNodeId, step.segId, step.dir, step.laneIdx, nextStep);
      if (conn) strokePolyline(conn.path, 0);
    }
  }

  // 4. Destination pin
  if (car.route && car.route.length > 0) {
    const destNode = state.nodes.get(car.route[car.route.length - 1]);
    if (destNode) {
      const pinR  = ROUTE_PIN_RADIUS;
      // Shadow
      routePinGraphics.circle(destNode.x, destNode.y, pinR * 1.1);
      routePinGraphics.fill({ color: NODE_STROKE_COLOR, alpha: ROUTE_PIN_SHADOW_ALPHA });

      // Main circle
      routePinGraphics.circle(destNode.x, destNode.y, pinR);
      routePinGraphics.fill({ color, alpha: ROUTE_PIN_FILL_ALPHA });
      routePinGraphics.stroke({ width: ROUTE_PIN_BORDER_WIDTH, color: SPEED_LABEL_BG_COLOR, alpha: ROUTE_PIN_BORDER_ALPHA });

      // Inner dot
      routePinGraphics.circle(destNode.x, destNode.y, pinR * 0.35);
      routePinGraphics.fill({ color: SPEED_LABEL_BG_COLOR, alpha: ROUTE_PIN_DOT_ALPHA });
    }
  }
}

function getCarPose(car) {
  if (car.phase === "junction" && car.junctionPath) {
    return {
      p: pointAtPath(car.junctionPath, car.junctionS),
      h: headingAtPath(car.junctionPath, car.junctionS),
      path: car.junctionPath,
      s: car.junctionS,
    };
  }
  return {
    p: pointAtPath(car.path, car.s),
    h: headingAtPath(car.path, car.s),
    path: car.path,
    s: car.s,
  };
}

function drawPathSlice(g, path, fromS, maxLen, color, width, alpha) {
  if (!path || !path.points || path.points.length < 2 || maxLen <= 0) return 0;
  const start = Math.max(0, Math.min(path.length, fromS));
  const end = Math.max(start, Math.min(path.length, start + maxLen));
  if (end - start <= 0.05) return 0;

  const pts = [pointAtPath(path, start)];
  let idx = 0;
  while (idx < path.cumulative.length && path.cumulative[idx] <= start) idx++;
  while (idx < path.cumulative.length && path.cumulative[idx] < end) {
    pts.push(path.points[idx]);
    idx++;
  }
  pts.push(pointAtPath(path, end));
  if (pts.length < 2) return 0;

  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.stroke({ width, color, alpha, pixelLine: true });
  return end - start;
}

function getPreviewConnector(nodeId, inSegId, inDir, inLaneIdx, nextStep) {
  if (nextStep) {
    const exact = findConnector(
      nodeId, inSegId, inDir, inLaneIdx,
      nextStep.segId, nextStep.dir, nextStep.laneIdx
    );
    if (exact) return exact;
    const relaxed = findConnector(
      nodeId, inSegId, inDir, inLaneIdx,
      nextStep.segId, nextStep.dir
    );
    if (relaxed) return relaxed;
  }
  return findConnector(nodeId, inSegId, inDir, inLaneIdx);
}

function drawDebugFuturePath(g, car, maxLen) {
  if (!car.laneSeq || maxLen <= 0) return;
  let remaining = maxLen;

  if (car.phase === "junction" && car.junctionPath) {
    remaining -= drawPathSlice(
      g, car.junctionPath, car.junctionS, remaining,
      COLORS.debugLane, DEBUG_GHOST_WIDTH, DEBUG_GHOST_ALPHA
    );
  } else if (car.phase === "segment" && car.path) {
    remaining -= drawPathSlice(
      g, car.path, car.s, remaining,
      COLORS.debugLane, DEBUG_GHOST_WIDTH, DEBUG_GHOST_ALPHA
    );
  }
  if (remaining <= 0) return;

  let inSegId = car.segId;
  let inDir = car.dir;
  let inLaneIdx = car.laneIdx;
  let stepIdx = Math.max(0, car.routeStep + 1);

  while (remaining > 0 && stepIdx < car.laneSeq.length) {
    const inSeg = state.segments.get(inSegId);
    const nextStep = car.laneSeq[stepIdx];
    if (!inSeg || !nextStep) break;

    const nodeId = (inDir === "AtoB") ? inSeg.nodeB : inSeg.nodeA;
    const conn = getPreviewConnector(nodeId, inSegId, inDir, inLaneIdx, nextStep);
    if (conn) {
      remaining -= drawPathSlice(
        g, conn.path, 0, remaining,
        COLORS.debugLane, DEBUG_GHOST_WIDTH, DEBUG_GHOST_ALPHA
      );
      if (remaining <= 0) break;
    }

    const seg = state.segments.get(nextStep.segId);
    if (!seg) break;
    const lanePath = buildLanePath(seg, state.nodes, nextStep.dir, nextStep.laneIdx);
    remaining -= drawPathSlice(
      g, lanePath, 0, remaining,
      COLORS.debugLane, DEBUG_GHOST_WIDTH, DEBUG_GHOST_ALPHA
    );

    inSegId = nextStep.segId;
    inDir = nextStep.dir;
    inLaneIdx = nextStep.laneIdx;
    stepIdx++;
  }
}

function clearDebugCarLabels() {
  for (const ch of carLabelsContainer.removeChildren()) ch.destroy();
}

function makeDebugLabel(car) {
  const sigTimer = (car.debugSignalTimer && car.debugSignalTimer > 0)
    ? `@${car.debugSignalTimer.toFixed(1)}s`
    : "";
  const sig = car.debugSignalGreen == null
    ? "sig:-"
    : `sig:${car.debugSignalGreen ? "G" : "R"}${car.debugSignalPhase ? `(${car.debugSignalPhase}${sigTimer})` : ""}`;
  const conn = car.debugExpectedConnectorId ?? "-";
  const curConn = car.debugCurrentConnectorId ?? "-";
  const front = Number.isFinite(car.debugObstacleDist) ? car.debugObstacleDist.toFixed(1) : "inf";
  const rem = Number.isFinite(car.debugRemToEnd) ? car.debugRemToEnd.toFixed(1) : "-";
  const stepCur = Math.max(0, (car.routeStep ?? -1) + 1);
  const stepTotal = car.laneSeq ? car.laneSeq.length : 0;
  const txt = [
    `${car.id} ${car.phase} lane:${car.segId}:${car.dir}:${car.laneIdx} step:${stepCur}/${stepTotal}`,
    `v:${car.speed.toFixed(1)}/${(car.debugTargetSpeed || 0).toFixed(1)} brake:${car.debugBrakeReason}`,
    `next:${car.debugNextStep || "-"} conn:${conn} cur:${curConn} ok:${car.debugConnExists ? "Y" : "N"} ${sig}`,
    `dEnd:${rem} dFront:${front} rer:${car.debugReroutes || 0} stop:${(car.debugStoppedTotal || 0).toFixed(1)}s`,
  ].join("\n");

  const label = new PIXI.Text({
    text: txt,
    style: {
      fontSize: DEBUG_TEXT_SIZE,
      fill: DEBUG_TEXT_COLOR,
      fontFamily: "monospace",
      stroke: DEBUG_TEXT_BG_COLOR,
      strokeThickness: 3,
    },
  });
  label.anchor.set(0.5, 1);
  label.alpha = DEBUG_TEXT_BG_ALPHA;
  return label;
}

export function drawCars() {
  carsGraphics.clear();
  clearDebugCarLabels();
  for (const car of state.cars) {
    const pose = getCarPose(car);
    const p = pose.p;
    const h = pose.h;

    const selected = car.id === state.selectedCarId;

    if (state.debugLanes && pose.path) {
      drawPathSlice(
        carsGraphics,
        pose.path,
        Math.max(0, pose.s - 10),
        24,
        COLORS.debugLane,
        DEBUG_CURRENT_LANE_WIDTH,
        DEBUG_CURRENT_LANE_ALPHA
      );
      drawDebugFuturePath(carsGraphics, car, Math.max(30, car.speed * DEBUG_GHOST_SECONDS));

      if (car.debugInvalidConnector && car.path?.points?.length > 0) {
        const end = car.path.points[car.path.points.length - 1];
        carsGraphics.circle(end.x, end.y, 9);
        carsGraphics.stroke({
          width: DEBUG_INVALID_WIDTH,
          color: DEBUG_INVALID_COLOR,
          alpha: DEBUG_INVALID_ALPHA,
          pixelLine: true,
        });
      }

      const label = makeDebugLabel(car);
      label.x = p.x;
      label.y = p.y - (DEBUG_TEXT_OFFSET_Y / Math.max(0.001, state.view.zoom));
      label.scale.set(1 / Math.max(0.001, state.view.zoom));
      carLabelsContainer.addChild(label);
    }

    // Selection glow ring (drawn first, behind the car body)
    if (selected) {
      carsGraphics.circle(p.x, p.y, CAR_SELECTION_RADIUS);
      carsGraphics.stroke({ width: CAR_SELECTION_STROKE, color: SPEED_LABEL_BG_COLOR, alpha: CAR_SELECTION_ALPHA });
    }

    const bodyPts = buildRoundedCarBodyPoints(
      p.x,
      p.y,
      h,
      CAR_BODY_HALF_LENGTH,
      CAR_BODY_HALF_WIDTH,
      CAR_CORNER_RADIUS
    );
    carsGraphics.poly(bodyPts);
    carsGraphics.fill(car.color);
    carsGraphics.stroke({
      width: selected ? CAR_STROKE_SELECTED_WIDTH : CAR_STROKE_WIDTH,
      color: selected ? SPEED_LABEL_BG_COLOR : COLORS.carStroke,
    });
  }
}

function buildRoundedCarBodyPoints(cx, cy, heading, halfL, halfW, radius) {
  const r = Math.max(0, Math.min(radius, halfL, halfW));
  const innerL = halfL - r;
  const innerW = halfW - r;
  const cornerSteps = 3;
  const local = [];

  function addArc(centerX, centerY, a0, a1) {
    for (let i = 0; i <= cornerSteps; i++) {
      const t = i / cornerSteps;
      const a = a0 + (a1 - a0) * t;
      local.push({ x: centerX + Math.cos(a) * r, y: centerY + Math.sin(a) * r });
    }
  }

  // Clockwise local arcs: top-right, bottom-right, bottom-left, top-left
  addArc(innerL, -innerW, -Math.PI / 2, 0);
  addArc(innerL, innerW, 0, Math.PI / 2);
  addArc(-innerL, innerW, Math.PI / 2, Math.PI);
  addArc(-innerL, -innerW, Math.PI, (3 * Math.PI) / 2);

  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const world = [];
  for (const q of local) {
    world.push(cx + q.x * c - q.y * s, cy + q.x * s + q.y * c);
  }
  return world;
}

export function drawExplosions(dt) {
  explosionGraphics.clear();
  state.explosions = state.explosions.filter(ex => {
    ex.age += dt;
    if (ex.age >= ex.duration) return false;

    const t = ex.age / ex.duration;          // 0 → 1
    const easeOut = 1 - (1 - t) * (1 - t);  // ease-out quad

    // Expanding ring: orange → transparent
    const ringRadius = EXPLOSION_MAX_RADIUS * easeOut;
    const ringAlpha  = (1 - t) * 0.9;
    const ringWidth  = (1 - t) * 6 + 1;
    const ringColor  = t < 0.4 ? EXPLOSION_RING_COLOR_START : EXPLOSION_RING_COLOR_END;
    explosionGraphics.circle(ex.x, ex.y, ringRadius);
    explosionGraphics.stroke({ color: ringColor, width: ringWidth, alpha: ringAlpha });

    // Inner flash (first 30% only)
    if (t < 0.3) {
      const flashAlpha = (1 - t / 0.3) * 0.6;
      explosionGraphics.circle(ex.x, ex.y, ringRadius * 0.55);
      explosionGraphics.fill({ color: SPEED_LABEL_BG_COLOR, alpha: flashAlpha });
    }

    // Sparks
    const sparkLen  = EXPLOSION_MAX_RADIUS * 1.1 * easeOut;
    const sparkAlpha = (1 - t) * 0.85;
    for (const angle of ex.sparkAngles) {
      const x1 = ex.x + Math.cos(angle) * ringRadius * 0.4;
      const y1 = ex.y + Math.sin(angle) * ringRadius * 0.4;
      const x2 = ex.x + Math.cos(angle) * sparkLen;
      const y2 = ex.y + Math.sin(angle) * sparkLen;
      explosionGraphics.moveTo(x1, y1).lineTo(x2, y2);
      explosionGraphics.stroke({ color: EXPLOSION_SPARK_COLOR, width: EXPLOSION_SPARK_WIDTH, alpha: sparkAlpha });
    }

    return true;
  });
}

export function updatePropertiesPanel() {
  const panel = document.getElementById("propertiesPanel");
  const seg = state.selectedSegId !== null ? state.segments.get(state.selectedSegId) : null;
  if (!seg) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "";
  document.getElementById("atobVal").textContent = seg.lanesAtoB;
  document.getElementById("btoaVal").textContent = seg.lanesBtoA;
  document.getElementById("propSpeedBtn").textContent = `${seg.speedLimit} km/h`;
}

export function updateStatus() {
  updateSpawnButtonLabel();
  const statusEl = document.getElementById("status");
  const toolName = { segment: "Carretera", select: "Seleccionar", speed: "Velocidad", arrow: "Flechas", signal: "Semáforos" }[state.tool] || state.tool;
  statusEl.textContent = `Herramienta: ${toolName} · Nodos: ${state.nodes.size} · Segmentos: ${state.segments.size} · Coches: ${state.cars.length}`;
  const crashEl = document.getElementById("crashCount");
  if (crashEl) crashEl.textContent = `Siniestros: ${state.crashes}`;
}

export function updateSpawnButtonLabel() {
  const btn = document.getElementById("spawnCarBtn");
  if (btn) btn.textContent = `Spawn coche (${state.cars.length}) [+${state.pendingSpawns}]`;
}

export function setupUi() {
  const pauseBtn      = document.getElementById("pauseBtn");
  const spawnCarBtn   = document.getElementById("spawnCarBtn");
  const debugLanesBtn = document.getElementById("debugLanesBtn");

  // Properties panel
  function withSeg(fn) {
    const seg = state.selectedSegId !== null ? state.segments.get(state.selectedSegId) : null;
    if (!seg) return;
    fn(seg);
    markNetworkDirty();
    saveState();
  }
  const SPEED_CYCLE = SPEED_PRESETS;
  document.getElementById("atobMinus").addEventListener("click", () => withSeg(s => {
    s.lanesAtoB = Math.max(1, s.lanesAtoB - 1);
  }));
  document.getElementById("atobPlus") .addEventListener("click", () => withSeg(s => { if (s.lanesAtoB < MAX_LANES) s.lanesAtoB++; }));
  document.getElementById("btoaMinus").addEventListener("click", () => withSeg(s => {
    s.lanesBtoA = Math.max(1, s.lanesBtoA - 1);
  }));
  document.getElementById("btoaPlus") .addEventListener("click", () => withSeg(s => { if (s.lanesBtoA < MAX_LANES) s.lanesBtoA++; }));
  document.getElementById("propSpeedBtn").addEventListener("click", () => withSeg(s => {
    s.speedLimit = SPEED_CYCLE[(SPEED_CYCLE.indexOf(s.speedLimit) + 1) % SPEED_CYCLE.length];
  }));
  const clearCarsBtn  = document.getElementById("clearCarsBtn");
  const clearAllBtn   = document.getElementById("clearAllBtn");
  document.querySelector(".panel").addEventListener("click", e => {
    const btn = e.target.closest("button[data-tool]");
    if (btn) setTool(btn.dataset.tool);
  });

  pauseBtn.addEventListener("click", () => {
    state.paused = !state.paused;
    pauseBtn.textContent = state.paused ? "▶ Reanudar" : "⏸ Pausa";
    pauseBtn.classList.toggle("active", state.paused);
  });

  spawnCarBtn.addEventListener("click", () => {
    state.pendingSpawns += SPAWN_BATCH;
    updateSpawnButtonLabel();
  });

  debugLanesBtn.addEventListener("click", () => {
    state.debugLanes = !state.debugLanes;
    debugLanesBtn.textContent = `Debug: ${state.debugLanes ? "ON" : "OFF"}`;
    debugLanesBtn.classList.toggle("active", state.debugLanes);
  });
  debugLanesBtn.textContent = `Debug: ${state.debugLanes ? "ON" : "OFF"}`;
  debugLanesBtn.classList.toggle("active", state.debugLanes);

  clearCarsBtn.addEventListener("click", () => {
    state.cars = [];
    state.explosions = [];
    state.pendingSpawns = 0;
    updateSpawnButtonLabel();
  });

  clearAllBtn.addEventListener("click", () => {
    state.nodes.clear();
    state.segments.clear();
    state.junctions.clear();
    state.signals.clear();
    state.laneArrows.clear();
    state.userConnectors.clear();
    state.cars = [];
    state.explosions = [];
    state.crashes = 0;
    state.pendingSpawns = 0;
    state.selectedNodeId = null;
    state.selectedSegId = null;
    state.selectedCarId = null;
    state.drawingSegment = null;
    state.connectorTool.editingNodeId = null;
    state.connectorTool.selectedInKey = null;
    state.nextNodeId = 1;
    state.nextSegmentId = 1;
    state.nextConnectorId = 0;
    updateSpawnButtonLabel();
    markNetworkDirty();
    saveState();
  });

  setTool("select");
}

function drawArrowGlyphs(g, cx, cy, laneHeading, arrowSet) {
  const types = [...arrowSet];
  const count = types.length;
  const perpX = -Math.sin(laneHeading), perpY = Math.cos(laneHeading);

  types.forEach((type, i) => {
    const offset = (i - (count - 1) / 2) * ARROW_GROUP_OFFSET;
    const ox = cx + perpX * offset;
    const oy = cy + perpY * offset;

    let ah = laneHeading;
    if (type === "right") ah = laneHeading + Math.PI / ARROW_TURN_ANGLE_DIVISOR;
    if (type === "left")  ah = laneHeading - Math.PI / ARROW_TURN_ANGLE_DIVISOR;

    const cos = Math.cos(ah), sin = Math.sin(ah);
    const px = -Math.sin(ah), py = Math.cos(ah);
    const h = ARROW_HEAD_LENGTH;
    const w = ARROW_HEAD_WIDTH;

    const tip = { x: ox + cos * h,                    y: oy + sin * h };
    const bl  = { x: ox - cos * h * 0.25 - px * w,   y: oy - sin * h * 0.25 - py * w };
    const br  = { x: ox - cos * h * 0.25 + px * w,   y: oy - sin * h * 0.25 + py * w };

    g.poly([tip.x, tip.y, bl.x, bl.y, br.x, br.y]);
    g.fill({ color: ARROW_FILL_COLOR, alpha: ARROW_FILL_ALPHA });
  });
}

export function drawLaneArrows() {
  tmpeOverlayGraphics.clear();

  // Hover highlight
  if (state.tool === "arrow" && state.hoveredLane) {
    const { segId, dir, laneIdx } = state.hoveredLane;
    const seg = state.segments.get(segId);
    if (seg) {
      const ip = segmentInsetPoints(seg);
      if (ip) {
        const { pA, pB, ux, uy } = ip;
        const nx = -uy, ny = ux;
        const lateralSign = (dir === "AtoB") ? 1 : -1;
        const center = lateralSign * (laneIdx + 0.5) * LANE_WIDTH;
        tmpeOverlayGraphics.moveTo(pA.x + nx * center, pA.y + ny * center)
          .lineTo(pB.x + nx * center, pB.y + ny * center);
        tmpeOverlayGraphics.stroke({ width: LANE_WIDTH - 2, color: ARROW_FILL_COLOR, alpha: ARROW_HOVER_ALPHA });
      }
    }
  }

  // Draw arrow glyphs for each configured lane
  for (const [key, arrowSet] of state.laneArrows) {
    if (arrowSet.size === 0) continue;
    const parts = key.split(":");
    const segId = parseInt(parts[0]);
    const dir = parts[1];
    const laneIdx = parseInt(parts[2]);
    const seg = state.segments.get(segId);
    if (!seg) continue;

    const nodeA = state.nodes.get(seg.nodeA);
    const nodeB = state.nodes.get(seg.nodeB);
    if (!nodeA || !nodeB) continue;

    const heading = Math.atan2(nodeB.y - nodeA.y, nodeB.x - nodeA.x);
    const rightX = -Math.sin(heading), rightY = Math.cos(heading);
    const lateralSign = (dir === "AtoB") ? 1 : -1;
    const laneHeading = (dir === "AtoB") ? heading : heading + Math.PI;
    const lateralOff = lateralSign * (laneIdx + 0.5) * LANE_WIDTH;

    const mx = (nodeA.x + nodeB.x) / 2 + rightX * lateralOff;
    const my = (nodeA.y + nodeB.y) / 2 + rightY * lateralOff;

    drawArrowGlyphs(tmpeOverlayGraphics, mx, my, laneHeading, arrowSet);
  }
}

export function drawSignals() {
  signalGraphics.clear();

  for (const [nodeId, signal] of state.signals) {
    const junc = state.junctions.get(nodeId);
    if (!junc) continue;
    const phase = signal.phases[signal.currentPhase];
    const drawnLanes = new Set();

    for (const conn of junc.connectors) {
      const laneKey = `${conn.inSegId}:${conn.inDir}:${conn.inLane}`;
      if (drawnLanes.has(laneKey)) continue;
      drawnLanes.add(laneKey);
      if (conn.path.points.length === 0) continue;

      const pt = conn.path.points[0];
      const armKey = `${conn.inSegId}:${conn.inDir}`;
      const isManaged = signal?.phases.some(p => p.greenConnectors.has(armKey));
      const isGreen = !isManaged || (phase?.greenConnectors.has(armKey) ?? true);
      const color = isGreen ? COLORS.trafficGreen : COLORS.trafficRed;
      const r = SIGNAL_RADIUS;

      signalGraphics.circle(pt.x, pt.y, r).fill(color);
      signalGraphics.circle(pt.x, pt.y, r).stroke({
        width: SIGNAL_STROKE_WIDTH,
        color: SIGNAL_STROKE_COLOR,
        alpha: SIGNAL_STROKE_ALPHA,
      });
    }

    // In signal tool mode: ring around nodes that have a signal
    if (state.tool === "signal") {
      const node = state.nodes.get(nodeId);
      if (node) {
        signalGraphics.circle(node.x, node.y, SIGNAL_TOOL_RING_RADIUS).stroke({
          width: SIGNAL_TOOL_RING_WIDTH,
          color: SIGNAL_TOOL_RING_COLOR,
          alpha: SIGNAL_TOOL_RING_ALPHA,
        });
      }
    }
  }
}

export function drawSpeedLabels() {
  const segIds = new Set(state.segments.keys());

  // Remove labels for deleted segments
  for (let i = speedLabelsContainer.children.length - 1; i >= 0; i--) {
    if (!segIds.has(speedLabelsContainer.children[i]._segId)) {
      speedLabelsContainer.removeChildAt(i);
    }
  }

  for (const seg of state.segments.values()) {
    const nodeA = state.nodes.get(seg.nodeA);
    const nodeB = state.nodes.get(seg.nodeB);
    if (!nodeA || !nodeB) continue;

    const mx = (nodeA.x + nodeB.x) / 2;
    const my = (nodeA.y + nodeB.y) / 2;

    // Find or create sign container
    let sign = null;
    for (const child of speedLabelsContainer.children) {
      if (child._segId === seg.id) { sign = child; break; }
    }
    if (!sign) {
      sign = new PIXI.Container();
      sign._segId = seg.id;
      sign._lastSpeed = null;

      const bg = new PIXI.Graphics();
      bg.label = "bg";
      sign.addChild(bg);

      const txt = new PIXI.Text({
        text: "",
        style: { fontSize: SPEED_SIGN_FONT_SIZE, fill: SPEED_LABEL_TEXT_COLOR, fontWeight: "bold" },
      });
      txt.resolution = SPEED_SIGN_TEXT_RESOLUTION;
      txt.label = "lbl";
      txt.anchor.set(0.5, 0.5);
      sign.addChild(txt);

      speedLabelsContainer.addChild(sign);
    }

    // Redraw background only when speed changes
    if (sign._lastSpeed !== seg.speedLimit) {
      sign._lastSpeed = seg.speedLimit;

      const bg = sign.getChildByLabel("bg");
      bg.clear();
      // Draw as a solid ring (outer red + inner white) to avoid AA double-border artifacts.
      bg.circle(0, 0, SPEED_SIGN_RADIUS);
      bg.fill({ color: SPEED_SIGN_BORDER_COLOR, alpha: SPEED_SIGN_BORDER_ALPHA });
      bg.circle(0, 0, Math.max(0, SPEED_SIGN_RADIUS - SPEED_SIGN_BORDER_SIZE));
      bg.fill({ color: SPEED_LABEL_BG_COLOR, alpha: SPEED_SIGN_BG_ALPHA });

      sign.getChildByLabel("lbl").text = String(seg.speedLimit);
    }

    sign.x = mx;
    sign.y = my;
    sign.scale.set(1);
    sign.alpha = (state.tool === "speed") ? SPEED_LABEL_ALPHA_ACTIVE : SPEED_LABEL_ALPHA_IDLE;
  }
}

export function setTool(tool) {
  state.tool = tool;
  state.drawingSegment = null;
  state.hoveredSegId = null;
  state.hoveredLane = null;
  state.connectorTool.editingNodeId = null;
  state.connectorTool.selectedInKey = null;
  if (canvas) canvas.style.cursor = tool === "select" ? "default" : "crosshair";

  document.querySelectorAll("button[data-tool]").forEach(b => {
    b.classList.toggle("active", b.dataset.tool === tool);
  });
}

export function fitViewToNetwork() {
  if (state.nodes.size === 0) return false;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of state.nodes.values()) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }

  // Include visual road width in bounds so wide roads stay inside the frame.
  let maxRoadHalf = LANE_WIDTH;
  for (const seg of state.segments.values()) {
    const half = (seg.lanesAtoB + seg.lanesBtoA) * LANE_WIDTH * 0.5;
    if (half > maxRoadHalf) maxRoadHalf = half;
  }
  const worldPad = maxRoadHalf + 20;
  minX -= worldPad; minY -= worldPad;
  maxX += worldPad; maxY += worldPad;

  const boundsW = Math.max(1, maxX - minX);
  const boundsH = Math.max(1, maxY - minY);
  const { width, height } = rendererSize();
  const screenPad = 48;
  const usableW = Math.max(1, width - screenPad * 2);
  const usableH = Math.max(1, height - screenPad * 2);

  const zoomX = usableW / boundsW;
  const zoomY = usableH / boundsH;
  const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(zoomX, zoomY)));

  state.view.x = (minX + maxX) * 0.5;
  state.view.y = (minY + maxY) * 0.5;
  state.view.zoom = zoom;
  return true;
}

function laneEndpointColor(segId) {
  return hslToHex((segId * 137.5 % 360) / 360, 0.65, 0.58);
}

export function drawConnectorTool() {
  connectorOverlayGraphics.clear();
  if (state.tool !== "connector") return;

  if (state.networkDirty) rebuildJunctions();

  const ct = state.connectorTool;

  if (ct.editingNodeId === null) {
    // Highlight all nodes that have junctions (hoverable)
    for (const [nodeId, junc] of state.junctions) {
      if (junc.connectors.length === 0) continue;
      const node = state.nodes.get(nodeId);
      if (!node) continue;
      const hovered = state.hoveredNodeId === nodeId;
      connectorOverlayGraphics.circle(node.x, node.y, CONNECTOR_NODE_RING_RADIUS);
      connectorOverlayGraphics.stroke({
        color: hovered ? CONNECTOR_NODE_RING_HOVER_COLOR : CONNECTOR_NODE_RING_COLOR,
        width: CONNECTOR_NODE_RING_WIDTH,
        alpha: CONNECTOR_NODE_RING_ALPHA,
      });
    }
    return;
  }

  const junc = state.junctions.get(ct.editingNodeId);
  if (!junc) return;

  const [selSegIdStr, selDir, selLaneStr] = ct.selectedInKey ? ct.selectedInKey.split(":") : [];
  const selSegId = selSegIdStr ? parseInt(selSegIdStr) : null;
  const selLane  = selLaneStr  ? parseInt(selLaneStr)  : null;

  // Draw all connectors
  for (const conn of junc.connectors) {
    const isFromSelected = ct.selectedInKey &&
      conn.inSegId === selSegId && conn.inDir === selDir && conn.inLane === selLane;
    const color = conn.userDefined ? COLORS.selected : CONNECTOR_DEFAULT_COLOR;
    const alpha = isFromSelected ? SPEED_LABEL_ALPHA_ACTIVE : (conn.userDefined ? CONNECTOR_USER_ALPHA : CONNECTOR_DIM_ALPHA);
    const width = isFromSelected ? CONNECTOR_WIDTH_SELECTED : CONNECTOR_WIDTH;
    const pts = conn.path.points;
    connectorOverlayGraphics.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) connectorOverlayGraphics.lineTo(pts[i].x, pts[i].y);
    connectorOverlayGraphics.stroke({ color, width, alpha });
  }

  // Draw outgoing endpoints
  for (const out of junc.outgoingLanes) {
    const outKey = `${out.segId}:${out.dir}:${out.laneIdx}`;
    const color = laneEndpointColor(out.segId);
    const isTarget = ct.selectedInKey !== null && out.segId !== selSegId;
    const hasConn = ct.selectedInKey && junc.connectors.some(c =>
      c.inSegId === selSegId && c.inDir === selDir && c.inLane === selLane &&
      c.outSegId === out.segId && c.outDir === out.dir && c.outLane === out.laneIdx
    );
    const r = isTarget ? CONNECTOR_OUT_TARGET_R : CONNECTOR_OUT_R;
    connectorOverlayGraphics.circle(out.ep.x, out.ep.y, r);
    if (isTarget) {
      connectorOverlayGraphics.fill({ color: hasConn ? COLORS.selected : color, alpha: CONNECTOR_TARGET_FILL_ALPHA });
      connectorOverlayGraphics.circle(out.ep.x, out.ep.y, r + CONNECTOR_OUT_EXTRA_R);
      connectorOverlayGraphics.stroke({
        color: hasConn ? CONNECTOR_SELECTED_HALO_COLOR : CONNECTOR_OUT_STROKE_COLOR,
        width: CONNECTOR_OUT_STROKE,
      });
    } else {
      connectorOverlayGraphics.stroke({ color, width: CONNECTOR_OUT_STROKE, alpha: CONNECTOR_OUT_IDLE_ALPHA });
    }
  }

  // Draw incoming endpoints
  for (const inc of junc.incomingLanes) {
    const inKey = `${inc.segId}:${inc.dir}:${inc.laneIdx}`;
    const selected = ct.selectedInKey === inKey;
    const color = laneEndpointColor(inc.segId);
    const r = selected ? CONNECTOR_IN_SELECTED_R : CONNECTOR_IN_R;
    connectorOverlayGraphics.circle(inc.ep.x, inc.ep.y, r);
    connectorOverlayGraphics.fill({ color: selected ? CONNECTOR_IN_SELECTED_FILL_COLOR : color });
    if (selected) {
      connectorOverlayGraphics.circle(inc.ep.x, inc.ep.y, r + CONNECTOR_IN_SELECTED_EXTRA_R);
      connectorOverlayGraphics.stroke({ color: CONNECTOR_SELECTED_HALO_COLOR, width: CONNECTOR_SELECTED_HALO_WIDTH });
    }
  }
}
