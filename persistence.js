import { state } from "./state.js";

const KEY = "rotonda_v1";

export function saveState() {
  try {
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
    state.segments = new Map(data.segments);
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
