# Traffic Manager

Simulador de tráfico en navegador con canvas infinito para construir redes de carreteras al estilo Cities Skylines / TMPE.

## Características

- Grafo nodo-segmento: carreteras de cualquier ángulo entre nodos
- Carriles multi-dirección (AtoB / BtoA) con tráfico por la derecha
- Conectores de carril personalizables (TMPE) y flechas de carril
- Semáforos con fases programables
- Pathfinding A* con selección de carril por giro planificado
- Car-following con distancia mínima y colisiones con explosión

## Ejecutar

Abre `index.html` en un servidor local (o usa Live Server en VS Code).

PixiJS se carga desde `./pixi.min.js` incluido en el proyecto.

## Controles

- `N` — herramienta nodo: click para colocar, arrastrar para mover
- `R` — herramienta carretera: click en dos nodos para conectarlos
- `S` — selección: click en nodo/segmento, `Supr` para borrar
- `Esc` — cancelar acción en curso
- Rueda — zoom
- `Espacio + arrastre` — mover cámara
