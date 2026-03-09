# menorca-traffic — Contexto del proyecto

## Qué es esto

Fork de [traffic-manager](https://github.com/palawer/traffic-manager) — un simulador de tráfico browser con canvas infinito, estilo Cities Skylines / TMPE.

El objetivo no es un juego: es una **herramienta de comunicación ciudadana** para visualizar el problema del exceso de vehículos en Menorca en verano, y el impacto de limitarlo.

**Mensaje central:** en verano se duplican los coches en la isla. Las carreteras colapsan. ¿Qué pasaría si limitáramos la entrada?

---

## Stack original (traffic-manager)

- Vanilla JavaScript, sin frameworks
- PixiJS para rendering (incluido como `pixi.min.js` local)
- Grafo nodo-segmento: nodos + segmentos con carriles direccionales
- A* para pathfinding con selección de carril
- Car-following con distancia mínima y colisiones
- Semáforos con fases programables
- Persistencia con localStorage
- Sin bundler — se sirve directamente con `serve.sh` o Live Server

Archivos clave del original:
- `network.js` — grafo de carreteras (nodos + segmentos)
- `simulation.js` — motor de simulación (coches, car-following)
- `router.js` — pathfinding A*
- `junction.js` — lógica de intersecciones y semáforos
- `renderer.js` — rendering con PixiJS
- `state.js` — estado global
- `editor.js` — editor manual (se mantiene pero oculto por defecto)
- `persistence.js` — guardar/cargar red

---

## Qué cambia en este fork

### Lo que SE MANTIENE del original
- Motor de simulación completo (car-following, colisiones, semáforos)
- Pathfinding A*
- Renderer PixiJS
- Editor manual (oculto, accesible para debug)

### Lo que SE AÑADE

#### `osm-import.js` — Import de carreteras reales
- Query a Overpass API con bounding box de Menorca
- Filtra por tipo de vía: `motorway`, `trunk`, `primary`, `secondary`, `tertiary`, `residential`
- Proyección lat/lon → píxeles canvas (Mercator simple)
- Mapea nodos OSM → nodos del grafo existente
- Detecta intersecciones (nodo compartido entre varios ways → junction)
- Importa número de carriles desde tag `lanes` de OSM

Bounding box de Menorca:
```
minLat: 39.7800, maxLat: 40.1500
minLon: 3.8200, maxLon: 4.3300
```

Query Overpass base:
```
[out:json];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential)$"]
  (39.78,3.82,40.15,4.33);
(._;>;);
out body;
```

#### `scenarios.js` — Escenarios comparables
Tres escenarios con parámetros de spawn:

| Escenario | Vehículos | Color UI |
|-----------|-----------|----------|
| 🟢 Invierno | ~40.000 | verde |
| 🔴 Verano actual | ~90.000 | rojo |
| 🔵 Verano con cap | configurable | azul |

El spawn es proporcional al tipo de vía (más tráfico en PM-1 que en calle residencial).

#### UI nueva (panel lateral)
- Selector de escenario (3 botones grandes, visuales)
- Slider "cap de entrada" para el escenario azul
- Mapa de calor de congestión por zona
- Contador global: vehículos activos / velocidad media
- Sin editor de carreteras visible por defecto

---

## Datos y estimaciones

No hay datos reales de aforo. Se estima:
- Ratio invierno/verano basado en estadísticas públicas del Consell de Menorca (~2x vehículos en agosto)
- Distribución por tipo de vía: proporcional a jerarquía OSM
- Para comunicación ciudadana, el ratio es lo importante, no el número exacto

Fuentes a consultar si se quiere calibrar mejor:
- DGT: aforos en PM-1 (Maó–Ciutadella)
- Consell Insular de Menorca: estadísticas de movilidad
- Ports de les Illes Balears: datos de entrada de vehículos por ferry

---

## Carreteras clave de Menorca

- **PM-1**: eje principal Maó → Ciutadella (~45 km), la más cargada
- **PM-3**: Maó → Fornells
- **PM-7**: Maó → Sant Lluís / Punta Prima
- **Me-1 / Me-2 / Me-3**: accesos a pueblos costeros (es Migjorn, Cala en Porter, etc.)
- Nudos críticos: rotonda entrada Maó, salida Ciutadella, acceso Ferreries

---

## Decisiones de diseño

- **Fork, no proyecto nuevo**: el motor de simulación ya funciona. No rehacerlo.
- **No usar A/B Street**: demasiado complejo para el mensaje que se quiere comunicar. Esta herramienta es más simple e intencionada.
- **Estimaciones explícitas**: no pretender precisión científica. Documentar los supuestos claramente.
- **Audiencia: ciudadanos**, no técnicos ni políticos. La UI debe ser obvia sin explicación.
- **Una sola isla**: no tiene sentido hacer la herramienta genérica. Menorca primero, bien.

---

## Estado actual

- [ ] Fork creado desde `palawer/traffic-manager`
- [ ] `osm-import.js` — query Overpass + mapeo al grafo
- [ ] Proyección lat/lon → canvas
- [ ] `scenarios.js` — tres escenarios con spawn calibrado
- [ ] UI: panel de escenarios + mapa de calor
- [ ] Test con red simplificada (solo PM-1 + pueblos principales)
- [ ] Test con red completa de Menorca
- [ ] Deploy en GitHub Pages

---

## Cómo arrancar

```bash
# Clonar el fork
git clone https://github.com/TU_USER/menorca-traffic
cd menorca-traffic

# Servir localmente
./serve.sh 8000
# o con Python
python3 -m http.server 8000

# Abrir
open http://localhost:8000
```

---

## Notas para Claude CLI

- El proyecto es vanilla JS, sin bundler ni node_modules. No usar npm salvo para herramientas de dev.
- Mantener el estilo del código original: módulos ES6, sin TypeScript, comentarios en español.
- Antes de modificar cualquier archivo del original, leer su contenido completo.
- El archivo más importante a entender primero es `network.js` — define la estructura del grafo.
- Para testear el import OSM sin conexión, guardar una respuesta de Overpass en `fixtures/menorca-sample.json`.
