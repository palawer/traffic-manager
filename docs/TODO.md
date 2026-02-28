# TODO

## Pendiente de esta sesión
- ~~Cuando hagas click en un coche que se vea la ruta que hará~~ ✓
- ~~play/pause~~ ✓

---

## Fase 2 — Herramientas TMPE

La infraestructura de datos ya está lista. Solo falta construir la UI.

### ~~Flechas de carril~~ ✓
- ~~Herramienta para pintar qué direcciones permite cada carril (izquierda / recto / derecha)~~
- ~~Los datos ya existen: `state.laneArrows`; el router ya las consulta en `routeToLaneSequence`~~

### Editor de conectores de carril
- Herramienta para redibujar manualmente qué carril de entrada conecta con qué carril de salida en un nodo
- Los conectores ya se generan automáticamente en `junction.js`; aquí se sobreescriben con `userDefined: true`

### ~~Semáforos programables~~ ✓ (versión básica)
- ~~Herramienta para configurar fases y duraciones por nodo~~
- Click en nodo → activa semáforo 2 fases (15s cada una), otro click lo quita

### ~~Límite de velocidad~~ ✓
- ~~Brocha para cambiar el `speedLimit` por segmento desde la UI~~
- ~~El campo ya existe en cada segmento y el A* lo usa como coste de arista~~

---

## Otras ideas
- Panel de propiedades del segmento: nº de carriles ±, límite de velocidad
- Visualización de overlays TMPE: flechas sobre los carriles, arcos de conectores, cabezas de semáforo
