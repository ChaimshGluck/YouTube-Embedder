// ─────────────────────────────────────────────────────────────────────────────
// player.js
// Core logic: parses the YouTube URL, creates/reuses the YT.Player instance,
// displays the generated embed code, and handles the copy button.
// Depends on: state.js, speed.js, fullscreen.js
// ─────────────────────────────────────────────────────────────────────────────

// onYouTubeIframeAPIReady()
// The YouTube IFrame API script (loaded in the <head>) calls this function
// automatically once it has finished downloading. We don't need to do anything
// here because the player is created lazily on the first call to handleEmbed().
window.onYouTubeIframeAPIReady = function () {
  // API ready; player is created on demand in handleEmbed()
};

// extractVideoId(url)
// Accepts any common YouTube URL format and returns the 11-character video ID,
// or null if no ID could be found.
// Supported formats:
//   https://www.youtube.com/watch?v=XXXXXXXXXXX
//   https://youtu.be/XXXXXXXXXXX
//   https://www.youtube.com/embed/XXXXXXXXXXX
//   https://www.youtube.com/shorts/XXXXXXXXXXX
//   https://www.youtube.com/live/XXXXXXXXXXX
//   https://www.youtube.com/v/XXXXXXXXXXX
function extractVideoId(url) {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,         // standard watch URL
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,     // shortened share URL
    /embed\/([a-zA-Z0-9_-]{11})/,         // already-embedded URL
    /shorts\/([a-zA-Z0-9_-]{11})/,        // YouTube Shorts
    /live\/([a-zA-Z0-9_-]{11})/,          // live stream URL
    /v\/([a-zA-Z0-9_-]{11})/,             // old /v/ format
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1]; // first capture group is the video ID
  }
  return null; // URL didn't match any known format
}

// handleEmbed()
// Called when the user clicks the Embed button or presses Enter in the input.
// 1. Validates and parses the URL.
// 2. Renders the shareable <iframe> embed code in the code box.
// 3. Either loads a new video into the existing player (fast) or creates a
//    brand-new YT.Player instance if this is the first embed.
function handleEmbed() {
  const url      = document.getElementById('urlInput').value.trim();
  const errorMsg = document.getElementById('errorMsg');
  const result   = document.getElementById('result');

  // Hide any previous error message before attempting a new embed
  errorMsg.style.display = 'none';
  if (!url) return; // do nothing if the input is empty

  const videoId = extractVideoId(url);
  if (!videoId) {
    // URL was entered but we couldn't find a valid 11-char video ID
    errorMsg.style.display = 'block';
    result.style.display = 'none';
    return;
  }

  // Build the standard YouTube embed URL and the full <iframe> snippet
  const embedUrl  = `https://www.youtube.com/embed/${videoId}`;
  const embedCode = `<iframe width="560" height="315"\n  src="${embedUrl}"\n   title="YouTube video player"\n  frameborder="0"\n  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"\n  allowfullscreen>\n</iframe>`;

  // Show the generated embed code in the read-only code box
  document.getElementById('embedCode').textContent = embedCode;

  // Reset the copy button text in case it was previously clicked
  const copyBtn = document.getElementById('copyBtn');
  copyBtn.textContent = 'Copy Embed Code';
  copyBtn.classList.remove('copied');

  // Reveal the result section and scroll it into view smoothly
  result.style.display = 'block';
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Always reset speed to 1x when loading a new video
  currentSpeedIdx = 3;

  if (player && typeof player.loadVideoById === 'function') {
    // Player already exists — just swap the video without destroying the player
    player.loadVideoById(videoId);
    buildSpeedButtons(); // re-render buttons with 1x highlighted
  } else {
    // First embed — create a new YT.Player, replacing the #videoFrame div
    player = new YT.Player('videoFrame', {
      videoId: videoId,
      playerVars: {
        autoplay: 1, // start playing immediately after load
        rel: 0,      // don't show related videos from other channels at the end
        fs: 0,       // hide YouTube's native fullscreen button (we use our own)
      },
      events: {
        // onReady fires when the player has downloaded enough to begin playback
        onReady: function (e) {
          e.target.setPlaybackRate(SPEEDS[currentSpeedIdx]); // apply default 1x
          buildSpeedButtons();   // render the speed bar
          document.getElementById('speedBar').style.visibility = 'visible';
          setupCustomFullscreen(); // inject our fullscreen button (fullscreen.js)
        },
      },
    });
  }
}

// pasteAndEmbed()
// Reads text from the clipboard, sets it as the input value, then embeds it.
async function pasteAndEmbed() {
  try {
    const text = await navigator.clipboard.readText();
    document.getElementById('urlInput').value = text.trim();
    handleEmbed();
  } catch {
    // Fallback: focus the input so the user can paste manually
    document.getElementById('urlInput').focus();
  }
}

// copyCode()
// Copies the generated embed code to the clipboard using the modern
// Clipboard API and briefly changes the button label to confirm success.
function copyCode() {
  const code = document.getElementById('embedCode').textContent;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById('copyBtn');
    btn.textContent = 'Copied!';
    btn.classList.add('copied'); // green highlight via CSS

    // Revert the button back to its default state after 2 seconds
    setTimeout(() => {
      btn.textContent = 'Copy Embed Code';
      btn.classList.remove('copied');
    }, 2000);
  });
}
