function makeRoundaboutType(id, radius, label) {
  const arm = radius + 84;
  return {
    id,
    label,
    isRoundabout: true,
    radius,
    arm,
    connectors: [
      { x: arm, y: 0, dir: 0 },
      { x: 0, y: arm, dir: Math.PI / 2 },
      { x: -arm, y: 0, dir: Math.PI },
      { x: 0, y: -arm, dir: -Math.PI / 2 },
    ],
    pickRadius: arm + 24,
    overlapRadius: radius + 28,
  };
}

export const PIECES = {
  straight: {
    id: "straight",
    label: "Recta",
    connectors: [
      { x: -100, y: 0, dir: Math.PI },
      { x: 100, y: 0, dir: 0 },
    ],
    pickRadius: 120,
    overlapRadius: 50,
  },
  curve: {
    id: "curve",
    label: "Curva",
    radius: 100,
    center: { x: -100, y: -100 },
    connectors: [
      { x: -100, y: 0, dir: Math.PI },
      { x: 0, y: -100, dir: -Math.PI / 2 },
    ],
    pickRadius: 130,
    overlapRadius: 50,
  },
  traffic_light_cross: {
    id: "traffic_light_cross",
    label: "Cruce semaforizado",
    isTrafficLightCross: true,
    connectors: [
      { x: 100, y: 0, dir: 0 },
      { x: 0, y: 100, dir: Math.PI / 2 },
      { x: -100, y: 0, dir: Math.PI },
      { x: 0, y: -100, dir: -Math.PI / 2 },
    ],
    pickRadius: 132,
    overlapRadius: 64,
  },
  roundabout_s: makeRoundaboutType("roundabout_s", 52, "Rotonda S"),
  roundabout_m: makeRoundaboutType("roundabout_m", 72, "Rotonda M"),
  roundabout_l: makeRoundaboutType("roundabout_l", 96, "Rotonda L"),
};
