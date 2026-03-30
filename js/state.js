// ─────────────────────────────────────────────────────────────────────────────
// state.js
// Central store for variables that are shared across all other JS modules.
// All other files read from and write to these variables directly because plain
// <script> tags share the same global (window) scope — no import/export needed.
// ─────────────────────────────────────────────────────────────────────────────

// All available playback speeds shown in the speed bar.
// Mirrors the options YouTube itself offers in its settings menu.
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

// Reference to the YT.Player instance created by the YouTube IFrame API.
// Starts as null; gets assigned inside player.js once the first video is loaded.
let player = null;

// Index into the SPEEDS array that is currently active.
// 3 → SPEEDS[3] → 1x (normal speed). Updated by setSpeed() in speed.js.
let currentSpeedIdx = 3;
