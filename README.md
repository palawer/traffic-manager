# Traffic Manager

Simulador de tráfico en navegador con canvas infinito para construir redes de carreteras al estilo Cities Skylines / TMPE.

## Características

- Grafo nodo-segmento: carreteras de cualquier ángulo entre nodos
- Carriles multi-dirección (AtoB / BtoA) con tráfico por la derecha
- Conectores de carril personalizables (TMPE)
- Semáforos con fases programables
- Pathfinding A* con selección de carril por giro planificado
- Car-following con distancia mínima y colisiones con explosión

## Ejecutar

Abre `index.html` en un servidor local (o usa Live Server en VS Code).

Opcionalmente puedes usar:

```bash
./serve.sh 8000
```

y abrir `http://localhost:8000`.

PixiJS se carga desde `./pixi.min.js` incluido en el proyecto.

## Controles

- `R` — herramienta carretera
- `S` — seleccionar/mover
- `C` — conectores de carril
- `T` — semáforos
- `V` — límite de velocidad
- `P` — pausar/reanudar simulación
- Click en vacío (modo carretera): crear nodo y empezar carretera
- Click en nodo existente (modo carretera): conectar desde él
- Segundo click: finalizar carretera
- `Supr`/`Backspace` — borrar nodo o segmento seleccionado
- `Esc` — cancelar acción en curso
- Rueda — zoom
- `Espacio + arrastre` — mover cámara

## Documentación

Los documentos de proyecto están en [`docs/`](docs/):

- [`docs/TODO.md`](docs/TODO.md)
- [`docs/BUG_REPORT.md`](docs/BUG_REPORT.md)
- [`docs/CITIES_SKYLINES_ANALYSIS.md`](docs/CITIES_SKYLINES_ANALYSIS.md)
