// ── Timing ────────────────────────────────────────────────────────────────────
export const MAX_DT = 0.05; // max simulated seconds per frame

// ── Car personality ───────────────────────────────────────────────────────────
export const SPEED_FACTOR_MIN   = 0.85;
export const SPEED_FACTOR_RANGE = 0.20;

// ── Car dynamics ──────────────────────────────────────────────────────────────
export const CAR_ACCEL = 4;  // m/s²
export const CAR_BRAKE = 7;  // m/s²

// ── Car following ─────────────────────────────────────────────────────────────
export const CAR_STOP_DIST   = 16;  // px
export const CAR_SLOW_DIST   = 40;  // px
export const CAR_SLOW_FACTOR = 0.4;

// ── Car spawning ──────────────────────────────────────────────────────────────
export const SPAWN_CLEARANCE    = 35;
export const SPAWN_MAX_ATTEMPTS = 6;
export const SPAWN_BATCH        = 10;
export const SPAWN_GRACE_TIME   = 2;

// ── Rerouting ─────────────────────────────────────────────────────────────────
export const REROUTE_RETRY_INTERVAL = 3.0;
export const REROUTE_MAX_RETRIES    = 4;

// ── Colors ────────────────────────────────────────────────────────────────────
export const NODE_STROKE_COLOR = 0x000000;

// ── Cars ──────────────────────────────────────────────────────────────────────
export const CAR_BODY_HALF_LENGTH      = 6;
export const CAR_BODY_HALF_WIDTH       = 3.5;
export const CAR_CORNER_RADIUS         = 1.8;
export const CAR_SELECTION_RADIUS      = 10;
export const CAR_SELECTION_STROKE      = 2.5;
export const CAR_SELECTION_ALPHA       = 0.95;

// ── Route display ─────────────────────────────────────────────────────────────
export const ROUTE_GLOW_WIDTH       = 8;
export const ROUTE_LINE_WIDTH       = 3;
export const ROUTE_GLOW_ALPHA       = 0.25;
export const ROUTE_LINE_ALPHA       = 0.9;
export const ROUTE_PIN_RADIUS       = 7;
export const ROUTE_PIN_SHADOW_ALPHA = 0.18;
export const ROUTE_PIN_FILL_ALPHA   = 0.95;
export const ROUTE_PIN_BORDER_WIDTH = 2;
export const ROUTE_PIN_BORDER_ALPHA = 0.9;
export const ROUTE_PIN_DOT_ALPHA    = 0.95;
export const SPEED_LABEL_BG_COLOR   = 0xffffff;

// ── Debug overlay ─────────────────────────────────────────────────────────────
export const DEBUG_PATH_ALPHA         = 1.0;
export const DEBUG_PATH_SEGMENT_WIDTH = 2.2;

