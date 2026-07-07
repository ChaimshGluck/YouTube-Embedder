# Handoff: deploy the YouTube downloader on the existing DigitalOcean droplet

Paste this whole file into a fresh Claude Code session on the device that has
the DigitalOcean project (and this YouTube-Embedder code) open. It is written to
be **self-contained** — do not assume the code here matches git, because the
branches have diverged (see "Git reality" below). Verify against the embedded
file contents.

---

## What this project is

`YouTube-Embedder` — a plain Node.js app (no framework, no build step). `server.js`
is a hand-rolled HTTP server that:

- Serves the static frontend (`youtube-embed.html`, `style.css`, `js/*`) — paste a
  YouTube URL, preview via the IFrame API, copy an `<iframe>` embed snippet,
  keyboard shortcuts.
- Exposes `GET /api/download?url=...` which spawns `yt-dlp` (as `python -m yt_dlp`)
  + `ffmpeg` to download the video and streams the resulting `.mp4` back to the
  browser. Temp files are written to a per-request temp dir and deleted after the
  response finishes.

Frontend and API are the **same** Node process, and `js/download.js` calls the
**relative** path `/api/download`, so wherever `server.js` is hosted, the download
button "just works" with no CORS config.

---

## The goal (decided with the user)

The user wants the downloader available as an **always-on deployed app** — paste a
link at any time from any normal device, no local server to start, no
prerequisites. Priorities, in order:

1. **Always-on / zero prerequisites** (most important).
2. **Cheapest possible**, but willing to pay a little if genuinely needed.

Decision: **co-host this app on the user's EXISTING DigitalOcean droplet** as an
additional service on **another endpoint** (a subdomain like
`downloader.<their-domain>` or a path). Marginal cost ≈ $0 since the droplet is
already paid for. This beats a new VPS or Render.

---

## Why this is non-trivial: the datacenter-IP problem (read this)

The app works **perfectly from a residential IP** (verified this session: real
playable H.264 mp4s downloaded locally AND through a Docker container). The
problem is **only** on cloud/datacenter IPs:

- YouTube flags datacenter IP ranges as bots → `HTTP 429 Too Many Requests` and
  `Sign in to confirm you're not a bot`.
- This is **IP reputation**, not a code or library bug. Switching libraries
  (youtube-dl, pytube, ytdl-core, etc.) does NOT help — same IP, same block.
- A DigitalOcean droplet is still a datacenter IP, BUT a **dedicated** one (not a
  shared/abused free-tier IP like Render), which removes the "429 from neighbors"
  failure mode. That's why the droplet is a better bet than Render free.

The documented mitigations (from yt-dlp maintainers + wiki — links at bottom):

1. **Cookies** from a **throwaway** Google account (never the user's main
   account — Google can flag accounts whose cookies are used from datacenter IPs).
   Helps, but not guaranteed alone.
2. **PO Tokens** (Proof-of-Origin) — increasingly REQUIRED by YouTube. On a
   headless server you run a provider (the `bgutil` POT provider) that generates
   them automatically. **Cookies + PO token is the current best-practice combo
   for datacenter hosts.**
3. **Residential proxy** — the only essentially-bulletproof fix, but bills
   PER GIGABYTE, and videos are large, so cost is unpredictable. Keep this as the
   BACKSTOP (wire in a `YTDLP_PROXY` env var), only enable if 1+2 aren't enough.

**Honest expectation to set with the user:** dedicated droplet IP + cookies + PO
token has a genuinely good shot at personal-scale volume, but is NOT guaranteed —
YouTube's detection is aggressive even on dedicated datacenter IPs. If it still
gets blocked, the residential proxy backstop is the reliable escalation. Don't
over-promise reliability on any datacenter host.

---

## The plan to implement on the droplet

### Target architecture — `docker-compose` with two services

```yaml
# docker-compose.yml (new file, to create)
services:
  app:
    build: .
    restart: unless-stopped
    environment:
      - PYTHON_BIN=python3
      - NODE_ENV=production
      - PORT=3010
      # Point yt-dlp's bgutil plugin at the POT provider service:
      - POT_PROVIDER_URL=http://pot-provider:4416
      # Cookies: mount a throwaway-account cookies.txt (see volumes) and point here:
      - YTDLP_COOKIES=/run/cookies/cookies.txt
      # Backstop only — leave unset unless cookies+POT still get blocked:
      # - YTDLP_PROXY=http://user:pass@residential-proxy-host:port
    volumes:
      # Provide cookies.txt on the host; NEVER bake it into the image or commit it.
      - /opt/youtube-embedder/cookies.txt:/run/cookies/cookies.txt:ro
    # Do NOT publish a host port if it sits behind the existing reverse proxy on
    # the same docker network; otherwise map e.g. "127.0.0.1:3010:3010".
    expose:
      - "3010"

  pot-provider:
    image: brainicism/bgutil-ytdlp-pot-provider:latest
    restart: unless-stopped
    expose:
      - "4416"
```

> The two services must share a docker network so `app` can reach
> `http://pot-provider:4416`. If the droplet's existing reverse proxy (nginx /
> Caddy / Traefik) runs in Docker, attach `app` to that same network so the proxy
> can route to it. If the proxy is on the host (bare nginx), publish the app on
> `127.0.0.1:3010` and proxy_pass to it.

### `server.js` changes needed (small — add proxy + POT support)

The current `server.js` already supports `PORT`, `PYTHON_BIN`, and
`YTDLP_COOKIES`. **Add two more env vars** near the other `const` declarations:

```js
// Residential-proxy backstop for when a datacenter IP is blocked even with
// cookies + PO tokens. Unset by default. See HANDOFF/README.
const YTDLP_PROXY = process.env.YTDLP_PROXY;

// bgutil PO Token provider base URL (the pot-provider service). Lets yt-dlp
// obtain Proof-of-Origin tokens YouTube now requires on datacenter IPs.
const POT_PROVIDER_URL = process.env.POT_PROVIDER_URL;
```

Then, in `handleDownload`, right after the existing `if (COOKIES_FILE) {...}`
block and BEFORE `spawn(...)`, add:

```js
if (YTDLP_PROXY) {
  args.push("--proxy", YTDLP_PROXY);
}
if (POT_PROVIDER_URL) {
  args.push(
    "--extractor-args",
    `youtubepot-bgutilhttp:base_url=${POT_PROVIDER_URL}`,
  );
}
```

### `Dockerfile` change needed (add the POT client plugin)

The current Dockerfile installs Node + Python + yt-dlp + ffmpeg + Deno. **Add the
bgutil yt-dlp client plugin** to the same `pip install` line (or a new one):

```dockerfile
RUN pip3 install --no-cache-dir --break-system-packages -U yt-dlp bgutil-ytdlp-pot-provider
```

> NOTE: the `bgutil` plugin package name / provider image and the exact
> `--extractor-args` key can change over time. Confirm against the current
> **yt-dlp PO Token Guide** before finalizing:
> https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide

### Optional cleanup

`server.js` still passes `--no-check-certificate` with a comment about a network
TLS filter. That was for a different, now-irrelevant environment. On a clean
droplet it's unnecessary and slightly weakens TLS validation — you may remove that
arg (and its comment) unless the droplet's egress needs it.

---

## Step-by-step for the receiving Claude

1. **Discover the existing droplet setup FIRST** (the user diverted here before
   answering how their existing project is deployed). Run / ask for:
   - `docker ps` and `docker network ls` (is there Docker? a compose stack?)
   - reverse proxy? `nginx -v` / `caddy version` / check for Traefik container
   - `df -h` and `free -m` (disk + RAM — video merges are transiently heavy; make
     sure there's room for temp mp4 files, which can be hundreds of MB–GBs)
   - what domain/subdomains are available to point at this app
2. **Reconcile the code** (see Git reality) — make sure the droplet-side repo has
   the current `server.js` + `Dockerfile` (embedded below) plus the new
   `docker-compose.yml` and the two `server.js`/`Dockerfile` edits above.
3. **Wire the endpoint** into the existing reverse proxy (new subdomain preferred;
   TLS via the proxy's existing mechanism — Let's Encrypt/Caddy auto, etc.).
4. **Get cookies onto the droplet** as `/opt/youtube-embedder/cookies.txt`
   (throwaway account; `chmod 600`; never committed / never in the image).
5. `docker compose up -d --build`, then test end-to-end from a browser: paste a
   real, modern YouTube URL and confirm a playable mp4 downloads.
6. If blocked despite cookies + POT: set `YTDLP_PROXY` to a residential proxy and
   redeploy. Tell the user about the per-GB cost tradeoff.
7. Update `README.md` deployment section to document the droplet/compose setup.

## What the USER must provide

- A **throwaway Google account** and its exported YouTube `cookies.txt`
  (Netscape format — e.g. a "Get cookies.txt" browser extension while logged in).
- A **subdomain / DNS record** (or a path) on the droplet's domain for this app.
- **SSH/root access** to the droplet (the receiving Claude will need to inspect
  and deploy).
- (Only if needed) a **residential proxy** subscription for the backstop.

---

## Git reality (important)

- On the "web-embedder dev" device, local `main` had this session's commits
  `eec4bd8` (container deploy) and `8262849` (cookie support), but they were
  **NOT pushed** (that device authenticates to GitHub as `cgluck2`, which lacks
  write access to `ChaimshGluck/YouTube-Embedder` → 403).
- Meanwhile `origin/main` is at `a61e559`, a commit the dev device does NOT have —
  so the branches have **diverged**. Do not assume any device is authoritative.
- **Therefore: treat the embedded file contents below as the source of truth** for
  the app + download route, and merge/apply carefully rather than blind-pulling.
- If this device (the DO one) can push as `ChaimshGluck`, consider consolidating
  history here after applying the changes.

---

## Embedded source of truth

### `server.js` (current — apply the proxy/POT edits described above on top)

```js
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const PORT = process.env.PORT || 3010;
const DIR = __dirname;

const PYTHON_BIN = process.env.PYTHON_BIN || "python";

// Set YTDLP_COOKIES to the path of a Netscape-format cookies.txt to authenticate
// yt-dlp on datacenter IPs (throwaway account). Unset locally.
const COOKIES_FILE = process.env.YTDLP_COOKIES;

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

function isYouTubeUrl(rawUrl) {
  try {
    const { hostname, protocol } = new URL(rawUrl);
    if (protocol !== "https:" && protocol !== "http:") return false;
    return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(hostname);
  } catch {
    return false;
  }
}

function handleDownload(req, res) {
  const { searchParams } = new URL(req.url, "http://localhost");
  const videoUrl = searchParams.get("url");

  if (!videoUrl || !isYouTubeUrl(videoUrl)) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Missing or invalid YouTube URL");
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ytdl-"));
  const outputTemplate = path.join(tmpDir, "%(title).200B [%(id)s].%(ext)s");

  const args = [
    "-m",
    "yt_dlp",
    "--no-playlist",
    // Prefer H.264 (avc1) so the mp4 plays everywhere; fall back to any mp4/best.
    "-f",
    "bv*[vcodec^=avc1]+ba[ext=m4a]/b[vcodec^=avc1]/b[ext=mp4]/best",
    "--merge-output-format",
    "mp4",
    "-o",
    outputTemplate,
    videoUrl,
  ];

  if (COOKIES_FILE) {
    args.push("--cookies", COOKIES_FILE);
  }
  // >>> ADD HERE (see plan): YTDLP_PROXY --proxy, and POT_PROVIDER_URL extractor-args

  const proc = spawn(PYTHON_BIN, args, { windowsHide: true });

  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const timeout = setTimeout(() => {
    proc.kill();
  }, 10 * 60 * 1000);

  proc.on("error", (err) => {
    clearTimeout(timeout);
    cleanup(tmpDir);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`Failed to start yt-dlp: ${err.message}`);
    }
  });

  proc.on("close", (code) => {
    clearTimeout(timeout);
    if (code !== 0) {
      cleanup(tmpDir);
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end(`yt-dlp failed:\n${stderr.slice(-2000)}`);
      }
      return;
    }
    const files = fs.readdirSync(tmpDir);
    if (files.length === 0) {
      cleanup(tmpDir);
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("yt-dlp reported success but produced no file");
      return;
    }
    const filename = files[0];
    const filePath = path.join(tmpDir, filename);
    const asciiFallback = filename
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/"/g, "'");
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": fs.statSync(filePath).size,
      "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
    readStream.on("close", () => cleanup(tmpDir));
    readStream.on("error", () => cleanup(tmpDir));
  });
}

function cleanup(tmpDir) {
  fs.rm(tmpDir, { recursive: true, force: true }, () => {});
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];
  if (urlPath === "/api/download") {
    handleDownload(req, res);
    return;
  }
  let filePath = path.join(DIR, urlPath === "/" ? "youtube-embed.html" : urlPath);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || "text/plain";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
```

### `Dockerfile` (current — add the bgutil plugin per the plan)

```dockerfile
FROM node:22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-pip ffmpeg ca-certificates curl unzip \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp + (ADD) the bgutil PO Token client plugin.
RUN pip3 install --no-cache-dir --break-system-packages -U yt-dlp bgutil-ytdlp-pot-provider

# Deno — yt-dlp auto-detects it to run YouTube's nsig JS challenge (else 403).
RUN curl -fsSL https://deno.land/install.sh | sh
ENV PATH="/root/.deno/bin:${PATH}"

ENV PYTHON_BIN=python3
ENV NODE_ENV=production

WORKDIR /app
COPY . .

EXPOSE 3010
CMD ["node", "server.js"]
```

### `.gitignore` / `.dockerignore` must include (cookies are live credentials)

```
cookies.txt
*.cookies.txt
```

---

## Sources (why the plan is what it is)

- yt-dlp FAQ — passing cookies: https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp
- yt-dlp PO Token Guide: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
- Bot check on datacenter IPs (#12264 → #10128): https://github.com/yt-dlp/yt-dlp/issues/12264
- 429 on cloud/VPS IPs (#7143): https://github.com/yt-dlp/yt-dlp/issues/7143
- Cookies not always sufficient (#12045): https://github.com/yt-dlp/yt-dlp/issues/12045
- Cloud-host sign-in fix writeup: https://www.technetexperts.com/fix-yt-dlp-cloud-signin-error/
