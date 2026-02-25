# Rotonda Lab (prototipo)

Prototipo de juego/simulador en navegador con canvas infinito para construir redes de carreteras con:

- Rectas
- Curvas de 90º
- Rotondas de 3 tamaños (S/M/L)

Incluye simulación siempre activa con coches que:

- Entran por conexiones abiertas
- Recorren la red conectada
- Mantienen distancia de seguridad básica
- Ceden el paso al entrar en rotondas (regla simplificada)

## Ejecutar

Abre `index.html` en tu navegador o usa un servidor local.

PixiJS se carga desde `./pixi.min.js` en el propio proyecto.

## Controles

- `Seleccionar`: seleccionar/mover piezas
- `Recta`, `Curva`, `Rotonda`: modo colocación
- Click en canvas: colocar pieza activa
- `R` en modo colocación: rotar pieza a colocar 90º
- `R` en modo selección: rotar pieza seleccionada 90º
- `Supr`: borrar pieza seleccionada
- Rueda: zoom
- `Espacio + arrastre`: mover cámara
- `Spawn coche`: añade un coche manualmente

## Notas

- Es un MVP: la lógica de tráfico está simplificada.
- Si cambias la red, se reinician los coches para recalcular rutas.
