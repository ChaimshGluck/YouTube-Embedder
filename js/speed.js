// ─────────────────────────────────────────────────────────────────────────────
// speed.js
// Handles playback-speed UI and logic.
// Depends on: state.js (SPEEDS, player, currentSpeedIdx)
// ─────────────────────────────────────────────────────────────────────────────

// buildSpeedButtons()
// Clears and re-renders the row of speed buttons (0.25x … 2x).
// Called once when the player is ready and again whenever a new video loads
// so the active highlight always resets to 1x.
function buildSpeedButtons() {
  const container = document.getElementById('speedButtons');

  // Wipe any previously rendered buttons before rebuilding
  container.innerHTML = '';

  // Create one <button> per entry in the SPEEDS array
  SPEEDS.forEach((rate, idx) => {
    const btn = document.createElement('button');
    btn.textContent = rate + 'x';

    // Mark the currently-active speed with the 'active' CSS class
    btn.className = 'speed-btn' + (idx === currentSpeedIdx ? ' active' : '');

    // Clicking a button calls setSpeed with that button's index
    btn.onclick = () => setSpeed(idx);
    container.appendChild(btn);
  });
}

// setSpeed(idx)
// Changes the playback rate to SPEEDS[idx] and updates the button highlights.
// Called by button clicks (above) and by keyboard shortcuts in shortcuts.js.
function setSpeed(idx) {
  // Clamp so we never go out of bounds when pressing Shift+> at 2x or Shift+< at 0.25x
  idx = Math.max(0, Math.min(SPEEDS.length - 1, idx));
  currentSpeedIdx = idx;

  // Tell the YouTube player to change its playback rate
  player.setPlaybackRate(SPEEDS[idx]);

  // Sync the 'active' class: highlight only the selected button
  document.querySelectorAll('.speed-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });
}
