// coastline.js — Carga y proyecta la línea de costa de Menorca desde el fixture OSM.
// Exporta los anillos/polylines ya en coordenadas de canvas, listos para pintar.

import { BBOX, SCALE } from "./osm-import.js";

const FIXTURE_URL = "./fixtures/menorca-coastline.json";

/** Proyección idéntica a la de osm-import.js */
function project(lat, lon) {
  const x = (lon - BBOX.minLon) * SCALE;
  const y = (BBOX.maxLat - lat) * SCALE;
  return { x, y };
}

/**
 * Ensambla los ways de coastline en cadenas continuas.
 * Cada cadena es un array de {x, y}.
 * Los anillos cerrados (isla pequeña) y las cadenas abiertas (costa principal)
 * se devuelven juntos — el caller decide cómo pintar cada uno.
 *
 * @returns {Promise<Array<{points: {x,y}[], closed: boolean}>>}
 */
export async function loadCoastline() {
  const res = await fetch(FIXTURE_URL);
  if (!res.ok) throw new Error(`No se pudo cargar el fixture de costa: ${res.status}`);
  const data = await res.json();

  const osmNodes = new Map();
  const osmWays  = [];

  for (const el of data.elements) {
    if (el.type === "node") osmNodes.set(el.id, { lat: el.lat, lon: el.lon });
    else if (el.type === "way") osmWays.push(el);
  }

  // Índices para ensamblar cadenas
  const wayById     = new Map(osmWays.map(w => [w.id, w.nodes]));
  const startToWay  = new Map(osmWays.map(w => [w.nodes[0],       w.id]));
  const endToWay    = new Map(osmWays.map(w => [w.nodes.at(-1),   w.id]));

  const visited = new Set();
  const chains  = [];

  for (const way of osmWays) {
    if (visited.has(way.id)) continue;

    // Seguir la cadena hacia adelante
    const nodeIds = [...way.nodes];
    visited.add(way.id);

    let head = nodeIds.at(-1);
    while (startToWay.has(head) && !visited.has(startToWay.get(head))) {
      const nextId = startToWay.get(head);
      const next   = wayById.get(nextId);
      nodeIds.push(...next.slice(1));
      visited.add(nextId);
      head = nodeIds.at(-1);
    }

    const closed = nodeIds[0] === nodeIds.at(-1);
    const points = nodeIds
      .map(id => osmNodes.get(id))
      .filter(Boolean)
      .map(n => project(n.lat, n.lon));

    if (points.length >= 2) chains.push({ points, closed });
  }

  return chains;
}
