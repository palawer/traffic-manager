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
      const positions = new Float32Array(n * 3); // x, y, rotation por coche
      const ids       = new Int32Array(n);
      const colors    = new Int32Array(n);
      const graces    = new Uint8Array(n);

      for (let i = 0; i < n; i++) {
        const car    = state.cars[i];
        const wp     = pointAtPath(car.path, car.s);
        const aheadW = pointAtPath(car.path, Math.min(car.s + 2, car.path.length - 0.001));
        positions[i * 3]     = wp.x;
        positions[i * 3 + 1] = wp.y;
        positions[i * 3 + 2] = Math.atan2(aheadW.y - wp.y, aheadW.x - wp.x);
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

      self.postMessage(
        { type: "frame", carCount: n, pendingSpawns: state.pendingSpawns,
          positions, ids, colors, graces, selectedCar },
        [positions.buffer, ids.buffer, colors.buffer, graces.buffer]
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
