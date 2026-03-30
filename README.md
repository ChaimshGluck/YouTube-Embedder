# YouTube Embedder

A lightweight local web app that lets you paste any YouTube URL, preview the video with full keyboard controls, and copy an `<iframe>` embed code.

---

## Getting Started

**Requirements:** [Node.js](https://nodejs.org) (any recent version)

```bash
node server.js
```

Then open **http://localhost:3010** in your browser.

---

## How It Works

### Architecture

There is no framework or build step. The project is a plain Node.js static file server (`server.js`) that serves HTML, CSS, and JavaScript files directly to the browser.

```
server.js               ← Node.js HTTP server (port 3010)
youtube-embed.html      ← Main page
style.css               ← All styling
js/
  state.js              ← Shared global variables (player, speed index)
  player.js             ← YouTube IFrame API integration, embed code generation
  speed.js              ← Playback speed bar UI and logic
  fullscreen.js         ← Custom fullscreen button and keyboard handler
  shortcuts.js          ← All keyboard shortcuts
```

### Script Load Order

The scripts are loaded in dependency order at the bottom of `youtube-embed.html`:

```
state.js → speed.js → fullscreen.js → player.js → shortcuts.js
```

Since they all run in the same global `window` scope, each file can read variables and call functions defined in any previously loaded file — no `import`/`export` needed.

---

## Features

### Paste & Embed
Paste any YouTube URL format into the input and click **Embed** (or press **Enter**):
- `https://www.youtube.com/watch?v=...`
- `https://youtu.be/...`
- `https://www.youtube.com/shorts/...`
- `https://www.youtube.com/live/...`

The app extracts the video ID, renders an `<iframe>` embed code snippet, and loads the player.

### Copy Embed Code
Click **Copy Embed Code** to copy the generated `<iframe>` snippet to your clipboard.

### Playback Speed
A speed bar below the video lets you select from `0.25x` to `2x`. The active speed is highlighted in red. Resets to `1×` on every new video.

### Custom Fullscreen
A custom fullscreen button overlays the video (visible on hover). It puts the **wrapper div** — not the YouTube iframe — into fullscreen. This keeps keyboard focus on the parent page so all shortcuts continue working while fullscreen.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `K` or `Space` | Play / Pause |
| `F` | Toggle fullscreen |
| `M` | Mute / Unmute |
| `→` | Seek +5 seconds |
| `←` | Seek −5 seconds |
| `L` | Seek +10 seconds |
| `J` | Seek −10 seconds |
| `.` | Step forward 1 frame (~0.1s) |
| `,` | Step back 1 frame (~0.1s) |
| `↑` | Volume +5% |
| `↓` | Volume −5% |
| `Shift` + `>` | Speed up |
| `Shift` + `<` | Slow down |
| `0` – `9` | Jump to 0%–90% of video |

Shortcuts work even while the video is playing inside the iframe, because `shortcuts.js` reclaims window focus via the `blur` event.

---

## File Reference

| File | Responsibility |
|------|---------------|
| `server.js` | Minimal Node.js HTTP server. Serves static files, strips query strings before resolving file paths, returns correct MIME types. |
| `youtube-embed.html` | Page structure. Loads the YouTube IFrame API script and all JS modules. |
| `style.css` | Dark theme styling. Includes layout (3-column grid to keep the video centered alongside the shortcuts panel), video wrapper, speed bar, embed code box, and responsive breakpoints. |
| `js/state.js` | Declares `player`, `SPEEDS`, and `currentSpeedIdx` as globals shared across all modules. |
| `js/player.js` | `extractVideoId()` parses URLs. `handleEmbed()` creates or reloads the `YT.Player` instance. `copyCode()` writes the embed snippet to the clipboard. |
| `js/speed.js` | `buildSpeedButtons()` renders the speed bar. `setSpeed(idx)` updates both the player rate and the active button highlight. |
| `js/fullscreen.js` | `setupCustomFullscreen()` injects the overlay button and strips the iframe's native fullscreen permission. `toggleFullscreen()` calls the browser Fullscreen API on the wrapper. |
| `js/shortcuts.js` | Single `keydown` listener handles all shortcuts. Also wires the Enter key on the URL input. |
