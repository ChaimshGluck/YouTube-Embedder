const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = 3010;
const DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
};

// Only allow requests for actual YouTube URLs — this is passed as an argument
// to yt-dlp (not a shell), but restricting the host still guards against the
// server being used as an arbitrary URL fetcher.
function isYouTubeUrl(rawUrl) {
  try {
    const { hostname, protocol } = new URL(rawUrl);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(hostname);
  } catch {
    return false;
  }
}

function handleDownload(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const videoUrl = searchParams.get('url');

  if (!videoUrl || !isYouTubeUrl(videoUrl)) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing or invalid YouTube URL');
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdl-'));
  const outputTemplate = path.join(tmpDir, '%(title).200B [%(id)s].%(ext)s');

  const args = [
    '-m', 'yt_dlp',
    '--no-playlist',
    '--no-check-certificate', // this network's filter MITMs YouTube's TLS; see README
    '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '-o', outputTemplate,
    videoUrl,
  ];

  const proc = spawn('python', args, { windowsHide: true });

  let stderr = '';
  proc.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const timeout = setTimeout(() => {
    proc.kill();
  }, 10 * 60 * 1000); // 10 minute safety cap

  proc.on('error', (err) => {
    clearTimeout(timeout);
    cleanup(tmpDir);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Failed to start yt-dlp: ${err.message}`);
    }
  });

  proc.on('close', (code) => {
    clearTimeout(timeout);

    if (code !== 0) {
      cleanup(tmpDir);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end(`yt-dlp failed:\n${stderr.slice(-2000)}`);
      }
      return;
    }

    const files = fs.readdirSync(tmpDir);
    if (files.length === 0) {
      cleanup(tmpDir);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('yt-dlp reported success but produced no file');
      return;
    }

    const filename = files[0];
    const filePath = path.join(tmpDir, filename);
    const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");

    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': fs.statSync(filePath).size,
      'Content-Disposition':
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
    readStream.on('close', () => cleanup(tmpDir));
    readStream.on('error', () => cleanup(tmpDir));
  });
}

function cleanup(tmpDir) {
  fs.rm(tmpDir, { recursive: true, force: true }, () => {});
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  if (urlPath === '/api/download') {
    handleDownload(req, res);
    return;
  }

  // Strip query string (?v=...&t=...) before resolving the file path,
  // otherwise path.join includes it and the file lookup fails with a 404.
  let filePath = path.join(DIR, urlPath === '/' ? 'youtube-embed.html' : urlPath);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
