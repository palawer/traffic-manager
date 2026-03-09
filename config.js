/**
 * config.js — All tunable simulation parameters in one place.
 *
 * Sections:
 *   ROAD GEOMETRY     — lane dimensions, grid snap
 *   SIMULATION        — timing, car behaviour, spawning, rerouting
 *   ROAD MARKINGS     — stroke widths
 *   NODES             — node handle appearance
 *   CARS              — car body geometry and selection highlight
 *   ROUTE DISPLAY     — selected-car route line and destination pin
 *   DEBUG OVERLAY     — lane-path lines
 *   EDITOR            — camera zoom limits, grid
 */


// ═══════════════════════════════════════════════════════════════════════════════
// ROAD GEOMETRY
// ═══════════════════════════════════════════════════════════════════════════════

export const LANE_WIDTH     = 14;  // width of one lane in world px
export const ROAD_WIDTH     = 44;  // legacy compat value (≈ 2 × old lane model)
export const GRID           = 20;  // snap grid size in world px
export const NODE_SNAP_DIST = 20;  // snap to existing node when closer than this (world px)


// ═══════════════════════════════════════════════════════════════════════════════
// SIMULATION
// ═══════════════════════════════════════════════════════════════════════════════

// ── Timing ────────────────────────────────────────────────────────────────────
export const MAX_DT          = 0.05; // max simulated seconds per frame (caps physics on slow frames)

// ── Speed limits & lanes ──────────────────────────────────────────────────────
export const DEFAULT_SPEED_LIMIT = 80;             // km/h assigned to new segments
export const SPEED_PRESETS       = [30, 50, 80, 120]; // cycling order in the property panel
export const MAX_LANES           = 4;              // max lanes per direction editable in the UI

// ── Car personality ───────────────────────────────────────────────────────────
export const SPEED_FACTOR_MIN   = 0.85; // slowest driver as a fraction of the speed limit
export const SPEED_FACTOR_RANGE = 0.20; // random range added on top → max factor = 1.05

// ── Car dynamics ──────────────────────────────────────────────────────────────
export const CAR_ACCEL = 4;   // acceleration rate (m/s²)
export const CAR_BRAKE = 7;   // deceleration rate (m/s²)

// ── Car following (IDM-lite) ──────────────────────────────────────────────────
export const CAR_STOP_DIST   = 16;  // gap to obstacle that triggers a full stop (px)
export const CAR_SLOW_DIST   = 40;  // gap to obstacle that triggers slowing (px)
export const CAR_SLOW_FACTOR = 0.4; // speed multiplier applied in the slow zone

// ── Car spawning ──────────────────────────────────────────────────────────────
export const SPAWN_CLEARANCE    = 35; // spawn point must be clear within this radius (px)
export const SPAWN_MAX_ATTEMPTS = 6;  // max spawn attempts per frame before giving up
export const SPAWN_BATCH        = 10; // number of cars queued per button click
export const SPAWN_GRACE_TIME   = 2;  // seconds of collision immunity for newly spawned cars

// ── Rerouting ─────────────────────────────────────────────────────────────────
export const REROUTE_RETRY_INTERVAL = 3.0; // seconds to wait before retrying a failed reroute
export const REROUTE_MAX_RETRIES    = 4;   // failed retries before the stuck car is removed


// ═══════════════════════════════════════════════════════════════════════════════
// COLORS
// ═══════════════════════════════════════════════════════════════════════════════

// Background & grid
export const COLOR_BG         = 0xd9e5db; // canvas background (light green-grey)
export const COLOR_GRID_MINOR = 0xccdbcc; // minor grid lines
export const COLOR_GRID_MAJOR = 0xc1d1c0; // major grid lines (every 5 cells)

// Road surface
export const COLOR_ROAD          = 0x2d3138; // asphalt body
export const COLOR_ROAD_SHOULDER = 0x444a52; // slightly lighter edge band
export const COLOR_CENTERLINE    = 0xe8c840; // yellow dashes separating opposing lanes
export const COLOR_LANE_DIVIDER  = 0xbbbbbb; // white dashes separating same-direction lanes
export const COLOR_EDGE_LINE     = 0xf0f0f0; // outer edge line of the road

// Nodes & selection
export const COLOR_NODE_DEFAULT  = 0x8a8f96; // unselected node handle
export const COLOR_NODE_HOVER    = 0xffd700; // node under cursor
export const COLOR_NODE_SELECTED = 0xf0b429; // selected node
export const COLOR_SELECTED      = 0xf0b429; // generic selection highlight

// Cars
export const COLOR_CAR_STROKE = 0x172028; // outline drawn around each car body


// ═══════════════════════════════════════════════════════════════════════════════
// ROAD MARKINGS
// ═══════════════════════════════════════════════════════════════════════════════

export const CENTERLINE_WIDTH    = 2;   // centerline stroke width (world px)
export const CENTERLINE_DASH     = 16;  // dash length (world px)
export const CENTERLINE_GAP      = 8;   // gap between dashes (world px)
export const LANE_DIVIDER_WIDTH  = 1.5; // lane-divider stroke width (world px)
export const LANE_DIVIDER_DASH   = 12;  // lane-divider dash length (world px)
export const LANE_DIVIDER_GAP    = 10;  // lane-divider gap length (world px)


// ═══════════════════════════════════════════════════════════════════════════════
// NODES
// ═══════════════════════════════════════════════════════════════════════════════

export const NODE_RADIUS       = 7;   // default handle radius (world px)
export const NODE_STROKE_WIDTH = 1.5; // outline stroke width
export const NODE_STROKE_COLOR = 0x000000;
export const NODE_STROKE_ALPHA = 0.4;


// ═══════════════════════════════════════════════════════════════════════════════
// CARS
// ═══════════════════════════════════════════════════════════════════════════════

// Body geometry (half-dimensions so the centre is the car's origin)
export const CAR_BODY_HALF_LENGTH = 6;   // half-length of the car body (world px)
export const CAR_BODY_HALF_WIDTH  = 3.5; // half-width of the car body (world px)
export const CAR_CORNER_RADIUS    = 1.8; // rounded-corner radius (world px)

// Selection highlight ring drawn around the clicked car
export const CAR_SELECTION_RADIUS = 10;
export const CAR_SELECTION_STROKE = 2.5;
export const CAR_SELECTION_ALPHA  = 0.95;

// Outline stroke
export const CAR_STROKE_WIDTH          = 1.5; // normal cars
export const CAR_STROKE_SELECTED_WIDTH = 2;   // selected car


// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE DISPLAY
// ═══════════════════════════════════════════════════════════════════════════════

// Line drawn from the selected car to its destination
export const ROUTE_GLOW_WIDTH = 8;    // width of the blurred glow pass (world px)
export const ROUTE_LINE_WIDTH = 3;    // width of the crisp inner line (world px)
export const ROUTE_GLOW_ALPHA = 0.25;
export const ROUTE_LINE_ALPHA = 0.9;

// Destination pin circle drawn at the route end node
export const ROUTE_PIN_RADIUS       = NODE_RADIUS; // matches the node handle size
export const ROUTE_PIN_SHADOW_ALPHA = 0.18;        // drop-shadow circle opacity
export const ROUTE_PIN_FILL_ALPHA   = 0.95;        // main circle fill opacity
export const ROUTE_PIN_BORDER_WIDTH = 2;           // white border stroke width
export const ROUTE_PIN_BORDER_ALPHA = 0.9;
export const ROUTE_PIN_DOT_ALPHA    = 0.95;        // inner centre dot opacity

// Used as the "white" color for car stroke (selected) and route pin border/dot
export const SPEED_LABEL_BG_COLOR = 0xffffff;


// ═══════════════════════════════════════════════════════════════════════════════
// DEBUG OVERLAY
// ═══════════════════════════════════════════════════════════════════════════════

// Lane-path lines drawn over each car's planned trajectory
export const DEBUG_PATH_COLOR         = 0x00cc44; // segment path color (green)
export const DEBUG_PATH_ALPHA         = 1.0;
export const DEBUG_PATH_SEGMENT_WIDTH = 2.2; // stroke width on segment paths (screen px, pixelLine)


// ═══════════════════════════════════════════════════════════════════════════════
// EDITOR / CAMERA
// ═══════════════════════════════════════════════════════════════════════════════

export const GRID_LINE_WIDTH   = 1;
export const ZOOM_SENSITIVITY  = 0.0012; // wheel delta multiplier
export const ZOOM_MIN          = 0.02;   // minimum zoom level (permite ver Menorca completa)
export const ZOOM_MAX          = 8.0;    // maximum zoom level
