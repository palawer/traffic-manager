export const state = {
  view: { x: 0, y: 0, zoom: 1 },
  nodes: new Map(),          // id → { id, x, y }
  segments: new Map(),       // id → { id, nodeA, nodeB, lanesAtoB, lanesBtoA, speedLimit }
  nextNodeId: 1,
  nextSegmentId: 1,
  nextCarId: 0,              // contador entero para IDs de coches — evita string hashing en Map
  cars: [],
  pendingSpawns: 0,
  networkDirty: true,
  debugLanes: false,
  paused: false,
  selectedCarId: null,
};
