/**
 * config.js — All tunable game parameters in one place.
 * Edit these to adjust simulation behaviour, road geometry and editor feel.
 */

// ── Road geometry ─────────────────────────────────────────────────────────────
export const LANE_WIDTH      = 12;   // width of one lane in world pixels
export const GRID            = 20;   // editor snap grid
export const NODE_SNAP_DIST  = 20;   // px to auto-snap to an existing node

// ── Junctions ─────────────────────────────────────────────────────────────────
export const JUNCTION_PADDING      = 4;          // extra clearance (px) beyond road half-width
export const STRAIGHT_THRESHOLD    = Math.PI / 6; // turn < 30° → classified as "straight"
export const CONNECTOR_BEZIER_STEPS   = 12;      // curve smoothness (segments per bezier)
export const CONNECTOR_BEZIER_FACTOR  = 0.4;     // control-point pull factor (0–1)
export const CONNECTOR_BEZIER_MIN     = 10;      // minimum handle length (px)

// ── Traffic signals ───────────────────────────────────────────────────────────
export const SIGNAL_PHASE_DURATION = 5;   // seconds each phase stays green

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

// ── Editor hit radii (world px, before zoom) ──────────────────────────────────
export const HIT_NODE         = 12;  // select a node
export const HIT_SEGMENT      = 20;  // select a segment
export const HIT_CAR          = 12;  // click a car
export const HIT_LANE         = 33;  // hover/click a lane  (≈ LANE_WIDTH × 1.5)
export const HIT_CONNECTOR_EP = 14;  // connector-tool endpoint dots

// ── Camera ────────────────────────────────────────────────────────────────────
export const ZOOM_SENSITIVITY = 0.0012;
export const ZOOM_MIN         = 0.2;
export const ZOOM_MAX         = 4.0;

// ── Speed limits ──────────────────────────────────────────────────────────────
export const DEFAULT_SPEED_LIMIT = 80;
export const SPEED_PRESETS       = [30, 50, 80, 120]; // cycling order
export const MAX_LANES           = 4;  // max lanes per direction in the property panel

// ── Collisions & explosions ────────────────────────────────────────────────────
export const CRASH_DIST          = 12;   // px — cars closer than this collide
export const EXPLOSION_DURATION  = 0.6;  // seconds the effect lasts
export const EXPLOSION_SPARKS    = 8;    // number of spark lines
export const EXPLOSION_MAX_RADIUS = 28;  // px — outer radius of ring at end
