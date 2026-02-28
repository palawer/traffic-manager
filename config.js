/**
 * config.js — All tunable game parameters in one place.
 * Edit these to adjust simulation behaviour, road geometry and editor feel.
 *
 * Sections:
 *   ROAD GEOMETRY     — lane/grid dimensions, junction insets, bezier curves
 *   SIMULATION        — timing, car behaviour, signals, spawning, collisions
 *   COLORS            — full colour palette (background, road, UI)
 *   ROAD MARKINGS     — stroke widths and dash patterns for painted lines
 *   NODES             — node handle appearance
 *   JUNCTIONS         — connector-tool and junction overlay visuals
 *   CARS              — car body geometry and selection highlight
 *   TRAFFIC SIGNALS   — signal dot and tool-ring visuals
 *   LANE ARROWS       — turn-arrow geometry and style
 *   ROUTE DISPLAY     — selected-car route line and destination pin
 *   SPEED SIGNS       — in-world speed-limit badge
 *   EXPLOSIONS        — crash effect ring and sparks
 *   DEBUG OVERLAY     — telemetry paths, ghost preview, heat map
 *   EDITOR            — hit radii, snap, preview and camera
 */


// ═══════════════════════════════════════════════════════════════════════════════
// ROAD GEOMETRY
// ═══════════════════════════════════════════════════════════════════════════════

export const LANE_WIDTH     = 14;  // width of one lane in world px
export const ROAD_WIDTH     = 44;  // legacy compat value (≈ 2 × old lane model)
export const GRID           = 20;  // editor snap grid size in world px
export const NODE_SNAP_DIST = 20;  // snap to existing node when closer than this (world px)

// Junction insets & connector curves
export const JUNCTION_PADDING     = 4;           // extra clearance beyond road half-width (px)
export const STRAIGHT_THRESHOLD   = Math.PI / 6; // turn angle < 30° → classified as "straight"
export const CONNECTOR_BEZIER_STEPS  = 12;       // curve smoothness: segments per bezier arc
export const CONNECTOR_BEZIER_FACTOR = 0.4;      // control-point pull strength (0 = sharp, 1 = loose)
export const CONNECTOR_BEZIER_MIN    = 10;       // minimum bezier handle length (px)


// ═══════════════════════════════════════════════════════════════════════════════
// SIMULATION
// ═══════════════════════════════════════════════════════════════════════════════

// ── Timing ────────────────────────────────────────────────────────────────────
export const MAX_DT          = 0.05; // max simulated seconds per frame (caps physics on slow frames)
export const JOIN_GRACE_TIME = 0.4;  // seconds after a phase transition before collision is checked

// ── Speed limits & lanes ──────────────────────────────────────────────────────
export const DEFAULT_SPEED_LIMIT = 80;             // km/h assigned to new segments
export const SPEED_PRESETS       = [30, 50, 80, 120]; // cycling order in the property panel
export const MAX_LANES           = 4;              // max lanes per direction editable in the UI

// ── Car personality ───────────────────────────────────────────────────────────
export const SPEED_FACTOR_MIN   = 0.85; // slowest driver as a fraction of the speed limit
export const SPEED_FACTOR_RANGE = 0.20; // random range added on top → max factor = 1.05

// ── Car dynamics ──────────────────────────────────────────────────────────────
export const CAR_ACCEL = 60;  // acceleration rate (px/s²)
export const CAR_BRAKE = 100; // deceleration rate (px/s²)

// ── Car following (IDM-lite) ──────────────────────────────────────────────────
export const CAR_STOP_DIST  = 16;  // gap to obstacle that triggers a full stop (px)
export const CAR_SLOW_DIST  = 40;  // gap to obstacle that triggers slowing (px)
export const CAR_SLOW_FACTOR = 0.4; // speed multiplier applied in the slow zone

// ── Junction approach ─────────────────────────────────────────────────────────
export const JUNCTION_LOOKAHEAD       = 50; // distance ahead at which signal/connector is checked (px)
export const JUNCTION_STOP_DIST       = 5;  // distance from segment end to hold if no connector (px)
export const JUNCTION_ENTRY_THRESHOLD = 30; // a crossing car must advance this far before the next enters (px)
export const STOP_LINE_CLEARANCE      = 4;  // extra gap between car nose and the stop line (px)

// ── Traffic signals ───────────────────────────────────────────────────────────
export const SIGNAL_PHASE_DURATION = 5; // seconds each phase stays green before cycling

// ── Car spawning ──────────────────────────────────────────────────────────────
export const SPAWN_CLEARANCE    = 35; // spawn point must be clear within this radius (px)
export const SPAWN_MAX_ATTEMPTS = 6;  // max spawn attempts per frame before giving up
export const SPAWN_BATCH        = 5;  // number of cars queued per button click
export const SPAWN_GRACE_TIME   = 2;  // seconds of collision immunity for newly spawned cars

// ── Rerouting ─────────────────────────────────────────────────────────────────
export const REROUTE_RETRY_INTERVAL = 3.0; // seconds to wait before retrying a failed reroute
export const REROUTE_MAX_RETRIES    = 4;   // failed retries before the stuck car is removed

// ── Collisions ────────────────────────────────────────────────────────────────
export const CRASH_DIST           = 12;  // cars closer than this distance collide (px)
export const EXPLOSION_DURATION   = 0.6; // seconds the explosion effect lasts
export const EXPLOSION_SPARKS     = 8;   // number of spark lines in the explosion
export const EXPLOSION_MAX_RADIUS = 28;  // outer radius of the expanding ring at peak (px)


// ═══════════════════════════════════════════════════════════════════════════════
// COLORS
// ═══════════════════════════════════════════════════════════════════════════════

// Background & grid
export const COLOR_BG         = 0xd9e5db; // canvas background (light green-grey)
export const COLOR_GRID_MINOR = 0xccdbcc; // minor grid lines
export const COLOR_GRID_MAJOR = 0xc1d1c0; // major grid lines (every 5 cells)

// Road surface
export const COLOR_ROAD          = 0x2d3138; // asphalt body used for segments and junction fills
export const COLOR_ROAD_SHOULDER = 0x444a52; // slightly lighter edge band
export const COLOR_CENTERLINE    = 0xe8c840; // yellow dashes separating opposing lanes
export const COLOR_LANE_DIVIDER  = 0xbbbbbb; // white dashes separating same-direction lanes
export const COLOR_EDGE_LINE     = 0xf0f0f0; // outer edge line of the road

// Nodes & selection
export const COLOR_NODE_DEFAULT  = 0x8a8f96; // unselected node handle
export const COLOR_NODE_HOVER    = 0xffd700; // node under cursor
export const COLOR_NODE_SELECTED = 0xf0b429; // selected node
export const COLOR_SELECTED      = 0xf0b429; // generic selection highlight (segments, etc.)

// Traffic signals
export const COLOR_TRAFFIC_GREEN = 0x35c759; // green phase indicator
export const COLOR_TRAFFIC_RED   = 0xff453a; // red phase indicator
export const COLOR_TRAFFIC_POLE  = 0x1f252b; // signal pole

// Cars
export const COLOR_CAR_STROKE = 0x172028; // outline drawn around each car body

// Connectors & junction overlay
export const COLOR_CONNECTOR_PATH = 0x00ccff; // connector path highlight in the connector tool
export const COLOR_ARROW_GREEN    = 0x35c759; // turn-arrow fill when the lane is usable

// Editor preview
export const COLOR_PREVIEW_ROAD   = 0x5a9fd4; // ghost road shown while drawing a new segment

// ═══════════════════════════════════════════════════════════════════════════════
// ROAD MARKINGS
// ═══════════════════════════════════════════════════════════════════════════════

export const CENTERLINE_WIDTH    = 2;   // centerline stroke width (world px)
export const CENTERLINE_DASH     = 16;  // dash length (world px)
export const CENTERLINE_GAP      = 8;   // gap between dashes (world px)
export const LANE_DIVIDER_WIDTH  = 1.5; // lane-divider stroke width (world px)
export const LANE_DIVIDER_DASH   = 12;  // lane-divider dash length (world px)
export const LANE_DIVIDER_GAP    = 10;  // lane-divider gap length (world px)

// Crosswalk (zebra crossing) painted at the entry of each junction arm.
// Stripes run parallel to the road and are distributed across its full width.
export const CROSSWALK_COLOR        = COLOR_LANE_DIVIDER; // stripe color
export const CROSSWALK_STRIPE_WIDTH = 3;        // width of each stripe across the road (world px)
export const CROSSWALK_STRIPE_GAP   = 3;        // gap between stripes across the road (world px)
export const CROSSWALK_DEPTH        = 10;       // length of each stripe along the road direction (world px)
export const CROSSWALK_LANE_GAP     = 4;        // clear gap between lane markings and the crosswalk (world px)
export const CROSSWALK_ALPHA        = 1;


// ═══════════════════════════════════════════════════════════════════════════════
// NODES
// ═══════════════════════════════════════════════════════════════════════════════

export const NODE_RADIUS          = 7;   // default handle radius (world px)
export const NODE_RADIUS_SELECTED = 10;  // handle radius when selected (world px)
export const NODE_STROKE_WIDTH    = 1.5; // outline stroke width
export const NODE_STROKE_COLOR    = 0x000000;
export const NODE_STROKE_ALPHA    = 0.4;


// ═══════════════════════════════════════════════════════════════════════════════
// JUNCTIONS & CONNECTORS
// ═══════════════════════════════════════════════════════════════════════════════

// Connector path overlay drawn on the road surface
export const CONNECTOR_PATH_WIDTH = 5;       // stroke width of the path marking (world px)
export const CONNECTOR_PATH_COLOR = 0x555555; // color of the path marking
export const CONNECTOR_PATH_ALPHA = 0.5;     // opacity of the path marking

// Connector-tool UI (ring shown when editing a node's connectors)
export const CONNECTOR_NODE_RING_RADIUS     = 18;     // radius of the node selector ring (world px)
export const CONNECTOR_NODE_RING_WIDTH      = 2;      // ring stroke width
export const CONNECTOR_NODE_RING_ALPHA      = 0.7;
export const CONNECTOR_NODE_RING_COLOR      = 0x88bbdd;
export const CONNECTOR_NODE_RING_HOVER_COLOR = 0xffd700;

// Connector lines drawn between in/out endpoint dots
export const CONNECTOR_DEFAULT_COLOR    = 0x3399ff; // auto-generated connector
export const CONNECTOR_USER_ALPHA       = 0.75;     // user-defined connector
export const CONNECTOR_DIM_ALPHA        = 0.3;      // dimmed (non-selected) connector
export const CONNECTOR_WIDTH            = 2.5;      // normal stroke width
export const CONNECTOR_WIDTH_SELECTED   = 4;        // stroke width when selected

// Outgoing endpoint dot (departure point of a connector)
export const CONNECTOR_OUT_R            = 6;        // dot radius
export const CONNECTOR_OUT_TARGET_R    = 9;        // radius when it is the current target
export const CONNECTOR_OUT_EXTRA_R     = 2;        // extra halo radius
export const CONNECTOR_OUT_STROKE      = 1.5;
export const CONNECTOR_OUT_STROKE_COLOR = 0xaaaaaa;
export const CONNECTOR_TARGET_FILL_ALPHA = 0.85;
export const CONNECTOR_OUT_IDLE_ALPHA   = 0.5;

// Incoming endpoint dot (arrival point of a connector)
export const CONNECTOR_IN_R                 = 7;
export const CONNECTOR_IN_SELECTED_R        = 10;
export const CONNECTOR_IN_SELECTED_EXTRA_R  = 3;
export const CONNECTOR_SELECTED_HALO_COLOR  = 0xffffff;
export const CONNECTOR_SELECTED_HALO_WIDTH  = 2;
export const CONNECTOR_IN_SELECTED_FILL_COLOR = 0xffd700;


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
// TRAFFIC SIGNALS
// ═══════════════════════════════════════════════════════════════════════════════

export const SIGNAL_RADIUS       = 5;   // radius of the signal dot drawn at a node (world px)
export const SIGNAL_STROKE_WIDTH = 1.5; // outline of the signal dot
export const SIGNAL_STROKE_COLOR = 0x000000;
export const SIGNAL_STROKE_ALPHA = 0.5;

// Ring shown in the signal-editor tool to indicate which node is being edited
export const SIGNAL_TOOL_RING_RADIUS = 14;
export const SIGNAL_TOOL_RING_WIDTH  = 2;
export const SIGNAL_TOOL_RING_COLOR  = 0xffdd00;
export const SIGNAL_TOOL_RING_ALPHA  = 0.85;


// ═══════════════════════════════════════════════════════════════════════════════
// LANE ARROWS
// ═══════════════════════════════════════════════════════════════════════════════

export const ARROW_GROUP_OFFSET      = 7;   // distance from lane centre to the arrow group (world px)
export const ARROW_TURN_ANGLE_DIVISOR = 2.2; // controls how sharply the arrow tilts for turns
export const ARROW_HEAD_LENGTH       = 8;   // arrowhead length (world px)
export const ARROW_HEAD_WIDTH        = 4.5; // arrowhead width at the base (world px)
export const ARROW_FILL_COLOR        = 0xffffff;
export const ARROW_FILL_ALPHA        = 0.9;
export const ARROW_HOVER_ALPHA       = 0.18; // fill alpha of the hover highlight behind an arrow


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


// ═══════════════════════════════════════════════════════════════════════════════
// SPEED SIGNS
// ═══════════════════════════════════════════════════════════════════════════════

export const SPEED_SIGN_RADIUS          = 10; // radius of the circular badge (world px)
export const SPEED_SIGN_FONT_SIZE       = 8;  // font size of the speed number (world px)
export const SPEED_SIGN_TEXT_RESOLUTION = 6;  // texture resolution multiplier (higher = sharper at zoom)
export const SPEED_SIGN_BORDER_COLOR    = 0xcc0000;
export const SPEED_SIGN_BORDER_SIZE     = 2;  // border stroke width (world px)
export const SPEED_SIGN_BORDER_ALPHA    = 1.0;
export const SPEED_SIGN_BG_ALPHA        = 1.0;

// Speed-label tooltip shown near a selected segment
export const SPEED_LABEL_TEXT_COLOR  = 0x111111;
export const SPEED_LABEL_BG_COLOR    = 0xffffff;
export const SPEED_LABEL_ALPHA_ACTIVE = 1.0; // opacity when the segment is selected
export const SPEED_LABEL_ALPHA_IDLE   = 1.0; // opacity when idle (currently same)


// ═══════════════════════════════════════════════════════════════════════════════
// EXPLOSIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const EXPLOSION_RING_COLOR_START = 0xffdd00; // ring color at impact (yellow)
export const EXPLOSION_RING_COLOR_END   = 0xff6600; // ring color at fade-out (orange)
export const EXPLOSION_SPARK_COLOR      = 0xffaa00; // spark line color
export const EXPLOSION_SPARK_WIDTH      = 1.5;      // spark line stroke width


// ═══════════════════════════════════════════════════════════════════════════════
// DEBUG OVERLAY
// ═══════════════════════════════════════════════════════════════════════════════

// Lane-path lines drawn over each car's planned trajectory
export const DEBUG_PATH_COLOR           = 0x00b7ff; // segment path color (bright blue)
export const DEBUG_PATH_ALPHA           = 1.0;
export const DEBUG_PATH_SEGMENT_WIDTH   = 2.2; // stroke width on segment paths (screen px, pixelLine)
export const DEBUG_PATH_CONNECTOR_WIDTH = 2.6; // stroke width on junction connector paths

// Ghost preview: translucent car silhouettes drawn N seconds ahead
export const DEBUG_GHOST_SECONDS = 2.5; // how far ahead to project each ghost
export const DEBUG_GHOST_ALPHA   = 0.7;
export const DEBUG_GHOST_WIDTH   = 2.2; // ghost outline stroke width (screen px)

// Current-lane highlight
export const DEBUG_CURRENT_LANE_ALPHA = 0.9;
export const DEBUG_CURRENT_LANE_WIDTH = 3.0; // screen px

// Invalid-connector highlight (shown when a car has no valid connector)
export const DEBUG_INVALID_COLOR = 0xff3b30;
export const DEBUG_INVALID_ALPHA = 0.95;
export const DEBUG_INVALID_WIDTH = 2.4; // screen px

// Congestion heat map drawn on the road surface
export const DEBUG_HEAT_LOW_COLOR  = 0x35c759; // free-flowing (green)
export const DEBUG_HEAT_HIGH_COLOR = 0xff453a; // congested (red)
export const DEBUG_HEAT_ALPHA      = 0.18;     // overlay opacity

// Per-car telemetry text bubble
export const DEBUG_TEXT_COLOR    = 0xffffff;
export const DEBUG_TEXT_BG_COLOR = 0x10141a;
export const DEBUG_TEXT_BG_ALPHA = 0.82;
export const DEBUG_TEXT_SIZE     = 11;          // font size in world px
export const DEBUG_TEXT_OFFSET_Y = 20;          // vertical offset above the car centre (world px)


// ═══════════════════════════════════════════════════════════════════════════════
// EDITOR
// ═══════════════════════════════════════════════════════════════════════════════

// Hit radii — how close the cursor must be to select each element (world px, pre-zoom)
export const HIT_NODE         = 12; // node handle
export const HIT_SEGMENT      = 20; // road segment body
export const HIT_CAR          = 12; // car
export const HIT_LANE         = 33; // lane strip for arrow/connector editing (≈ LANE_WIDTH × 2.4)
export const HIT_CONNECTOR_EP = 14; // connector endpoint dots in the connector tool

// Road-preview ghost drawn while placing a new segment
export const GRID_LINE_WIDTH       = 1;
export const ROAD_HOVER_STROKE_EXTRA = 6;   // extra stroke width added to hovered segment (world px)
export const ROAD_HOVER_ALPHA      = 0.25;
export const PREVIEW_INVALID_COLOR = 0xdd3333; // ghost color when the placement is illegal
export const PREVIEW_ALPHA         = 0.55;
export const PREVIEW_SNAP_RADIUS   = 8;        // snap-indicator circle radius (world px)
export const PREVIEW_SNAP_STROKE   = 2;        // snap-indicator stroke width

// Camera
export const ZOOM_SENSITIVITY = 0.0012; // wheel delta multiplier
export const ZOOM_MIN         = 0.2;    // minimum zoom level
export const ZOOM_MAX         = 8.0;    // maximum zoom level
