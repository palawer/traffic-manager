import { state } from "./state.js";

const KEY = "traffic_manager_v1";
const SAVE_MIN_INTERVAL_MS = 250;
let lastSaveAt = 0;
let saveTimer = null;

function writeStateSnapshot() {
  const data = {
    nextNodeId: state.nextNodeId,
    nextSegmentId: state.nextSegmentId,
    nodes: [...state.nodes.entries()],
    segments: [...state.segments.entries()],
    laneArrows: [...state.laneArrows.entries()].map(([k, v]) => [k, [...v]]),
    userConnectors: [...state.userConnectors.entries()].map(([nodeId, nodeMap]) => [
      nodeId,
      [...nodeMap.entries()].map(([inKey, outSet]) => [inKey, [...outSet]]),
    ]),
    signals: [...state.signals.entries()].map(([nodeId, sig]) => [nodeId, {
      nodeId: sig.nodeId,
      phases: sig.phases.map(p => ({
        duration: p.duration,
        greenConnectors: [...p.greenConnectors],
      })),
      currentPhase: sig.currentPhase,
      phaseTimer: sig.phaseTimer,
    }]),
  };
  localStorage.setItem(KEY, JSON.stringify(data));
  lastSaveAt = Date.now();
}

export function saveState() {
  try {
    const now = Date.now();
    const wait = SAVE_MIN_INTERVAL_MS - (now - lastSaveAt);
    if (wait <= 0 && !saveTimer) {
      writeStateSnapshot();
      return;
    }
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        writeStateSnapshot();
      } catch (e) {
        console.warn("saveState failed:", e);
      }
    }, Math.max(0, wait));
  } catch (e) {
    console.warn("saveState failed:", e);
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    state.nextNodeId = data.nextNodeId ?? 1;
    state.nextSegmentId = data.nextSegmentId ?? 1;
    state.nodes = new Map(data.nodes);
    state.segments = new Map(
      (data.segments ?? []).map(([id, seg]) => [
        id,
        {
          ...seg,
          lanesAtoB: Math.max(1, seg?.lanesAtoB ?? 1),
          lanesBtoA: Math.max(1, seg?.lanesBtoA ?? 1),
        },
      ])
    );
    state.laneArrows = new Map(
      (data.laneArrows ?? []).map(([k, v]) => [k, new Set(v)])
    );
    state.userConnectors = new Map(
      (data.userConnectors ?? []).map(([nodeId, inArr]) => [
        nodeId,
        new Map(inArr.map(([inKey, outArr]) => [inKey, new Set(outArr)])),
      ])
    );
    state.signals = new Map(
      (data.signals ?? []).map(([nodeId, sig]) => [nodeId, {
        ...sig,
        phases: sig.phases.map(p => ({
          ...p,
          greenConnectors: new Set(p.greenConnectors),
        })),
      }])
    );
    return true;
  } catch (e) {
    console.warn("loadState failed:", e);
    return false;
  }
}
