/**
 * config.js — All tunable game parameters in one place.
 * Edit these to adjust simulation behaviour, road geometry and editor feel.
 */

// ── Road geometry ─────────────────────────────────────────────────────────────
export const LANE_WIDTH      = 14;   // width of one lane in world pixels
export const ROAD_WIDTH      = 44;   // legacy compat (2 × old lane width model)
export const GRID            = 20;   // editor snap grid
export const NODE_SNAP_DIST  = 20;   // px to auto-snap to an existing node

// ── Road colors ───────────────────────────────────────────────────────────────
export const COLOR_BG         = 0xd9e5db;
export const COLOR_GRID_MINOR = 0xccdbcc;
export const COLOR_GRID_MAJOR = 0xc1d1c0;
export const COLOR_ROAD       = 0x2d3138; // asphalt body (segments + junctions)
export const COLOR_CENTERLINE = 0xe8c840; // yellow dashes between directions
export const COLOR_LANE_DIVIDER = 0xdddddd; // lane separators (same direction)
export const COLOR_ROAD_SHOULDER = 0x444a52;
export const COLOR_EDGE_LINE = 0xf0f0f0;
export const COLOR_SELECTED = 0xf0b429;
export const COLOR_NODE_DEFAULT = 0x8a8f96;
export const COLOR_NODE_HOVER = 0xffd700;
export const COLOR_NODE_SELECTED = 0xf0b429;
export const COLOR_TRAFFIC_GREEN = 0x35c759;
export const COLOR_TRAFFIC_RED = 0xff453a;
export const COLOR_TRAFFIC_POLE = 0x1f252b;
export const COLOR_CAR_STROKE = 0x172028;
export const COLOR_CONNECTOR_PATH = 0x00ccff;
export const COLOR_ARROW_GREEN = 0x35c759;
export const COLOR_PREVIEW_ROAD = 0x5a9fd4;

// ── Road markings ─────────────────────────────────────────────────────────────
export const CENTERLINE_WIDTH = 2;   // centerline stroke width (world px)
export const CENTERLINE_DASH  = 16;  // centerline dash length (world px)
export const CENTERLINE_GAP   = 8;   // centerline gap length (world px)
export const LANE_DIVIDER_WIDTH = 1.5; // lane-divider stroke width (world px)
export const STOP_LINE_WIDTH  = 2;   // stop-line stroke width (screen px baseline)
export const STOP_LINE_COLOR  = 0xdddddd;
export const STOP_LINE_ALPHA  = 1;

// ── Nodes ─────────────────────────────────────────────────────────────────────
export const NODE_RADIUS          = 7;   // default node handle radius (world px)
export const NODE_RADIUS_SELECTED = 10;  // selected node handle radius (world px)

// ── Junctions ─────────────────────────────────────────────────────────────────
export const JUNCTION_PADDING      = 4;          // extra clearance (px) beyond road half-width
export const STRAIGHT_THRESHOLD    = Math.PI / 6; // turn < 30° → classified as "straight"
export const CONNECTOR_BEZIER_STEPS   = 12;      // curve smoothness (segments per bezier)
export const CONNECTOR_BEZIER_FACTOR  = 0.4;     // control-point pull factor (0–1)
export const CONNECTOR_BEZIER_MIN     = 10;      // minimum handle length (px)
export const CONNECTOR_PATH_WIDTH     = 5;       // world px width of connector path markings
export const CONNECTOR_PATH_COLOR     = 0x555555; // color of connector path markings
export const CONNECTOR_PATH_ALPHA     = 0.5;    // opacity of connector path markings

// ── Debug lanes ───────────────────────────────────────────────────────────────
export const DEBUG_PATH_COLOR           = 0x00b7ff; // bright blue
export const DEBUG_PATH_ALPHA           = 1.0;
export const DEBUG_PATH_SEGMENT_WIDTH   = 2.2;      // px on screen (pixelLine=true)
export const DEBUG_PATH_CONNECTOR_WIDTH = 2.6;      // px on screen (pixelLine=true)

// ── Render style (canvas overlays / symbols) ─────────────────────────────────
export const GRID_LINE_WIDTH = 1;
export const ROAD_HOVER_STROKE_EXTRA = 6;
export const ROAD_HOVER_ALPHA = 0.25;
export const LANE_DIVIDER_DASH = 12;
export const LANE_DIVIDER_GAP = 10;
export const NODE_STROKE_WIDTH = 1.5;
export const NODE_STROKE_COLOR = 0x000000;
export const NODE_STROKE_ALPHA = 0.4;
export const PREVIEW_INVALID_COLOR = 0xdd3333;
export const PREVIEW_ALPHA = 0.55;
export const PREVIEW_SNAP_RADIUS = 8;
export const PREVIEW_SNAP_STROKE = 2;
export const ROUTE_GLOW_WIDTH = 8;
export const ROUTE_LINE_WIDTH = 3;
export const ROUTE_GLOW_ALPHA = 0.25;
export const ROUTE_LINE_ALPHA = 0.9;
export const ROUTE_PIN_RADIUS = 10;
export const ROUTE_PIN_SHADOW_ALPHA = 0.18;
export const ROUTE_PIN_FILL_ALPHA = 0.95;
export const ROUTE_PIN_BORDER_WIDTH = 2;
export const ROUTE_PIN_BORDER_ALPHA = 0.9;
export const ROUTE_PIN_DOT_ALPHA = 0.95;
export const CAR_BODY_HALF_LENGTH = 6;
export const CAR_BODY_HALF_WIDTH = 3.5;
export const CAR_SELECTION_RADIUS = 10;
export const CAR_SELECTION_STROKE = 2.5;
export const CAR_SELECTION_ALPHA = 0.95;
export const CAR_STROKE_WIDTH = 1.5;
export const CAR_STROKE_SELECTED_WIDTH = 2;
export const EXPLOSION_RING_COLOR_START = 0xffdd00;
export const EXPLOSION_RING_COLOR_END = 0xff6600;
export const EXPLOSION_SPARK_COLOR = 0xffaa00;
export const EXPLOSION_SPARK_WIDTH = 1.5;
export const ARROW_GROUP_OFFSET = 7;
export const ARROW_TURN_ANGLE_DIVISOR = 2.2;
export const ARROW_HEAD_LENGTH = 8;
export const ARROW_HEAD_WIDTH = 4.5;
export const ARROW_FILL_COLOR = 0xffffff;
export const ARROW_FILL_ALPHA = 0.9;
export const ARROW_HOVER_ALPHA = 0.18;
export const SIGNAL_STROKE_WIDTH = 1.5;
export const SIGNAL_STROKE_COLOR = 0x000000;
export const SIGNAL_STROKE_ALPHA = 0.5;
export const SIGNAL_TOOL_RING_RADIUS = 14;
export const SIGNAL_TOOL_RING_WIDTH = 2;
export const SIGNAL_TOOL_RING_COLOR = 0xffdd00;
export const SIGNAL_TOOL_RING_ALPHA = 0.85;
export const SPEED_LABEL_TEXT_COLOR = 0x111111;
export const SPEED_LABEL_BG_COLOR = 0xffffff;
export const SPEED_LABEL_ALPHA_ACTIVE = 1.0;
export const SPEED_LABEL_ALPHA_IDLE = 1.0;
export const CONNECTOR_NODE_RING_RADIUS = 18;
export const CONNECTOR_NODE_RING_WIDTH = 2;
export const CONNECTOR_NODE_RING_ALPHA = 0.7;
export const CONNECTOR_NODE_RING_COLOR = 0x88bbdd;
export const CONNECTOR_NODE_RING_HOVER_COLOR = 0xffd700;
export const CONNECTOR_DEFAULT_COLOR = 0x3399ff;
export const CONNECTOR_USER_ALPHA = 0.75;
export const CONNECTOR_DIM_ALPHA = 0.3;
export const CONNECTOR_WIDTH = 2.5;
export const CONNECTOR_WIDTH_SELECTED = 4;
export const CONNECTOR_OUT_R = 6;
export const CONNECTOR_OUT_TARGET_R = 9;
export const CONNECTOR_OUT_EXTRA_R = 2;
export const CONNECTOR_OUT_STROKE = 1.5;
export const CONNECTOR_OUT_STROKE_COLOR = 0xaaaaaa;
export const CONNECTOR_TARGET_FILL_ALPHA = 0.85;
export const CONNECTOR_OUT_IDLE_ALPHA = 0.5;
export const CONNECTOR_IN_R = 7;
export const CONNECTOR_IN_SELECTED_R = 10;
export const CONNECTOR_IN_SELECTED_EXTRA_R = 3;
export const CONNECTOR_SELECTED_HALO_COLOR = 0xffffff;
export const CONNECTOR_SELECTED_HALO_WIDTH = 2;
export const CONNECTOR_IN_SELECTED_FILL_COLOR = 0xffd700;

// ── Traffic signals ───────────────────────────────────────────────────────────
export const SIGNAL_PHASE_DURATION = 5;   // seconds each phase stays green
export const SIGNAL_RADIUS         = 5;   // radius of signal dot (world px)

// ── Simulation timing ─────────────────────────────────────────────────────────
export const MAX_DT         = 0.05;  // max simulated seconds per frame (prevents jumps)
export const JOIN_GRACE_TIME = 0.4;  // s after phase transition before collision kicks in

// ── Car spawning ──────────────────────────────────────────────────────────────
export const SPAWN_CLEARANCE    = 35;  // px radius around spawn point that must be clear
export const SPAWN_MAX_ATTEMPTS = 6;   // max spawn tries per frame
export const SPAWN_BATCH        = 5;   // cars added per button click

// ── Car personality ───────────────────────────────────────────────────────────
export const SPEED_FACTOR_MIN   = 0.85; // slowest driver (fraction of speed limit)
export const SPEED_FACTOR_RANGE = 0.20; // random range added on top  →  max = 1.05

// ── Car dynamics ──────────────────────────────────────────────────────────────
export const CAR_ACCEL      = 60;   // px/s² when accelerating
export const CAR_BRAKE      = 100;  // px/s² when braking

// ── Car following ─────────────────────────────────────────────────────────────
export const CAR_STOP_DIST  = 24;   // px to obstacle → full stop
export const CAR_SLOW_DIST  = 40;   // px to obstacle → slow to CAR_SLOW_FACTOR
export const CAR_SLOW_FACTOR = 0.4; // speed multiplier in slow zone

// ── Junction approach ─────────────────────────────────────────────────────────
export const JUNCTION_LOOKAHEAD        = 50; // px before junction to start checking signals
export const JUNCTION_STOP_DIST        = 5;  // px from segment end to stop if no connector
export const JUNCTION_ENTRY_THRESHOLD  = 30; // a car must advance this far before next enters
export const STOP_LINE_CLEARANCE       = 4;  // extra px before stop line (in addition to car nose)

// ── Editor hit radii (world px, before zoom) ──────────────────────────────────
export const HIT_NODE         = 12;  // select a node
export const HIT_SEGMENT      = 20;  // select a segment
export const HIT_CAR          = 12;  // click a car
export const HIT_LANE         = 33;  // hover/click a lane  (≈ LANE_WIDTH × 1.5)
export const HIT_CONNECTOR_EP = 14;  // connector-tool endpoint dots

// ── Camera ────────────────────────────────────────────────────────────────────
export const ZOOM_SENSITIVITY = 0.0012;
export const ZOOM_MIN         = 0.2;
export const ZOOM_MAX         = 8.0;

// ── Speed limits ──────────────────────────────────────────────────────────────
export const DEFAULT_SPEED_LIMIT  = 80;
export const SPEED_PRESETS        = [30, 50, 80, 120]; // cycling order
export const MAX_LANES            = 4;   // max lanes per direction in the property panel
export const SPEED_SIGN_RADIUS       = 10;        // world px radius of speed sign circle
export const SPEED_SIGN_FONT_SIZE    = 8;        // font size of speed number (world px)
export const SPEED_SIGN_TEXT_RESOLUTION = 6;     // higher = sharper text when zooming in
export const SPEED_SIGN_BORDER_COLOR = 0xcc0000; // border color of speed sign
export const SPEED_SIGN_BORDER_SIZE  = 2;      // border stroke width (world px)
export const SPEED_SIGN_BORDER_ALPHA = 1.0;
export const SPEED_SIGN_BG_ALPHA     = 1.0;

// ── Collisions & explosions ────────────────────────────────────────────────────
export const CRASH_DIST          = 12;   // px — cars closer than this collide
export const EXPLOSION_DURATION  = 0.6;  // seconds the effect lasts
export const EXPLOSION_SPARKS    = 8;    // number of spark lines
export const EXPLOSION_MAX_RADIUS = 28;  // px — outer radius of ring at end
