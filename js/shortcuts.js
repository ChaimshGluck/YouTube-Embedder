// ─────────────────────────────────────────────────────────────────────────────
// shortcuts.js
// Registers all keyboard shortcuts and focus-management logic.
// Depends on: state.js (player, currentSpeedIdx), speed.js (setSpeed),
//             fullscreen.js (toggleFullscreen), player.js (handleEmbed)
// ─────────────────────────────────────────────────────────────────────────────

// Focus reclaim
// When the user clicks inside the YouTube iframe, the browser moves focus into
// that cross-origin frame and our document stops receiving keydown events.
// By listening to the window's 'blur' event and immediately calling
// window.focus() we reclaim focus on the parent page so shortcuts always work —
// even while the video is playing and even in fullscreen.
window.addEventListener('blur', function () {
  // setTimeout(..., 0) defers until after the browser finishes moving focus,
  // which makes the focus() call reliably win.
  setTimeout(function () { window.focus(); }, 0);
});

// Let the user press Enter inside the URL input to trigger the embed
// instead of having to click the Embed button.
document.getElementById('urlInput').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') handleEmbed();
});

// ── Main keyboard shortcut handler ───────────────────────────────────────────
// All shortcuts are handled in one listener to keep the logic in one place.
// Guards at the top prevent shortcuts from firing before a video is loaded
// or while the user is typing in the URL input.
document.addEventListener('keydown', function (e) {
  // Do nothing if the player hasn't been created yet
  if (!player || typeof player.getPlaybackRate !== 'function') return;

  // Do nothing if the user is typing in the URL input field
  if (document.activeElement === document.getElementById('urlInput')) return;

  // ── Playback speed ──────────────────────────────────────────────────────────
  // Shift+>  (same physical key as Shift+.)  →  one step faster
  if      (e.shiftKey && e.key === '>')  { e.preventDefault(); setSpeed(currentSpeedIdx + 1); }
  // Shift+<  (same physical key as Shift+,)  →  one step slower
  else if (e.shiftKey && e.key === '<')  { e.preventDefault(); setSpeed(currentSpeedIdx - 1); }

  // ── Fullscreen ──────────────────────────────────────────────────────────────
  // F  →  toggle fullscreen (handled by fullscreen.js)
  else if ((e.key === 'f' || e.key === 'F') && !e.shiftKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault(); toggleFullscreen();
  }

  // ── Seek ±5 seconds (arrow keys) ───────────────────────────────────────────
  else if (e.key === 'ArrowRight' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault(); player.seekTo(player.getCurrentTime() + 5, true);
  }
  else if (e.key === 'ArrowLeft' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
    // Math.max(0, ...) prevents seeking to a negative timestamp
    e.preventDefault(); player.seekTo(Math.max(0, player.getCurrentTime() - 5), true);
  }

  // ── Seek ±10 seconds (J / L — classic YouTube shortcuts) ───────────────────
  else if (e.key === 'l' || e.key === 'L') {
    e.preventDefault(); player.seekTo(player.getCurrentTime() + 10, true);
  }
  else if (e.key === 'j' || e.key === 'J') {
    e.preventDefault(); player.seekTo(Math.max(0, player.getCurrentTime() - 10), true);
  }

  // ── Play / Pause (K or Space — both are standard YouTube shortcuts) ─────────
  else if (e.key === 'k' || e.key === 'K' || e.key === ' ') {
    e.preventDefault();
    // Toggle based on current player state
    player.getPlayerState() === YT.PlayerState.PLAYING
      ? player.pauseVideo()
      : player.playVideo();
  }

  // ── Mute / Unmute ───────────────────────────────────────────────────────────
  else if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    player.isMuted() ? player.unMute() : player.mute();
  }

  // ── Volume ±5% (up / down arrow keys) ──────────────────────────────────────
  else if (e.key === 'ArrowUp' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
    // Math.min(100, ...) caps volume at 100%
    e.preventDefault(); player.setVolume(Math.min(100, player.getVolume() + 5));
  }
  else if (e.key === 'ArrowDown' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
    // Math.max(0, ...) prevents negative volume
    e.preventDefault(); player.setVolume(Math.max(0, player.getVolume() - 5));
  }

  // ── Frame-by-frame step (, and .) ───────────────────────────────────────────
  // Pauses the video first, then nudges by 0.1 s — effectively one frame at
  // typical 24–30 fps. Useful for examining a specific moment in detail.
  else if (e.key === ',' && !e.shiftKey) {
    e.preventDefault();
    player.pauseVideo();
    player.seekTo(Math.max(0, player.getCurrentTime() - 0.1), true);
  }
  else if (e.key === '.' && !e.shiftKey) {
    e.preventDefault();
    player.pauseVideo();
    player.seekTo(player.getCurrentTime() + 0.1, true);
  }

  // ── Jump to percentage of video (0–9) ───────────────────────────────────────
  // 0 → beginning, 1 → 10%, 2 → 20%, … 9 → 90%
  else if (!e.shiftKey && !e.ctrlKey && !e.altKey && e.key >= '0' && e.key <= '9') {
    e.preventDefault();
    const duration = player.getDuration(); // total length in seconds
    if (duration) player.seekTo(duration * parseInt(e.key) / 10, true);
  }
});
