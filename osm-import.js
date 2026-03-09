// osm-import.js — Importa la red de carreteras de Menorca desde Overpass API

import { addNode, addSegment } from "./network.js";
import { saveState } from "./persistence.js";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Bounding box de Menorca
export const BBOX = {
  minLat: 39.7800,
  maxLat: 40.1500,
  minLon: 3.8200,
  maxLon: 4.3300,
};

// Escala: píxeles por grado de latitud.
// 1 grado lat = 111.320 km → SCALE=111320 da exactamente 1 px/m.
// Con esto LANE_WIDTH=14px ≈ 14m (~4× el ancho real, habitual en simuladores).
// La isla queda ~43.000px de ancho → usar zoom 0.03–0.1 para verla completa.
export const SCALE = 111320;

// Velocidades por defecto según tipo de vía (km/h)
const SPEED_BY_HIGHWAY = {
  motorway:     120,
  trunk:        100,
  primary:       90,
  secondary:     80,
  tertiary:      60,
  residential:   30,
  unclassified:  50,
};

// Carriles por defecto por dirección según tipo de vía
const LANES_BY_HIGHWAY = {
  motorway:     2,
  trunk:        2,
  primary:      1,
  secondary:    1,
  tertiary:     1,
  residential:  1,
  unclassified: 1,
};

/** Proyección Mercator simple: lat/lon → coordenadas de canvas.
 *  Y invertida para que el norte quede arriba. */
function project(lat, lon) {
  const x = (lon - BBOX.minLon) * SCALE;
  const y = (BBOX.maxLat - lat) * SCALE;
  return { x, y };
}

/** Construye la query Overpass para las carreteras de Menorca. */
function buildQuery() {
  const { minLat, maxLat, minLon, maxLon } = BBOX;
  return `[out:json][timeout:60];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential)$"]
  (${minLat},${minLon},${maxLat},${maxLon});
(._;>;);
out body;`;
}

const FIXTURE_URL = "./fixtures/menorca-sample.json";

/** Carga la red OSM: primero intenta el fixture local; si falla, consulta Overpass.
 *  @param {function} onProgress  Callback opcional: recibe mensajes de estado.
 *  @returns {{ nodes: number, segments: number }}
 */
export async function importOSM(onProgress) {
  // Intentar fixture local primero (evita petición de red en desarrollo)
  try {
    onProgress?.("Cargando datos locales…");
    const res = await fetch(FIXTURE_URL);
    if (res.ok) {
      const data = await res.json();
      return importOSMData(data, onProgress);
    }
  } catch (_) {
    // fixture no disponible, seguimos con Overpass
  }

  onProgress?.("Consultando Overpass API…");
  let response;
  try {
    response = await fetch(OVERPASS_URL, {
      method: "POST",
      body: "data=" + encodeURIComponent(buildQuery()),
    });
  } catch (err) {
    throw new Error("No se pudo conectar a Overpass API: " + err.message);
  }

  if (!response.ok) {
    throw new Error(`Overpass respondió con estado ${response.status}`);
  }

  const data = await response.json();
  return importOSMData(data, onProgress);
}

/** Importa desde un objeto JSON de Overpass (permite test offline con fixture).
 *  @param {object} data       Respuesta de Overpass (parsed JSON).
 *  @param {function} onProgress
 *  @returns {{ nodes: number, segments: number }}
 */
export function importOSMData(data, onProgress) {
  onProgress?.("Procesando nodos OSM…");

  // Separar nodos y ways del elemento raíz
  const osmNodes = new Map();  // osmId → { lat, lon }
  const osmWays  = [];

  for (const el of data.elements) {
    if (el.type === "node") {
      osmNodes.set(el.id, { lat: el.lat, lon: el.lon });
    } else if (el.type === "way" && el.tags?.highway) {
      osmWays.push(el);
    }
  }

  onProgress?.(`OSM: ${osmNodes.size} nodos, ${osmWays.length} vías`);

  // Contar cuántas vías usan cada nodo OSM → detectar intersecciones
  const nodeUsageCount = new Map();
  for (const way of osmWays) {
    for (const osmId of way.nodes) {
      nodeUsageCount.set(osmId, (nodeUsageCount.get(osmId) ?? 0) + 1);
    }
  }

  // Un nodo es "clave" si es extremo de la vía o pertenece a ≥2 vías (intersección)
  function isKeyNode(osmId, idxInWay, wayLen) {
    return idxInWay === 0 ||
           idxInWay === wayLen - 1 ||
           (nodeUsageCount.get(osmId) ?? 0) > 1;
  }

  // Mapa osmId → nodeId del simulador (se crea perezosamente)
  const osmToSim = new Map();

  function getOrCreateSimNode(osmId) {
    if (osmToSim.has(osmId)) return osmToSim.get(osmId);
    const n = osmNodes.get(osmId);
    if (!n) return null;
    const { x, y } = project(n.lat, n.lon);
    const simId = addNode(x, y);
    osmToSim.set(osmId, simId);
    return simId;
  }

  // Recorrer las vías: crear un segmento entre cada par de nodos clave consecutivos
  let segmentsCreated = 0;

  for (const way of osmWays) {
    const hwType = way.tags.highway;
    const speedLimit = (parseInt(way.tags.maxspeed) || SPEED_BY_HIGHWAY[hwType] || 50) / 3.6; // km/h → m/s

    const isOneway =
      way.tags.oneway === "yes" ||
      way.tags.oneway === "1"   ||
      hwType === "motorway";

    // Calcular carriles por dirección
    const totalLanes = parseInt(way.tags.lanes) || null;
    let lanesAtoB, lanesBtoA;

    if (isOneway) {
      lanesAtoB = totalLanes || LANES_BY_HIGHWAY[hwType] || 1;
      lanesBtoA = 0;
    } else if (totalLanes) {
      const half = Math.max(1, Math.round(totalLanes / 2));
      lanesAtoB = half;
      lanesBtoA = half;
    } else {
      const def = LANES_BY_HIGHWAY[hwType] || 1;
      lanesAtoB = def;
      lanesBtoA = def;
    }

    // Recorrer los nodos de la vía; los intermedios se guardan como geometría
    let prevSimId = null;
    let prevKeyIdx = -1;

    for (let i = 0; i < way.nodes.length; i++) {
      const osmId = way.nodes[i];
      if (!isKeyNode(osmId, i, way.nodes.length)) continue;

      const simId = getOrCreateSimNode(osmId);
      if (simId === null) continue;

      if (prevSimId !== null && prevSimId !== simId) {
        // Recolectar todos los puntos entre el nodo clave anterior y éste
        const geometry = [];
        for (let j = prevKeyIdx; j <= i; j++) {
          const n = osmNodes.get(way.nodes[j]);
          if (n) geometry.push(project(n.lat, n.lon));
        }
        addSegment(prevSimId, simId, lanesAtoB, lanesBtoA, speedLimit, geometry);
        segmentsCreated++;
      }

      prevSimId = simId;
      prevKeyIdx = i;
    }
  }

  const nodesCreated = osmToSim.size;
  onProgress?.(`Creados ${nodesCreated} nodos y ${segmentsCreated} segmentos`);

  saveState();

  onProgress?.("¡Importación completada!");
  return { nodes: nodesCreated, segments: segmentsCreated };
}
