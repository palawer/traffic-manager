# Informe de Bugs (Estado Actualizado)

## Pendientes

1. **La simulación no es “siempre activa”**
- Sigue habiendo pausa en runtime: [main.js:43](/Users/guillem/repos/rotonda/main.js:43), [renderer.js:676](/Users/guillem/repos/rotonda/renderer.js:676), [editor.js:576](/Users/guillem/repos/rotonda/editor.js:576), [index.html:95](/Users/guillem/repos/rotonda/index.html:95).

2. **Escrituras masivas a `localStorage` durante edición (riesgo de tirones)**
- `rebuildJunctions()` persiste siempre: [network.js:103](/Users/guillem/repos/rotonda/network.js:103).
- Durante drag de nodos se marca `networkDirty` continuamente: [editor.js:499](/Users/guillem/repos/rotonda/editor.js:499).
- El render puede reconstruir junctions en cada frame: [renderer.js:217](/Users/guillem/repos/rotonda/renderer.js:217).

3. **Cola de spawn puede quedarse atascada**
- Si no hay rutas válidas, la cola pendiente puede no vaciarse y seguir intentando cada frame: [simulation.js:147](/Users/guillem/repos/rotonda/simulation.js:147).

## Resueltos recientemente

1. **Persistencia de herramienta `speed`**
- Añadido `saveState()` tras cambiar `seg.speedLimit` en [editor.js:376](/Users/guillem/repos/rotonda/editor.js:376).
- Commit: `d6a7ada`.

2. **Parada sobre línea de stop**
- Añadido margen configurable antes de línea de stop (`STOP_LINE_CLEARANCE`) en [config.js:168](/Users/guillem/repos/rotonda/config.js:168) y aplicado en [simulation.js:162](/Users/guillem/repos/rotonda/simulation.js:162).
- Commit relacionado: `8c5e699`.

3. **Coches bloqueados al volver semáforo a verde**
- Fallback de conector en lookahead para evitar bloqueo por matching demasiado estricto: [simulation.js:188](/Users/guillem/repos/rotonda/simulation.js:188).
- Commit: `38a70c6`.

4. **Rutas rotas con conectores de usuario y U-turn inválido en cruces**
- Selección de carril ahora valida conectores reales: [router.js:113](/Users/guillem/repos/rotonda/router.js:113).
- Prohibido U-turn inmediato en intersección: [router.js:147](/Users/guillem/repos/rotonda/router.js:147), [simulation.js:456](/Users/guillem/repos/rotonda/simulation.js:456).
- Commit: `9e88511`.

5. **Inconsistencia inicial del botón Debug**
- Alineado estado inicial de UI con el estado real (`debugLanes: false`):
  [index.html:97](/Users/guillem/repos/rotonda/index.html:97) ahora arranca como `Debug: OFF` sin clase activa.
