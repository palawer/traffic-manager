export { LANE_WIDTH, GRID, NODE_SNAP_DIST, JOIN_GRACE_TIME } from "./config.js";
import { COLOR_ROAD, COLOR_CENTERLINE } from "./config.js";
export const ROAD_WIDTH = 44; // kept for compat (2 × LANE_WIDTH)

export const COLORS = {
  bg: 0xd9e5db,
  gridMinor: 0xccdbcc,
  gridMajor: 0xc1d1c0,
  road: COLOR_ROAD,
  roadShoulder: 0x444a52,
  centerline: COLOR_CENTERLINE,
  laneDivider: 0xd0d4d8,
  edgeLine: 0xf0f0f0,
  stopLine: 0xffffff,
  junction: COLOR_ROAD,
  selected: 0xf0b429,
  nodeDefault: 0x8a8f96,
  nodeHover: 0xffd700,
  nodeSelected: 0xf0b429,
  trafficGreen: 0x35c759,
  trafficRed: 0xff453a,
  trafficPole: 0x1f252b,
  carStroke: 0x172028,
  debugLane: 0x00b7ff,
  connectorPath: 0x00ccff,
  arrowGreen: 0x35c759,
  previewRoad: 0x5a9fd4,
};

export const state = {
  view: { x: 0, y: 0, zoom: 1 },
  nodes: new Map(),          // id → { id, x, y }
  segments: new Map(),       // id → { id, nodeA, nodeB, lanesAtoB, lanesBtoA, speedLimit }
  junctions: new Map(),      // nodeId → { polygon, connectors: LaneConnector[] }
  nextNodeId: 1,
  nextSegmentId: 1,
  nextConnectorId: 1,
  signals: new Map(),        // nodeId → TrafficSignal
  laneArrows: new Map(),     // "segId:dir:laneIdx" → Set<"left"|"straight"|"right">
  userConnectors: new Map(), // nodeId → Map<inKey, Set<outKey>>  "segId:dir:laneIdx"
  cars: [],
  pendingSpawns: 0,
  crashes: 0,
  explosions: [],   // [{ x, y, age, duration, sparkAngles }]
  networkDirty: true,
  // editor
  tool: "segment",           // "select" | "segment"
  drawingSegment: null,      // { fromNodeId } while dragging
  hoveredNodeId: null,
  hoveredSegId: null,
  hoveredLane: null,
  selectedNodeId: null,
  selectedSegId: null,
  panning: false,
  lastMouse: { x: 0, y: 0 },
  keys: { space: false },
  debugLanes: true,
  paused: false,
  signalTime: 0,
  selectedCarId: null,
  connectorTool: { editingNodeId: null, selectedInKey: null },
};
