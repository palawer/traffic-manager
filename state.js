export const LANE_WIDTH = 22;
export const ROAD_WIDTH = 44; // kept for compat (2 lanes)
export const GRID = 20;
export const NODE_SNAP_DIST = 20;
export const JOIN_GRACE_TIME = 0.4;

export const COLORS = {
  bg: 0xd9e5db,
  gridMinor: 0xccdbcc,
  gridMajor: 0xc1d1c0,
  road: 0x2d3138,
  roadShoulder: 0x444a52,
  centerline: 0xe8c840,
  laneDivider: 0xd0d4d8,
  edgeLine: 0xf0f0f0,
  stopLine: 0xffffff,
  junction: 0x2d3138,
  selected: 0xf0b429,
  nodeDefault: 0x8a8f96,
  nodeHover: 0xffd700,
  nodeSelected: 0xf0b429,
  trafficGreen: 0x35c759,
  trafficRed: 0xff453a,
  trafficPole: 0x1f252b,
  carStroke: 0x172028,
  debugLane: 0x0a84ff,
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
  cars: [],
  pendingSpawns: 0,
  networkDirty: true,
  // editor
  tool: "segment",           // "select" | "segment"
  drawingSegment: null,      // { fromNodeId } while dragging
  hoveredNodeId: null,
  selectedNodeId: null,
  selectedSegId: null,
  panning: false,
  lastMouse: { x: 0, y: 0 },
  keys: { space: false },
  debugLanes: true,
  paused: false,
  signalTime: 0,
  selectedCarId: null,
};
