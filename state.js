export const ROAD_WIDTH = 44;
export const LANE_WIDTH = ROAD_WIDTH / 2;
export const LANE_OFFSET = LANE_WIDTH * 0.5;
export const JOIN_ENTRY_OFFSET = 10;
export const JOIN_GRACE_TIME = 0.6;
export const JOIN_BLEND_HANDLE = 20;
export const CONNECT_SNAP_DIST = 24;
export const CONNECT_ANGLE_TOL = 0.55;
export const GRID = 20;
export const TRAFFIC_LIGHT_GREEN_TIME = 5.5;

export const COLORS = {
  bg: 0xd9e5db,
  gridMinor: 0xccdbcc,
  gridMajor: 0xc1d1c0,
  road: 0x2d3138,
  divider: 0x8a8f96,
  selected: 0xf0b429,
  connectorOpen: 0xd96a6a,
  connectorLinked: 0x2ea866,
  trafficGreen: 0x35c759,
  trafficRed: 0xff453a,
  trafficPole: 0x1f252b,
  carStroke: 0x172028,
  debugLane: 0x0a84ff,
};

export const state = {
  view: { x: 0, y: 0, zoom: 1 },
  pieces: [],
  selectedId: null,
  tool: "select",
  placingType: null,
  placeRotation: 0,
  nextPieceId: 1,
  draggingPieceId: null,
  dragOffset: { x: 0, y: 0 },
  panning: false,
  lastMouse: { x: 0, y: 0 },
  keys: { space: false },
  networkDirty: true,
  connectors: [],
  connections: new Map(),
  openConnectors: [],
  cars: [],
  pendingSpawns: 0,
  debugLanes: true,
  signalTime: 0,
};
