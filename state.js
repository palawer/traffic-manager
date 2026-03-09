export { LANE_WIDTH, ROAD_WIDTH, GRID, NODE_SNAP_DIST } from "./config.js";
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
  COLOR_CAR_STROKE,
  DEBUG_PATH_COLOR,
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
  selected: COLOR_SELECTED,
  nodeDefault: COLOR_NODE_DEFAULT,
  nodeHover: COLOR_NODE_HOVER,
  nodeSelected: COLOR_NODE_SELECTED,
  carStroke: COLOR_CAR_STROKE,
  debugLane: DEBUG_PATH_COLOR,
};

export const state = {
  view: { x: 0, y: 0, zoom: 1 },
  nodes: new Map(),          // id → { id, x, y }
  segments: new Map(),       // id → { id, nodeA, nodeB, lanesAtoB, lanesBtoA, speedLimit }
  nextNodeId: 1,
  nextSegmentId: 1,
  cars: [],
  pendingSpawns: 0,
  networkDirty: true,
  debugLanes: false,
  paused: false,
  selectedCarId: null,
};
