export { LANE_WIDTH, ROAD_WIDTH, GRID, NODE_SNAP_DIST, JOIN_GRACE_TIME } from "./config.js";
import {
  COLOR_BG,
  COLOR_GRID_MINOR,
  COLOR_GRID_MAJOR,
  COLOR_ROAD,
  COLOR_CENTERLINE,
  COLOR_LANE_DIVIDER,
  COLOR_ROAD_SHOULDER,
  COLOR_EDGE_LINE,
  COLOR_SELECTED,
  COLOR_NODE_DEFAULT,
  COLOR_NODE_HOVER,
  COLOR_NODE_SELECTED,
  COLOR_TRAFFIC_GREEN,
  COLOR_TRAFFIC_RED,
  COLOR_TRAFFIC_POLE,
  COLOR_CAR_STROKE,
  DEBUG_PATH_COLOR,
  COLOR_CONNECTOR_PATH,
  COLOR_ARROW_GREEN,
  COLOR_PREVIEW_ROAD,
  STOP_LINE_COLOR,
} from "./config.js";

export const COLORS = {
  bg: COLOR_BG,
  gridMinor: COLOR_GRID_MINOR,
  gridMajor: COLOR_GRID_MAJOR,
  road: COLOR_ROAD,
  roadShoulder: COLOR_ROAD_SHOULDER,
  centerline: COLOR_CENTERLINE,
  laneDivider: COLOR_LANE_DIVIDER,
  edgeLine: COLOR_EDGE_LINE,
  stopLine: STOP_LINE_COLOR,
  junction: COLOR_ROAD,
  selected: COLOR_SELECTED,
  nodeDefault: COLOR_NODE_DEFAULT,
  nodeHover: COLOR_NODE_HOVER,
  nodeSelected: COLOR_NODE_SELECTED,
  trafficGreen: COLOR_TRAFFIC_GREEN,
  trafficRed: COLOR_TRAFFIC_RED,
  trafficPole: COLOR_TRAFFIC_POLE,
  carStroke: COLOR_CAR_STROKE,
  debugLane: DEBUG_PATH_COLOR,
  connectorPath: COLOR_CONNECTOR_PATH,
  arrowGreen: COLOR_ARROW_GREEN,
  previewRoad: COLOR_PREVIEW_ROAD,
};

export const state = {
  view: { x: 0, y: 0, zoom: 1 },
  nodes: new Map(),          // id → { id, x, y }
  segments: new Map(),       // id → { id, nodeA, nodeB, lanesAtoB, lanesBtoA, speedLimit }
  junctions: new Map(),      // nodeId → { polygon, connectors: LaneConnector[] }
  nextNodeId: 1,
  nextSegmentId: 1,
  nextConnectorId: 0,
  signals: new Map(),        // nodeId → TrafficSignal
  laneArrows: new Map(),     // "segId:dir:laneIdx" → Set<"left"|"straight"|"right">
  userConnectors: new Map(), // nodeId → Map<inKey, Set<outKey>>  "segId:dir:laneIdx"
  cars: [],
  pendingSpawns: 0,
  crashes: 0,
  explosions: [],   // [{ x, y, age, duration, sparkAngles }]
  networkDirty: true,
  // editor
  tool: "select",            // "select" | "segment"
  drawingSegment: null,      // { fromNodeId } while dragging
  hoveredNodeId: null,
  hoveredSegId: null,
  hoveredLane: null,
  selectedNodeId: null,
  selectedSegId: null,
  panning: false,
  lastMouse: { x: 0, y: 0 },
  keys: { space: false },
  debugLanes: false,
  paused: false,
  signalTime: 0,
  selectedCarId: null,
  connectorTool: { editingNodeId: null, selectedInKey: null },
};
