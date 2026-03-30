// ─────────────────────────────────────────────────────────────────────────────
// fullscreen.js
// Implements a custom fullscreen experience where the .video-wrapper div (not
// the YouTube iframe itself) owns the browser's fullscreen context.
//
// WHY: If the iframe were allowed to go fullscreen on its own, the browser
// would hand keyboard focus entirely to YouTube's page, making our shortcuts
// (speed, seek, etc.) stop working. By putting our own wrapper into fullscreen
// instead, the parent page retains keyboard control throughout.
// ─────────────────────────────────────────────────────────────────────────────

// setupCustomFullscreen()
// Run once after the YouTube player finishes loading (called from player.js).
// 1. Strips the iframe's native fullscreen permission so YouTube's internal
//    fullscreen button can no longer steal the browser fullscreen context.
// 2. Injects our own small fullscreen toggle button into the video wrapper.
function setupCustomFullscreen() {
  const wrapper = document.querySelector('.video-wrapper');
  const iframe  = wrapper.querySelector('iframe');

  // Remove the allowfullscreen attribute and tighten the `allow` policy so
  // the iframe cannot call Element.requestFullscreen() on its own.
  if (iframe) {
    iframe.removeAttribute('allowfullscreen');
    iframe.setAttribute('allow',
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
  }

  // Only inject the button once — guard against being called on video reload
  if (!document.getElementById('fsBtn')) {
    const btn = document.createElement('button');
    btn.id        = 'fsBtn';
    btn.className = 'fs-btn';         // styled in style.css (shows on hover)
    btn.title     = 'Fullscreen  (F)';

    // SVG: expand icon (four outward-pointing corner arrows)
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M3 3h6v2H5v4H3V3zm12 0h6v6h-2V5h-4V3zM3 15h2v4h4v2H3v-6zm16 4h-4v2h6v-6h-2v4z"/></svg>';
    btn.addEventListener('click', toggleFullscreen);
    wrapper.appendChild(btn);
  }
}

// toggleFullscreen()
// Requests fullscreen on the wrapper div if not already fullscreen,
// or exits fullscreen if it is. Also called by the 'F' keyboard shortcut.
function toggleFullscreen() {
  const wrapper = document.querySelector('.video-wrapper');
  if (!document.fullscreenElement) {
    // Ask the browser to make our wrapper fill the entire screen
    wrapper.requestFullscreen().catch(() => {});
  } else {
    // Already fullscreen — exit back to normal view
    document.exitFullscreen();
  }
}

// Listen for the browser's fullscreen state changing (enter or exit).
// Swaps the button icon between the expand and collapse SVG accordingly.
document.addEventListener('fullscreenchange', function () {
  const btn = document.getElementById('fsBtn');
  if (!btn) return; // player not loaded yet

  if (document.fullscreenElement) {
    // Now in fullscreen — show the collapse (shrink) icon
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M5 15H3v6h6v-2H5v-4zm-2-6h2V5h4V3H3v6zM19 15H21v6h-6v-2H19v-4zM15 3v2h4v4h2V3h-6z"/></svg>';
    btn.title = 'Exit fullscreen  (F)';
  } else {
    // Back to normal — restore the expand icon
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M3 3h6v2H5v4H3V3zm12 0h6v6h-2V5h-4V3zM3 15h2v4h4v2H3v-6zm16 4h-4v2h6v-6h-2v4z"/></svg>';
    btn.title = 'Fullscreen  (F)';
  }
});
