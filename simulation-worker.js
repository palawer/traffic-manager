// simulation-worker.js — Ejecuta la simulación en un Web Worker separado.
// Recibe: init (datos de red) + tick (dt por frame)
// Envía:  frame (posiciones compactas + datos del coche seleccionado)

import { state } from "./state.js";
import { initSimulationCaches, updateCars } from "./simulation.js";
import { pointAtPath } from "./geometry.js";

self.onmessage = ({ data }) => {
  switch (data.type) {

    case "init": {
      for (const [id, n] of data.nodes)    state.nodes.set(id, n);
      for (const [id, s] of data.segments) state.segments.set(id, s);
      state.nextNodeId     = data.nextNodeId;
      state.nextSegmentId  = data.nextSegmentId;
      initSimulationCaches();
      self.postMessage({ type: "ready" });
      break;
    }

    case "tick": {
      state.pendingSpawns += data.addSpawns ?? 0;
      if (!data.paused) updateCars(data.dt);

      const n         = state.cars.length;
      const positions = new Float32Array(n * 4); // x, y, aheadX, aheadY por coche
      const ids       = new Int32Array(n);
      const colors    = new Int32Array(n);
      const graces    = new Uint8Array(n);

      for (let i = 0; i < n; i++) {
        const car    = state.cars[i];
        const wp     = pointAtPath(car.path, car.s);
        const aheadW = pointAtPath(car.path, Math.min(car.s + 2, car.path.length - 0.001));
        positions[i * 4]     = wp.x;
        positions[i * 4 + 1] = wp.y;
        positions[i * 4 + 2] = aheadW.x;
        positions[i * 4 + 3] = aheadW.y;
        ids[i]    = car.id;
        colors[i] = car.color;
        graces[i] = car.spawnGrace > 0 ? 1 : 0;
      }

      // Datos completos del coche seleccionado para dibujar la ruta en el hilo principal
      let selectedCar = null;
      if (data.selectedCarId != null) {
        const car = state.cars.find(c => c.id === data.selectedCarId);
        if (car) selectedCar = {
          id: car.id, color: car.color,
          speed: car.speed, desiredSpeed: car.desiredSpeed, speedFactor: car.speedFactor,
          s: car.s, path: car.path,
          laneSeq: car.laneSeq, routeStep: car.routeStep, route: car.route,
        };
      }

      // Congestión por segmento: avgSpeed / speedLimit → 0 (parado) … 1 (fluido)
      const congMap = new Map();
      for (const car of state.cars) {
        let entry = congMap.get(car.segId);
        if (!entry) {
          const seg = state.segments.get(car.segId);
          entry = { sum: 0, count: 0, speedLimit: seg ? seg.speedLimit : 1 };
          congMap.set(car.segId, entry);
        }
        entry.sum += car.speed;
        entry.count++;
      }
      const congestion = new Float32Array(congMap.size * 2);
      let ci = 0;
      for (const [segId, { sum, count, speedLimit }] of congMap) {
        congestion[ci++] = segId;
        congestion[ci++] = (sum / count) / Math.max(speedLimit, 1);
      }

      self.postMessage(
        { type: "frame", carCount: n, pendingSpawns: state.pendingSpawns,
          positions, ids, colors, graces, selectedCar, congestion,
          echoSelectedCarId: data.selectedCarId },
        [positions.buffer, ids.buffer, colors.buffer, graces.buffer, congestion.buffer]
      );
      break;
    }

    case "clearCars": {
      state.cars          = [];
      state.pendingSpawns = 0;
      break;
    }
  }
};
