# Informe de Bugs (Revisión Completa)

## Hallazgos (priorizados)

1. **La simulación no es “siempre activa” (regresión funcional)**
- Hay lógica de pausa activa en runtime: en [main.js:43](/Users/guillem/repos/rotonda/main.js:43) se deja de simular cuando `state.paused` es `true`.
- El botón de pausa sigue existiendo y muta ese estado en [renderer.js:676](/Users/guillem/repos/rotonda/renderer.js:676) y también por teclado `P` en [editor.js:576](/Users/guillem/repos/rotonda/editor.js:576).
- UI aún lo expone en [index.html:95](/Users/guillem/repos/rotonda/index.html:95).

2. **Cambiar velocidad con la herramienta `speed` no se guarda en persistencia**
- En el flujo de click de `speed` se modifica `seg.speedLimit` pero no se llama a `saveState()` ([editor.js:367](/Users/guillem/repos/rotonda/editor.js:367) a [editor.js:378](/Users/guillem/repos/rotonda/editor.js:378)).
- Resultado: recargas la página y se pierden esos cambios.

3. **Escrituras masivas a `localStorage` durante edición (riesgo de tirones)**
- `rebuildJunctions()` siempre hace `saveState()` ([network.js:89](/Users/guillem/repos/rotonda/network.js:89) y [network.js:103](/Users/guillem/repos/rotonda/network.js:103)).
- Mientras arrastras nodos, se marca `networkDirty` continuamente ([editor.js:498](/Users/guillem/repos/rotonda/editor.js:498)).
- Cada frame de render llama `drawRoads()`, que puede reconstruir junctions ([renderer.js:217](/Users/guillem/repos/rotonda/renderer.js:217)).
- Esto puede provocar mucha E/S síncrona en navegador.

4. **En extremos sin salida, los coches se eliminan en vez de “dar la vuelta”**
- Si no hay conector válido al llegar al final, se elimina el coche ([simulation.js:247](/Users/guillem/repos/rotonda/simulation.js:247), [simulation.js:313](/Users/guillem/repos/rotonda/simulation.js:313)).
- Además se prohíben U-turns por defecto en junctions ([junction.js:168](/Users/guillem/repos/rotonda/junction.js:168)).
- Comportamiento observado: desaparición en dead-ends.

5. **Cola de spawn puede quedarse “atascada” indefinidamente**
- Si `state.pendingSpawns > 0` y no hay rutas válidas, no se consume la cola (solo se limpia si `nodes.size < 2`) en [simulation.js:147](/Users/guillem/repos/rotonda/simulation.js:147) a [simulation.js:154](/Users/guillem/repos/rotonda/simulation.js:154).
- Efecto: intentos fallidos cada frame y contador creciendo sin salida.

6. **Inconsistencia UI inicial del botón Debug**
- Estado inicial real: `debugLanes: false` en [state.js:78](/Users/guillem/repos/rotonda/state.js:78).
- HTML arranca mostrando `Debug: ON` y clase activa en [index.html:97](/Users/guillem/repos/rotonda/index.html:97).
- Luego JS lo corrige, pero hay desalineación inicial.
