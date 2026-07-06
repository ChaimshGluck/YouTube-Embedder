const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

// Hosts like Render/Railway/Fly inject the port to bind via $PORT; fall back to
// 3010 for local `node server.js`.
const PORT = process.env.PORT || 3010;
const DIR = __dirname;

// `python` on Windows, but Debian-based container images ship `python3`. Let the
// runtime override which interpreter launches yt-dlp (see Dockerfile).
const PYTHON_BIN = process.env.PYTHON_BIN || "python";

// Cloud/datacenter IPs (e.g. Render) get YouTube's "confirm you're not a bot"
// 429 block. Passing exported YouTube cookies authenticates the request and
// usually clears it. Set YTDLP_COOKIES to the path of a Netscape-format
// cookies.txt (on Render, a Secret File mounted at /etc/secrets/...). Unset
// locally — a residential IP doesn't need it. See README.
const COOKIES_FILE = process.env.YTDLP_COOKIES;

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

// Only allow requests for actual YouTube URLs — this is passed as an argument
// to yt-dlp (not a shell), but restricting the host still guards against the
// server being used as an arbitrary URL fetcher.
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
    "--no-check-certificate", // this network's filter MITMs YouTube's TLS; see README
    // Prefer H.264 (avc1) video so the resulting mp4 plays in every player and
    // editor. YouTube also serves AV1/VP9 in mp4, which many older players and
    // editing tools can't decode, so we pin avc1 first and only fall back to a
    // generic mp4 / best stream when no H.264 rendition exists.
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

  const proc = spawn(PYTHON_BIN, args, { windowsHide: true });

  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const timeout = setTimeout(
    () => {
      proc.kill();
    },
    10 * 60 * 1000,
  ); // 10 minute safety cap

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

  // Strip query string (?v=...&t=...) before resolving the file path,
  // otherwise path.join includes it and the file lookup fails with a 404.
  let filePath = path.join(
    DIR,
    urlPath === "/" ? "youtube-embed.html" : urlPath,
  );
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
  console.log("Press Ctrl+C to stop.");
});
