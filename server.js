const http = require('http');
const fs = require('fs');
const path = require('path');

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

const server = http.createServer((req, res) => {
  // Strip query string (?v=...&t=...) before resolving the file path,
  // otherwise path.join includes it and the file lookup fails with a 404.
  const urlPath = req.url.split('?')[0];

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
