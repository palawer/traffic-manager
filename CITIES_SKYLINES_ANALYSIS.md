# Cities Skylines vs Rotonda Lab — Análisis comparativo

## Lo que ya tenemos ✅

| Feature | CS | Rotonda |
|---|---|---|
| Grafo nodo-segmento | ✓ | ✓ |
| Carriles multi-dirección (AtoB/BtoA) | ✓ | ✓ |
| Límite de velocidad por segmento | ✓ | ✓ |
| A* pathfinding | ✓ | ✓ |
| Flechas de carril (TMPE) | ✓ | ✓ |
| Conectores de carril personalizados (TMPE) | ✓ | ✓ |
| Semáforos con fases programables | ✓ | ✓ |
| Car-following con distancia mínima | ✓ | ✓ |
| Tráfico lado derecho | ✓ | ✓ |
| Colisiones entre carriles cruzados | parcial | ✓ |

---

## Las diferencias principales

### 1. Carreteras curvas (Bezier) — Impacto visual alto
CS: Cada carretera es una curva bezier cúbica. Al arrastrar, el usuario puede definir la curvatura. Los carriles siguen el contorno exacto de la curva.

Nosotros: Segmentos rectos entre nodos. Las curvas solo existen dentro de las junctions (conectores de carril).

**Para emularlo**: Añadir un punto de control tangente a cada segmento. `buildLanePath` generaría una polyline bezier en lugar de una línea recta. El editor daría un handle en el centro del segmento para arrastrar la curva.

---

### 2. Cambio de carril — El más importante funcionalmente
CS: Los coches cambian de carril de forma dinámica cuando:
- Se acercan a una intersección y necesitan el carril correcto para su destino
- Hay un coche lento delante y el carril adyacente está libre
- Al fusionarse en una autopista (merge)

Nosotros: Un coche está fijado a su carril para toda la vida del segmento. Si no puede entrar a una junction desde su carril (semáforo, bloqueado), espera. No hay cambio de carril reactivo.

**Para emularlo**: Lógica que, cuando un coche está bloqueado o a X px del final del segmento, busca si el carril adyacente tiene espacio libre y ejecuta una transición suave (interpolación de posición lateral durante N frames).

---

### 3. Routing dinámico / congestion-aware — Alto impacto
CS: El A* pondera las aristas por densidad de tráfico. Una carretera congestionada tiene mayor coste efectivo y los coches buscan rutas alternativas. La recarga de rutas ocurre cada cierto tiempo.

Nosotros: A* puramente por distancia/velocidad. Una vez spawneado, el coche nunca cambia de ruta aunque haya congestión.

**Para emularlo**:
- Mantener un `flowScore` por segmento (nº coches actuales / capacidad).
- Multiplicar el coste de arista A* por `1 + flowScore`.
- Recalcular la ruta de cada coche cada ~30s de simulación.

---

### 4. Jerarquía de tipos de carretera — Visual + funcional
CS tiene: calles residenciales (1 carril, 30 km/h), arterias (2-4 carriles, 50 km/h), avenidas con mediana, carreteras (80 km/h), autopistas (120 km/h, solo acceso por rampa, sin semáforos).

Nosotros: Solo `speedLimit` y `lanesAtoB/BtoA`. No hay concepto de "tipo de carretera" que lleve consigo defaults visuales o reglas de comportamiento.

**Para emularlo**: Un campo `type` en el segmento (`"street" | "avenue" | "road" | "highway"`) que define: velocidad por defecto, aspecto visual (color de asfalto, anchura de bordillo, mediana), si admite semáforos, si admite acceso directo o solo por rampa.

---

### 5. Reglas de prioridad (Stop / Ceda el paso) — Funcional importante
CS: En junctions sin semáforo, las carreteras de mayor jerarquía tienen prioridad. TMPE permite configurar el tipo de control por carretera (prioridad, stop, ceda). Los coches en la carretera secundaria esperan un hueco en el tráfico principal.

Nosotros: Sin semáforo = paso libre siempre. No existe "ceda el paso" ni "stop".

**Para emularlo**:
- Añadir `yieldRule` a cada conector (`"free" | "yield" | "stop"`).
- En `updateCarOnSegment`, en la zona de lookahead: si la regla es `yield`, comprobar si hay coches en los conectores del mismo nodo con prioridad alta. Si hay → target = 0.

---

### 6. Carreteras de un solo sentido — Fácil
CS: Carreteras one-way son muy comunes (calles de centro urbano, rampas de autopista).

Nosotros: Técnicamente posible con `lanesBtoA = 0`, pero el editor no lo expone claramente y el renderizado no muestra una carretera one-way diferente.

**Para emularlo**: Botón en el panel de propiedades "One-way →" que pone `lanesBtoA = 0` y cambia el visual (flecha en la carretera).

---

### 7. División automática de segmento al colocar un nodo — Editor UX
CS: Si colocas un nodo sobre una carretera existente, el segmento se divide automáticamente en dos. No necesitas borrar y redibujar.

Nosotros: Si quieres insertar una intersección en medio de un segmento, hay que borrar el segmento y redibujarlo en dos partes manualmente.

**Para emularlo**: En el tool de nodo/carretera, si el click cae sobre un segmento existente, crear el nuevo nodo + dividir el segmento en dos (A→nuevo, nuevo→B), preservando lanesAtoB, lanesBtoA y speedLimit.

---

### 8. Visualización de flujo / congestión — Visual útil
CS: Vista de "densidad de tráfico" que colorea carreteras de verde (fluido) a rojo (congestionado). TMPE añade overlay de carriles individuales.

Nosotros: Ninguna métrica visual de flujo.

**Para emularlo**: Calcular `density[segId] = nº coches en ese segmento / longitud * LANE_WIDTH`. Overlay opcional que colorea los segmentos con un gradiente verde→rojo.

---

### 9. Rotondas con ceda el paso automático — Funcional
CS: Las rotondas (roundabouts) tienen yield automático en las entradas. Los coches dentro tienen prioridad, los de fuera esperan un hueco.

Nosotros: Una rotonda dibujada manualmente funcionaría, pero todos los conectores son "free pass" — ningún coche cede el paso.

**Para emularlo**: Combinación de la regla yield (punto 5) + que el router prefiera rutas que pasen por la rotonda.

---

### 10. Giros en U — Pequeño pero visible
CS (con TMPE): Los giros en U se pueden habilitar/deshabilitar por carril. Por defecto están deshabilitados en arterias.

Nosotros: Los conectores auto-generados no crean U-turns (se excluye el segmento de origen en `buildDefaultConnectors`). Con el editor de conectores se podría crear uno manualmente.

**Para emularlo**: Añadir un toggle "Permitir U-turn" en el nodo, que crea un conector del carril más a la izquierda de AtoB al carril más a la izquierda de BtoA del mismo segmento.

---

## Ranking por impacto / esfuerzo

| Prioridad | Feature | Impacto | Esfuerzo |
|---|---|---|---|
| 1 | Cambio de carril dinámico | Muy alto | Alto |
| 2 | Routing congestion-aware | Alto | Medio |
| 3 | Reglas de prioridad / yield | Alto | Medio |
| 4 | Carreteras curvas (bezier) | Medio-alto | Medio |
| 5 | División de segmento al click | Medio | Bajo |
| 6 | One-way roads (UI) | Medio | Bajo |
| 7 | Tipos de carretera | Medio | Medio |
| 8 | Visualización de congestión | Medio | Bajo |
| 9 | Rotondas con yield | Medio | Medio |
| 10 | Giros en U | Bajo | Bajo |

---

## Lo que NO merece la pena emular (fuera de scope)
- Tráfico peatonal / cruces de peatones
- Parking y búsqueda de aparcamiento
- Vehículos de servicio (ambulancias, bomberos)
- Transporte público (buses, metro)
- Zonificación y generación de tráfico por uso de suelo
- Topografía / terreno 3D
