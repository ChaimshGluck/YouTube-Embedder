// ─────────────────────────────────────────────────────────────────────────────
// download.js
// Handles the "Download Video" button: asks the server to fetch the file via
// yt-dlp, then streams the response to the browser as a normal file download.
// Depends on: player.js (extractVideoId)
// ─────────────────────────────────────────────────────────────────────────────

// This page is deployed on Netlify (static hosting, no server), but the
// download API runs on the GroupMeApi Express app on the DigitalOcean droplet
// — a different origin.
const API_BASE = "https://t-proj-program.com";

async function downloadVideo() {
  const url      = document.getElementById('urlInput').value.trim();
  const errorMsg = document.getElementById('errorMsg');
  const btn      = document.getElementById('downloadBtn');

  errorMsg.style.display = 'none';
  if (!url || !extractVideoId(url)) {
    errorMsg.style.display = 'block';
    return;
  }

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Downloading…';

  try {
    const res = await fetch(API_BASE + '/downloader/api/download?url=' + encodeURIComponent(url));
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Server responded with ${res.status}`);
    }

    const disposition = res.headers.get('Content-Disposition') || '';
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const asciiMatch = disposition.match(/filename="([^"]+)"/i);
    const filename = utf8Match
      ? decodeURIComponent(utf8Match[1])
      : (asciiMatch ? asciiMatch[1] : 'video.mp4');

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    alert('Download failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}
