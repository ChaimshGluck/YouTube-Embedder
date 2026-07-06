# YouTube Embedder

A lightweight local web app that lets you paste any YouTube URL, preview the video with full keyboard controls, and copy an `<iframe>` embed code.

---

## Getting Started

**Requirements:**
- [Node.js](https://nodejs.org) (any recent version)
- [Python](https://python.org) with the [`yt-dlp`](https://pypi.org/project/yt-dlp/) package installed (`pip install yt-dlp`) — needed for the **Download Video** button
- [ffmpeg](https://ffmpeg.org) on your `PATH` — needed to merge separate video/audio streams into a single `.mp4`

### Option 1 — Double-click (Windows, recommended)

Double-click **`start.bat`**. It will:
1. Launch `node server.js` in the background
2. Automatically open **http://localhost:3010** in your default browser

This is the easiest way to run the app and avoids any file:// protocol issues (see below).

### Option 2 — Terminal

```bash
node server.js
```

Then open **http://localhost:3010** manually in your browser.

### Why use the server instead of opening the HTML file directly?

If you open `youtube-embed.html` directly from your file system (`file://` URL), the browser blocks several things:
- Loading local `.js` and `.css` files from subfolders (CORS / mixed-content restrictions)
- The YouTube IFrame API may refuse to initialize inside a `file://` page

Running through the Node.js server serves everything over `http://localhost`, which the browser treats as a normal secure origin — no restrictions.

---

## Deployment

The **Download Video** feature needs a real server that can run Node, Python + yt-dlp, and ffmpeg. A static host (e.g. Netlify) cannot run any of these — on a static deploy the `/api/download` request is served the HTML page instead, so the browser "downloads" an unplayable file. Deploy the whole app (static files **and** the API are both served by `server.js`) to a host that runs containers.

### Render (one-click via the included blueprint)

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, point it at the repo. Render reads [`render.yaml`](render.yaml) and builds the [`Dockerfile`](Dockerfile) (Node + Python + yt-dlp + ffmpeg + Deno).
3. Once live, open the service URL — embed **and** download both work over `https://…`.

The same `Dockerfile` works on Railway, Fly.io, or any container host. Locally you can run it with:

```bash
docker build -t youtube-embedder .
docker run -p 3010:3010 youtube-embedder
```

> **Deno** is installed in the image because modern YouTube requires running a JS "nsig" signature challenge to obtain valid media URLs; yt-dlp auto-detects Deno and uses it. Without a JS runtime, downloads fail with `HTTP Error 403: Forbidden`.

### Datacenter-IP block (429 / "confirm you're not a bot")

YouTube frequently refuses requests from cloud/datacenter IPs — especially shared free-tier IPs like Render's — with `HTTP Error 429: Too Many Requests` and `Sign in to confirm you're not a bot`. This never happens from a home (residential) IP, so it only shows up once deployed.

The fix is to authenticate yt-dlp with exported YouTube cookies. The server reads the optional `YTDLP_COOKIES` env var — if set to the path of a Netscape-format `cookies.txt`, it passes `--cookies <path>` to yt-dlp. Unset (e.g. locally), nothing changes.

**To set it up on Render:**

1. Export your YouTube cookies to a `cookies.txt` (Netscape format) — e.g. with a "Get cookies.txt" browser extension while logged in to YouTube. See yt-dlp's [How do I pass cookies](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp) guide.
2. In the Render dashboard: service → **Environment → Secret Files → Add Secret File**. Filename `cookies.txt`, paste the file contents. Render mounts it at `/etc/secrets/cookies.txt`.
3. Add an env var **`YTDLP_COOKIES` = `/etc/secrets/cookies.txt`**, then redeploy.

**Important caveats:**
- **Never commit `cookies.txt` to the repo** — it's a live login credential to your Google account. Use the Secret File mechanism only. (`cookies.txt` is gitignored.)
- Prefer cookies from a **throwaway Google account**, not your main one — Google can flag/lock an account whose cookies are used from a datacenter IP.
- Cookies expire and YouTube rotates them, so this needs occasional refreshing.
- Even with cookies, a heavily-abused shared free-tier IP may still be blocked. The robust (but paid) fix is routing yt-dlp through a residential proxy, or running on a host with a cleaner dedicated IP.

> The `_redirects` file in the repo is Netlify-specific and is ignored when the app runs under `server.js` (the Node server does its own routing).

---

## How It Works

### Architecture

There is no framework or build step. The project is a plain Node.js static file server (`server.js`) that serves HTML, CSS, and JavaScript files directly to the browser.

```
server.js               ← Node.js HTTP server (port 3010) + /api/download route
youtube-embed.html      ← Main page
style.css               ← All styling
js/
  state.js              ← Shared global variables (player, speed index)
  player.js             ← YouTube IFrame API integration, embed code generation
  speed.js              ← Playback speed bar UI and logic
  fullscreen.js         ← Custom fullscreen button and keyboard handler
  download.js           ← Download Video button logic
  shortcuts.js          ← All keyboard shortcuts
```

### Script Load Order

The scripts are loaded in dependency order at the bottom of `youtube-embed.html`:

```
state.js → speed.js → fullscreen.js → player.js → download.js → shortcuts.js
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

### Download Video
Click **Download Video** to save the video as an `.mp4` file. The server spawns `python -m yt_dlp` to fetch the best available video+audio streams, merges them with `ffmpeg`, and streams the result back to your browser as a normal file download (nothing is kept on disk afterward — the temp file is deleted once the response finishes).

> **Note:** `--no-check-certificate` is passed to yt-dlp because some networks run SSL-inspecting content filters that break normal certificate validation. If a network actively blocks YouTube traffic outright (rather than just intercepting TLS), downloads will fail with a `502` and the underlying yt-dlp error message regardless of this flag — that's a network-level block, not something this app can route around.

### Playback Speed
A speed bar below the video lets you select from `0.25x` to `2x`. The active speed is highlighted in red. Resets to `1×` on every new video.

### Custom Full-screen
A custom full-screen button overlays the video (visible on hover). It puts the **wrapper div** — not the YouTube i-frame — into full-screen. This keeps keyboard focus on the parent page so all shortcuts continue working while full-screen.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `K` or `Space` | Play / Pause |
| `F` | Toggle full-screen |
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

Shortcuts work even while the video is playing inside the i-frame, because `shortcuts.js` reclaims window focus via the `blur` event.

---

## File Reference

| File | Responsibility |
|------|---------------|
| `start.bat` | Windows launcher. Opens the browser to `http://localhost:3010` then starts `node server.js` in the same window. Double-click to run the whole app in one step. |
| `server.js` | Minimal Node.js HTTP server. Serves static files, strips query strings before resolving file paths, returns correct MIME types. Also handles `GET /api/download?url=...`: spawns `python -m yt_dlp`, merges streams with `ffmpeg`, and pipes the resulting file back as the HTTP response. |
| `youtube-embed.html` | Page structure. Loads the YouTube IFrame API script and all JS modules. |
| `style.css` | Dark theme styling. Includes layout (3-column grid to keep the video centered alongside the shortcuts panel), video wrapper, speed bar, embed code box, and responsive breakpoints. |
| `js/state.js` | Declares `player`, `SPEEDS`, and `currentSpeedIdx` as global shared across all modules. |
| `js/player.js` | `extractVideoId()` parses URLs. `handleEmbed()` creates or reloads the `YT.Player` instance. `copyCode()` writes the embed snippet to the clipboard. |
| `js/download.js` | `downloadVideo()` calls `/api/download`, reads the filename from the `Content-Disposition` header, and triggers a browser file download from the response blob. |
| `js/speed.js` | `buildSpeedButtons()` renders the speed bar. `setSpeed(idx)` updates both the player rate and the active button highlight. |
| `js/fullscreen.js` | `setupCustomFullscreen()` injects the overlay button and strips the i-frame's native full-screen permission. `toggleFullscreen()` calls the browser Full-screen API on the wrapper. |
| `js/shortcuts.js` | Single `keydown` listener handles all shortcuts. Also wires the Enter key on the URL input. |
