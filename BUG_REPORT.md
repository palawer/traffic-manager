# Informe de Bugs (Estado Actualizado)

## Pendientes

1. **La simulación no es “siempre activa”**
- Sigue habiendo pausa en runtime: [main.js:43](/Users/guillem/repos/rotonda/main.js:43), [renderer.js:676](/Users/guillem/repos/rotonda/renderer.js:676), [editor.js:576](/Users/guillem/repos/rotonda/editor.js:576), [index.html:95](/Users/guillem/repos/rotonda/index.html:95).

2. **Escrituras masivas a `localStorage` durante edición (riesgo de tirones)**
- `rebuildJunctions()` persiste siempre: [network.js:103](/Users/guillem/repos/rotonda/network.js:103).
- Durante drag de nodos se marca `networkDirty` continuamente: [editor.js:499](/Users/guillem/repos/rotonda/editor.js:499).
- El render puede reconstruir junctions en cada frame: [renderer.js:217](/Users/guillem/repos/rotonda/renderer.js:217).
